"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  LayoutGrid,
  PencilLine,
  Share2,
  Trash2,
} from "lucide-react";
import { parseServerDateTime, serverDateTimeToMillis } from "@harucut/shared";
import { getImageUrlByKey } from "@/lib/presignedUploadApi";
import {
  getApiErrorDetails,
  getUserFacingApiErrorMessage,
} from "@/lib/apiError";
import { AppNav } from "@/components/layout/AppNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { RecordSourceDialog } from "@/components/shoot/RecordSourceDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SingleFieldDialog } from "@/components/ui/SingleFieldDialog";
import { downloadFromUrl } from "@/lib/canvas/composeFrame";
import { getNativeSaveErrorMessage } from "@/lib/nativeBridge";
import { buildDownloadFilename } from "@/lib/fourcutOutput";
import { shareOrCopyLink } from "@/lib/share";
import {
  getUserMediaPreviewUrl,
  getUserMediaTitle,
} from "@/lib/userMediaPreview";
import {
  deleteMedia,
  getMediaDownloadUrl,
  listMyMedia,
  updateMediaDisplayName,
} from "@/lib/userMediaApi";
import {
  PLAN_HISTORY_RETENTION_LABELS,
  resolvePlanInfo,
} from "@/constants/planLimits";
import { getMyUserInfo } from "@/lib/userApi";
import type { UserMedia } from "@/lib/api-types";

type ViewMode = "grid" | "calendar";

/**
 * 화면 맨 위 한 줄짜리 알림. 성공만이 아니라 실패도 여기로 말한다.
 *
 * 예전에는 다운로드·공유·삭제 실패를 `alert()` 로 알렸다. 브라우저 모달은 이 디자인의
 * 것이 아닌 데다, 확인을 누르기 전까지 방금 바뀐 화면을 가린다 — 마이페이지가 같은
 * 이유로 걷어낸 방식이다(app/mypage/page.tsx). 성공(초록)과 실패를 같은 색으로 그리지
 * 않으려고 종류를 함께 들고 다닌다.
 */
type Notice = { kind: "ok" | "error"; text: string };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTH_KO = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
];

function getMediaExtension(item: UserMedia) {
  const candidates = [item.downloadUrl, item.s3Key];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const normalized = candidate.split("?")[0] ?? candidate;
    const match = normalized.match(/\.([a-z0-9]+)$/i);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }

  return "png";
}

function getItemTime(item: UserMedia) {
  return serverDateTimeToMillis(item.createdAt);
}

function sortMedia(items: UserMedia[]) {
  return [...items].sort((a, b) => getItemTime(b) - getItemTime(a));
}

/** YYYY-MM 키 (createdAt 기준). 날짜 정보가 없으면 null. */
function monthKey(item: UserMedia) {
  const date = parseServerDateTime(item.createdAt);
  if (!date) return null;
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  const thisYear = new Date().getFullYear();
  const prefix = year === thisYear ? "" : `${year}년 `;
  return `${prefix}${MONTH_KO[(month ?? 1) - 1]}`;
}

/** createdAt 기준 월별 그룹. 날짜 없는 항목은 '기타'로 마지막에 묶는다. */
function groupByMonth(items: UserMedia[]) {
  const map = new Map<string, UserMedia[]>();
  for (const item of items) {
    const key = monthKey(item) ?? "unknown";
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }

  return [...map.keys()]
    .sort((a, b) => {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return a < b ? 1 : -1;
    })
    .map((key) => ({ key, items: map.get(key) ?? [] }));
}

function MediaThumb({
  item,
  bare = false,
}: {
  item: UserMedia;
  bare?: boolean;
}) {
  const previewUrl = getUserMediaPreviewUrl(item);

  const shellClassName = bare
    ? "relative grid h-full w-full place-items-center overflow-hidden"
    : "hc-surface-well relative grid aspect-3/4 place-items-center overflow-hidden rounded-[18px] border bg-(--hc-surface-inset) p-2.5 transition group-hover:border-(--hc-border-strong)";

  return (
    <div className={shellClassName}>
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={getUserMediaTitle(item)}
          className={`absolute inset-0 h-full w-full object-contain ${bare ? "p-1" : "p-3"}`}
        />
      ) : (
        <div className="grid h-full w-full place-items-center px-2 text-center text-[11px] text-(--hc-muted)">
          미리보기를 준비하는 중이에요.
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  const [view, setView] = useState<ViewMode>("grid");
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [items, setItems] = useState<UserMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Notice | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [sharingId, setSharingId] = useState<number | null>(null);
  // 이름 바꾸기는 카드 안이 아니라 다이얼로그에서 한다(SingleFieldDialog 주석 참고).
  // 대상 자체를 들고 있어야 다이얼로그가 지금 이름을 초깃값으로 받을 수 있다.
  const [renameTarget, setRenameTarget] = useState<UserMedia | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [savingNameId, setSavingNameId] = useState<number | null>(null);
  // 삭제는 되돌릴 수 없다. 한 번 더 묻는 대상(카드)을 들고 있는다.
  const [deleteTarget, setDeleteTarget] = useState<UserMedia | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [monthCursor, setMonthCursor] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // 서버가 요금제 보관 기간을 넘긴 기록을 목록에서 잘라 내려주므로, "없음"과 "기간 만료"를
  // 구분해 안내하려면 요금제를 알아야 한다(조회 실패 시 null → 기간 안내를 생략한다).
  const [planTier, setPlanTier] = useState<"BASIC" | "PLUS" | "PRO" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      setLoading(true);
      setError(null);

      try {
        // 미디어는 사진 전용이라 타입 구분 없이 전체를 한 번만 받아온다.
        const media = await listMyMedia();

        if (!cancelled) {
          setItems(sortMedia(media));
        }

        // 보관 기간 안내용. 실패해도 목록 자체는 이미 받았으므로 조용히 넘어간다.
        try {
          const user = await getMyUserInfo();
          if (!cancelled) setPlanTier(resolvePlanInfo(user.planTier).name);
        } catch {
          if (!cancelled) setPlanTier(null);
        }
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) {
          setItems([]);
          setError(
            getUserFacingApiErrorMessage(loadError, "기록을 불러오지 못했어요."),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadItems();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // 성공만 잠깐 떴다 사라진다. 실패는 남긴다 — 사용자가 무엇을 해야 하는지 읽을 시간이
  // 필요하고, 대개 다시 시도해야 한다(마이페이지와 같은 규칙).
  useEffect(() => {
    if (feedback?.kind !== "ok") return undefined;

    const timeoutId = window.setTimeout(() => {
      setFeedback(null);
    }, 2400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [feedback]);

  /**
   * 홈의 「최근 기록」 카드가 `/history#media-<id>` 로 들어온다.
   *
   * SPA 이동이라 첫 렌더는 아직 불러오는 중이고 `media-<id>` 요소가 없다. 브라우저·Next 의
   * 해시 스크롤은 그 시점에 한 번 시도하고 끝나서, 목록이 그려진 뒤에는 아무 일도 일어나지
   * 않는다. 결국 어느 카드를 눌러도 목록 맨 위였다. 목록이 채워진 뒤에 직접 찾아 옮긴다.
   */
  const scrolledToHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || items.length === 0) return;

    const hash = window.location.hash;
    if (!hash || !hash.startsWith("#media-")) return;
    // 같은 해시로 두 번 옮기지 않는다(목록이 갱신될 때마다 화면이 튀지 않게).
    if (scrolledToHashRef.current === hash) return;

    const target = document.getElementById(hash.slice(1));
    if (!target) return;

    scrolledToHashRef.current = hash;
    target.scrollIntoView({ block: "center" });
  }, [loading, items, view]);

  const groups = useMemo(() => groupByMonth(items), [items]);

  // 달력용: 날짜가 있는 월만 모아 정렬한다.
  const calendarMonths = useMemo(() => {
    const keys = new Set<string>();
    for (const item of items) {
      const key = monthKey(item);
      if (key) keys.add(key);
    }
    return [...keys].sort((a, b) => (a < b ? 1 : -1));
  }, [items]);

  const activeMonth = useMemo(() => {
    if (monthCursor && calendarMonths.includes(monthCursor)) return monthCursor;
    return calendarMonths[0] ?? null;
  }, [monthCursor, calendarMonths]);

  const handleDownload = async (item: UserMedia) => {
    setDownloadingId(item.mediaId);

    try {
      const url = await getMediaDownloadUrl(item.mediaId);
      await downloadFromUrl(
        url,
        buildDownloadFilename(getUserMediaTitle(item), getMediaExtension(item)),
      );
    } catch (downloadError) {
      console.error(downloadError);
      setFeedback({
        kind: "error",
        // 네이티브 안내를 먼저 본다 — 사진첩 권한이 막힌 실패는 재시도로 풀리지 않아
        // 폴백 문구("잠시 후 다시 시도해 주세요")가 거짓말이 된다(lib/nativeBridge.ts).
        // 문구는 결과 화면과 한 벌로 맞춘다(app/shoot/result/page.tsx) — 같은 실패를
        // 두 화면이 다르게 말하지 않는다.
        text: `이미지를 다운로드하지 못했어요. ${
          getNativeSaveErrorMessage(downloadError) ??
          getUserFacingApiErrorMessage(
            downloadError,
            "잠시 후 다시 시도해 주세요.",
          )
        }`,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleShare = async (item: UserMedia) => {
    setSharingId(item.mediaId);

    try {
      // 다운로드 URL은 Content-Disposition: attachment가 박혀 있어 링크를 받은 사람에게
      // 이미지가 바로 보이지 않는다. 공유에는 인라인 조회 URL을 쓴다(둘 다 24시간 유효).
      const url =
        (await getImageUrlByKey(item.s3Key)) ??
        (await getMediaDownloadUrl(item.mediaId));
      const result = await shareOrCopyLink({
        title: `${getUserMediaTitle(item)} | 하루컷`,
        text: "사진 공유 링크",
        url,
      });

      if (result === "copied") {
        setFeedback({
          kind: "ok",
          text: "공유 링크를 복사했어요. 링크는 하루 동안 열려 있어요.",
        });
      } else if (result === "shared") {
        setFeedback({ kind: "ok", text: "공유 창을 열었어요." });
      }
    } catch (shareError) {
      console.error(shareError);
      setFeedback({
        kind: "error",
        text: getUserFacingApiErrorMessage(
          shareError,
          "공유 링크를 준비하지 못했어요.",
        ),
      });
    } finally {
      setSharingId(null);
    }
  };

  const handleStartRename = (item: UserMedia) => {
    setRenameTarget(item);
    setRenameError(null);
  };

  // 다이얼로그가 마운트될 때마다 포커스를 잡으므로, 닫기 함수는 값이 바뀌지 않아야 한다.
  // 인라인 화살표로 넘기면 페이지가 다시 그려질 때마다 포커스가 첫 컨트롤로 튄다.
  const handleCloseRename = useCallback(() => {
    setRenameTarget(null);
    setRenameError(null);
  }, []);

  const handleSaveName = async (item: UserMedia, nextName: string) => {
    setSavingNameId(item.mediaId);
    setRenameError(null);

    try {
      const updated = await updateMediaDisplayName(item.mediaId, nextName);
      const resolvedName = updated.displayName?.trim() || nextName;

      setItems((current) =>
        current.map((currentItem) =>
          currentItem.mediaId === item.mediaId
            ? { ...currentItem, displayName: resolvedName }
            : currentItem,
        ),
      );
      setRenameTarget(null);
      setFeedback({ kind: "ok", text: "이름을 바꿨어요." });
    } catch (error_) {
      console.error(error_);
      // 다이얼로그를 연 채로 사유를 보여 준다 — 뒤편 안내는 가려서 보이지 않는다.
      setRenameError(
        getUserFacingApiErrorMessage(error_, "이름을 바꾸지 못했어요."),
      );
    } finally {
      setSavingNameId(null);
    }
  };

  /**
   * 사진 삭제.
   *
   * 서버가 지운 뒤 목록에서도 뺀다. 다시 불러오지 않고 손으로 빼는 이유는, 전체 재조회가
   * 페이지를 순회하는 비싼 호출이라(listMyMedia) 한 장 지우자고 치를 값이 아니어서다.
   *
   * 404 를 실패로 보여 주지 않는다 — 이미 없는 사진을 지우려 한 것이고, 사용자가 원한
   * 상태(목록에 없음)는 이미 이뤄졌다. 화면에서만 빼면 된다.
   */
  const handleDelete = async (item: UserMedia) => {
    setDeletingId(item.mediaId);
    try {
      await deleteMedia(item.mediaId);
      setItems((current) =>
        current.filter((currentItem) => currentItem.mediaId !== item.mediaId),
      );
      setDeleteTarget(null);
      setFeedback({ kind: "ok", text: "사진을 지웠어요." });
    } catch (error_) {
      console.error(error_);
      const { status } = getApiErrorDetails(error_);
      if (status === 404) {
        setItems((current) =>
          current.filter((currentItem) => currentItem.mediaId !== item.mediaId),
        );
        setDeleteTarget(null);
        setFeedback({ kind: "ok", text: "이미 지워진 사진이에요." });
        return;
      }
      // 확인 창을 닫고 배너로 말한다. 다이얼로그 안에 남기는 편이 낫지만 ConfirmDialog
      // 에는 실패를 그릴 자리가 없고(SingleFieldDialog 의 `error` 같은 것), 연 채로
      // 배너를 띄우면 그 배너가 다이얼로그에 가려 아무것도 보이지 않는다. 이름 바꾸기와
      // 달리 여기서는 잃을 입력값도 없다.
      setDeleteTarget(null);
      setFeedback({
        kind: "error",
        text: getUserFacingApiErrorMessage(error_, "사진을 지우지 못했어요."),
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="hc-page-app min-h-dvh pb-[calc(90px+env(safe-area-inset-bottom))] text-(--hc-text) lg:pb-0">
      <AppNav />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:py-6 lg:gap-6 lg:py-8">
        {/* 헤더 + 뷰 토글 */}
        <header className="flex flex-col gap-4 pt-1 lg:flex-row lg:items-end lg:justify-between lg:pt-3">
          {/* 부제는 두지 않는다 — 개수는 달마다 붙은 「N컷」이 이미 말하고, 보관 기간은
              정작 필요한 자리(기록이 없을 때)에서 따로 안내한다. 늘 떠 있으면 자기
              사진을 보러 온 화면 맨 위에서 요금제부터 읽게 된다. */}
          <h1 className="text-[28px] font-extrabold tracking-tight lg:text-[34px]">
            기록
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hc-surface-well inline-flex items-center gap-1 rounded-full p-1">
              {(
                [
                  { id: "grid", label: "그리드", Icon: LayoutGrid },
                  { id: "calendar", label: "달력", Icon: CalendarDays },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition ${
                    view === id
                      ? "bg-white text-[#0B0B0C]"
                      : "text-(--hc-muted)"
                  }`}
                >
                  <Icon className="h-3.75 w-3.75" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {feedback ? (
          <div
            role="status"
            className={
              feedback.kind === "ok"
                ? "hc-feedback rounded-2xl border px-4 py-3 text-[12px]"
                : "rounded-2xl border border-(--hc-danger-border) bg-(--hc-danger-soft-bg) px-4 py-3 text-[12px] text-(--hc-danger)"
            }
          >
            {feedback.text}
          </div>
        ) : null}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="aspect-3/4 animate-pulse rounded-[18px] bg-(--hc-surface-muted)"
              />
            ))}
          </div>
        ) : error ? (
          // 조회 실패를 빈 상태로 위장하지 않는다. 실패 문구 + 재시도 버튼.
          <div className="hc-surface-card flex flex-col items-center gap-3 rounded-[20px] border p-8 text-center">
            <p role="alert" className="text-[13px] text-(--hc-muted)">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((prev) => prev + 1)}
              className="hc-button-secondary rounded-full border px-5 py-2 text-[13px] font-semibold"
            >
              다시 시도
            </button>
          </div>
        ) : view === "calendar" ? (
          <CalendarView
            items={items}
            months={calendarMonths}
            activeMonth={activeMonth}
            onChangeMonth={setMonthCursor}
          />
        ) : items.length === 0 ? (
          <div className="hc-surface-card flex flex-col items-center gap-3 rounded-[20px] border p-8 text-center">
            <ImageIcon className="h-7 w-7 text-(--hc-muted-soft)" />
            <p className="text-[13px] text-(--hc-muted)">
              저장한 기록이 아직 없어요.
            </p>
            {planTier && planTier !== "PRO" ? (
              <p className="text-[12px] text-(--hc-muted)">
                {PLAN_HISTORY_RETENTION_LABELS[planTier]} 기록만 보여요. 그 전에 남긴 기록은
                지워진 게 아니라 지금 요금제에서 보이지 않는 거예요.{" "}
                <Link href="/pricing" className="underline">
                  요금제 보기
                </Link>
              </p>
            ) : null}
            {/* 홈의 큰 카드와 같은 것을 연다 — 같은 뜻의 버튼이 화면마다 다르게
                동작하면 안 된다(여기만 카메라로 직행했다). */}
            <button
              type="button"
              onClick={() => setSourceDialogOpen(true)}
              className="hc-button-primary rounded-full px-5 py-2 text-[13px] font-semibold"
            >
              기록 남기기
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {groups.map((group) => (
              <section key={group.key} className="flex flex-col gap-4">
                <div className="flex items-baseline gap-2.5">
                  <h2 className="text-[19px] font-extrabold tracking-tight">
                    {group.key === "unknown" ? "기타" : monthLabel(group.key)}
                  </h2>
                  <span className="text-[13px] text-(--hc-muted)">
                    {group.items.length}컷
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
                  {group.items.map((item) => {
                    const title = getUserMediaTitle(item);

                    return (
                      <article
                        key={item.mediaId}
                        // 홈의 「최근 기록」 카드가 `/history#media-<id>` 로 들어온다.
                        id={`media-${item.mediaId}`}
                        className="group flex scroll-mt-24 flex-col gap-2.5 target:rounded-2xl target:outline-2 target:outline-offset-4 target:outline-(--hc-primary)"
                      >
                        <MediaThumb item={item} />

                        <div className="flex flex-col gap-1">
                          {/* 이름 옆 연필이 곧 "고치기"다 — 아래 줄에는 이 기록으로 할
                              일(저장·공유)만 남기고, 이름은 제 자리에서 손댄다.

                              연필은 카드 오른쪽 끝이 아니라 이름 바로 옆에 붙인다. 끝에
                              두면 이름이 짧을수록 멀어져 무엇을 고치는 표시인지 흐려진다.
                              이름이 길면 잘리면서 자연히 끝으로 간다. */}
                          <div className="flex items-center gap-0.5">
                            <p className="min-w-0 truncate text-[14px] font-bold tracking-tight">
                              {title}
                            </p>
                            <button
                              type="button"
                              onClick={() => handleStartRename(item)}
                              aria-label={`이름 바꾸기: ${title}`}
                              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-(--hc-muted) transition hover:bg-(--hc-surface-highlight) hover:text-(--hc-text)"
                            >
                              <PencilLine className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="text-[11px] text-(--hc-muted)">
                            {parseServerDateTime(item.createdAt)
                              ? parseServerDateTime(item.createdAt)!.toLocaleDateString(
                                  "ko-KR",
                                  { month: "long", day: "numeric" },
                                )
                              : "날짜 없음"}
                          </p>
                        </div>

                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleDownload(item)}
                            disabled={downloadingId === item.mediaId}
                            className="hc-button-secondary flex flex-1 items-center justify-center gap-1 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>
                              {downloadingId === item.mediaId ? "저장 중" : "저장"}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleShare(item)}
                            disabled={sharingId === item.mediaId}
                            className="hc-button-secondary flex flex-1 items-center justify-center gap-1 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                            <span>
                              {sharingId === item.mediaId ? "준비 중" : "공유"}
                            </span>
                          </button>
                          {/* 삭제는 되돌릴 수 없어서 저장·공유와 같은 무게로 두지 않는다.
                              글자 없이 아이콘만, 색도 한 단 낮춰 실수로 누르지 않게 한다. */}
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            disabled={deletingId === item.mediaId}
                            aria-label={`삭제: ${title}`}
                            className="hc-button-secondary grid h-11 w-11 shrink-0 place-items-center rounded-full border text-(--hc-muted) transition hover:text-(--hc-text) disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      <MobileTabBar />
      <RecordSourceDialog
        open={sourceDialogOpen}
        onClose={() => setSourceDialogOpen(false)}
      />
      {deleteTarget ? (
        <ConfirmDialog
          title="이 사진을 지울까요?"
          description={`"${getUserMediaTitle(deleteTarget)}" 를 지워요. 지운 사진은 되돌릴 수 없어요.`}
          confirmLabel="지우기"
          runningLabel="지우는 중"
          running={deletingId === deleteTarget.mediaId}
          destructive
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete(deleteTarget)}
        />
      ) : null}

      {renameTarget ? (
        <SingleFieldDialog
          key={renameTarget.mediaId}
          title="이름 바꾸기"
          label="기록 이름"
          placeholder="예: 바다에서"
          initialValue={getUserMediaTitle(renameTarget)}
          saving={savingNameId === renameTarget.mediaId}
          error={renameError}
          onClose={handleCloseRename}
          onSubmit={(nextName) => void handleSaveName(renameTarget, nextName)}
        />
      ) : null}
    </main>
  );
}

function CalendarView({
  items,
  months,
  activeMonth,
  onChangeMonth,
}: {
  items: UserMedia[];
  months: string[];
  activeMonth: string | null;
  onChangeMonth: (key: string) => void;
}) {
  if (!activeMonth) {
    return (
      <div className="hc-surface-card flex flex-col items-center gap-3 rounded-[20px] border p-8 text-center">
        <CalendarDays className="h-7 w-7 text-(--hc-muted-soft)" />
        <p className="text-[13px] text-(--hc-muted)">
          달력으로 볼 기록이 아직 없어요.
        </p>
      </div>
    );
  }

  const [year, month] = activeMonth.split("-").map(Number);
  const monthItems = items.filter((item) => monthKey(item) === activeMonth);

  const byDay = new Map<number, UserMedia[]>();
  for (const item of monthItems) {
    const created = parseServerDateTime(item.createdAt);
    if (!created) continue;
    const day = created.getDate();
    const bucket = byDay.get(day);
    if (bucket) bucket.push(item);
    else byDay.set(day, [item]);
  }

  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  const monthIndex = months.indexOf(activeMonth);
  const hasOlder = monthIndex < months.length - 1;
  const hasNewer = monthIndex > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!hasOlder}
            onClick={() => hasOlder && onChangeMonth(months[monthIndex + 1])}
            className="hc-button-secondary grid h-9 w-9 place-items-center rounded-full border disabled:opacity-40"
            aria-label="이전 달"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <b className="min-w-30 text-center text-[20px] tracking-tight">
            {year}년 {month}월
          </b>
          <button
            type="button"
            disabled={!hasNewer}
            onClick={() => hasNewer && onChangeMonth(months[monthIndex - 1])}
            className="hc-button-secondary grid h-9 w-9 place-items-center rounded-full border disabled:opacity-40"
            aria-label="다음 달"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-[13px] text-(--hc-muted)">
          이번 달 {monthItems.length}컷
        </span>
      </div>

      <div className="grid grid-cols-7 gap-2.5">
        {WEEKDAYS.map((label, index) => (
          <div
            key={label}
            className="pb-1 text-center text-[12px] font-bold"
            style={{
              color:
                index === 0
                  ? "#FF6B6B"
                  : index === 6
                    ? "#6BA6FF"
                    : "var(--hc-muted-soft)",
            }}
          >
            {label}
          </div>
        ))}

        {cells.map((day, index) => {
          const list = day ? byDay.get(day) : undefined;

          return (
            <div
              key={index}
              className={`relative flex aspect-3/4 flex-col overflow-hidden rounded-xl border p-1.5 ${
                day ? "hc-surface-card" : "border-transparent"
              }`}
            >
              {day ? (
                <span
                  className="text-[11px] font-bold"
                  style={{
                    color: list
                      ? "var(--hc-primary)"
                      : "var(--hc-muted-soft)",
                  }}
                >
                  {day}
                </span>
              ) : null}
              {list ? (
                <div className="relative mt-1 flex flex-1 items-center justify-center">
                  <MediaThumb item={list[0]} bare />
                  {list.length > 1 ? (
                    <span className="absolute right-0 top-0 rounded-full bg-(--hc-primary) px-1.5 text-[11px] font-extrabold text-(--hc-primary-contrast)">
                      +{list.length - 1}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
