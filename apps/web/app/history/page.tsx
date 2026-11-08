"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  LayoutGrid,
} from "lucide-react";
import { parseServerDateTime, serverDateTimeToMillis } from "@harucut/shared";
import { getImageUrlByKey } from "@/lib/presignedUploadApi";
import {
  getApiErrorDetails,
  getUserFacingApiErrorMessage,
} from "@/lib/apiError";
import {
  HistoryNotice,
  HistoryPhotoViewer,
  type HistoryNoticeValue,
} from "@/components/history/HistoryPhotoViewer";
import { AppNav } from "@/components/layout/AppNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { RecordSourceDialog } from "@/components/shoot/RecordSourceDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SingleFieldDialog } from "@/components/ui/SingleFieldDialog";
import { downloadFromUrl } from "@/lib/canvas/composeFrame";
import { getNativeSaveErrorMessage } from "@/lib/nativeBridge";
import { buildDownloadFilename } from "@/lib/fourcutOutput";
import { isCopyFailedError, shareOrCopyLink } from "@/lib/share";
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
import type { UserMedia } from "@/lib/api-types";

type ViewMode = "grid" | "calendar";

/**
 * 화면 맨 위 한 줄짜리 알림. 성공만이 아니라 실패도 여기로 말한다.
 *
 * 예전에는 다운로드·공유·삭제 실패를 `alert()` 로 알렸다. 브라우저 모달은 이 디자인의
 * 것이 아닌 데다, 확인을 누르기 전까지 방금 바뀐 화면을 가린다 — 마이페이지가 같은
 * 이유로 걷어낸 방식이다(app/mypage/page.tsx). 성공(초록)과 실패를 같은 색으로 그리지
 * 않으려고 종류를 함께 들고 다닌다. 크게 보는 화면이 열려 있으면 그 안에서 말한다.
 */
type Notice = HistoryNoticeValue;

/**
 * 크게 보는 사진은 주소에 둔다 — `/history?photo=<mediaId>`.
 *
 * 화면 상태로만 두면 뒤로가기(브라우저, 앱의 하드웨어 버튼 — 셸은 WebView 의 goBack 을 부른다)가
 * 보기 화면을 닫지 않고 기록 화면째 떠나 버린다. 열 때 기록을 하나 쌓고(pushState), 옆 사진으로
 * 넘길 때는 그 자리를 바꾼다(replaceState) — 몇 장을 넘겨 봤든 뒤로 한 번이면 목록이다.
 * Next 는 직접 쌓은 기록에도 자기 상태를 붙여 두고 같은 화면 안에서 되돌린다(app-router 의 history 패치).
 */
const PHOTO_PARAM = "photo";

function readPhotoParam(): number | null {
  const raw = new URLSearchParams(window.location.search).get(PHOTO_PARAM);
  const id = raw ? Number(raw) : Number.NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * 상한을 넘겨 클라이언트가 끊은 삭제인가(lib/userMediaApi.ts 의 `MediaDeleteTimeoutError`).
 *
 * 클래스가 아니라 `name` 으로 본다 — 이 화면의 테스트는 `@/lib/userMediaApi` 를 통째로
 * 목으로 갈아 끼우고, 그러면 import 한 클래스가 undefined 가 되어 `instanceof` 가 터진다.
 * clientApi 가 AbortError 를 name 으로 가려내는 것과 같은 방식이다.
 */
function isDeleteTimeoutError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "MediaDeleteTimeoutError"
  );
}

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

/** 사진 아래의 날짜 — "11.02". 값이라 모노로 세운다. */
function stripDate(item: UserMedia) {
  const date = parseServerDateTime(item.createdAt);
  if (!date) return null;
  return `${`${date.getMonth() + 1}`.padStart(2, "0")}.${`${date.getDate()}`.padStart(2, "0")}`;
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

function MediaThumb({ item }: { item: UserMedia }) {
  const previewUrl = getUserMediaPreviewUrl(item);

  /*
    사진을 칸 안에 인화물처럼 놓는다. 칸은 3:4 로 고정해 사진이 늦게 와도 목록이 밀리지 않고(#media- 스크롤이 어긋나지 않는다),
    사진은 자르지도 늘이지도 않아 세로 띠는 띠로, 가로 사진은 가로로 보인다. 칸에 테두리를 두르지 않는다 — 이 화면의 주인공은 사진이다.

    카드 전체가 버튼이라 span 으로 짓는다(버튼 안에는 div 를 둘 수 없다). 이름은 카드 글자가 읽으므로 사진의 alt 는 비운다.
  */
  return (
    <span className="relative block aspect-3/4">
      {/* 안쪽을 띄워 둔다 — 그냥 두면 큰 사진이 칸을 키워(aspect-ratio 의 min-height:auto) 줄이 어긋난다. */}
      <span className="absolute inset-0 flex items-center justify-center">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            loading="lazy"
            className="max-h-full max-w-full rounded-md object-contain shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
          />
        ) : (
          // 카드 버튼의 이름(제목·날짜)에 섞여 읽히지 않게 한다.
          <span
            aria-hidden
            className="grid h-full w-full place-items-center rounded-xl bg-(--hc-surface-muted) px-2 text-center text-[11px] text-(--hc-muted)"
          >
            미리보기를 준비하는 중이에요.
          </span>
        )}
      </span>
    </span>
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
  // 크게 보는 사진(PHOTO_PARAM 주석). `?photo=` 로 들어오면 목록이 온 뒤 그 사진이 열린다.
  // 서버에서 그릴 때는 주소를 모르지만, 목록이 비어 있어 보기 화면도 그리지 않으니 어긋나지 않는다.
  const [photoId, setPhotoId] = useState<number | null>(() =>
    typeof window === "undefined" ? null : readPhotoParam(),
  );

  // 뒤로·앞으로 가면 주소를 다시 읽는다.
  useEffect(() => {
    const onPopState = () => setPhotoId(readPhotoParam());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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

  // 없는 사진(지워졌거나 아직 목록이 안 왔다)을 가리키면 보기 화면을 그리지 않는다.
  const photoIndex =
    photoId === null ? -1 : items.findIndex((item) => item.mediaId === photoId);
  const viewing = photoIndex >= 0;

  const openPhoto = useCallback((item: UserMedia) => {
    // 목록에서 남은 지난 결과를 사진 위로 끌고 가지 않는다.
    setFeedback(null);
    setPhotoId(item.mediaId);
    window.history.pushState(
      { historyPhoto: true },
      "",
      `?${PHOTO_PARAM}=${item.mediaId}`,
    );
  }, []);

  const showPhotoAt = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return;
      setPhotoId(item.mediaId);
      // 이 화면에서 쌓은 기록인지는 그대로 들고 간다 — 닫을 때 되돌릴지 고르는 표시다.
      window.history.replaceState(
        { historyPhoto: window.history.state?.historyPhoto === true },
        "",
        `?${PHOTO_PARAM}=${item.mediaId}`,
      );
    },
    [items],
  );

  const closePhoto = useCallback(() => {
    setPhotoId(null);
    // 이 화면에서 연 것이면 쌓은 기록을 되돌린다 — 닫기와 뒤로가기가 같은 자리에 닿게.
    // `?photo=` 주소로 바로 들어왔으면 되돌릴 기록이 이 화면 것이 아니니 주소만 지운다.
    if (window.history.state?.historyPhoto === true) window.history.back();
    else window.history.replaceState({}, "", window.location.pathname);
  }, []);

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
        // 링크를 못 만든 것과 만들어 놓고 복사만 거부당한 것을 한 문구로 묶지 않는다 — 사용자가
        // 할 일이 다르다. 앞은 잠시 뒤 다시 누르면 되지만, 뒤는 복사를 허용하기 전에는 몇 번을
        // 눌러도 같은 자리에서 막힌다(lib/share.ts 의 CopyFailedError).
        text: isCopyFailedError(shareError)
          ? "링크는 만들었지만 복사가 막혔어요. 브라우저에서 복사를 허용한 뒤 다시 눌러 주세요."
          : getUserFacingApiErrorMessage(
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
    // 지운 사진을 보던 화면은 닫고 목록에서 결과를 말한다. 지우는 동안에는 확인 창이 막고
    // 있어 다른 사진으로 넘어갈 수 없으니, 시작할 때 보던 사진이 곧 지운 사진이다.
    const closeIfViewing = () => {
      if (photoId === item.mediaId) closePhoto();
    };
    try {
      await deleteMedia(item.mediaId);
      setItems((current) =>
        current.filter((currentItem) => currentItem.mediaId !== item.mediaId),
      );
      setDeleteTarget(null);
      closeIfViewing();
      setFeedback({ kind: "ok", text: "사진을 지웠어요." });
    } catch (error_) {
      console.error(error_);
      /*
        상한을 넘겨 클라이언트가 끊은 삭제(userMediaApi.ts 의 DELETE_DEADLINE_MS).

        "지우지 못했어요"라고 하지 않는다 — 끊긴 쪽에서는 요청이 서버까지 갔는지 알 수
        없어서, 실제로는 지워졌을 수 있다. 그렇게 말해 두면 다음 새로고침에서 사라진
        사진을 본 사용자가 화면을 못 믿게 된다. 같은 이유로 목록에서도 빼지 않는다 —
        반대 방향의 같은 거짓말이다. 확인할 자리(새로고침)만 알려 준다.
      */
      if (isDeleteTimeoutError(error_)) {
        setDeleteTarget(null);
        setFeedback({
          kind: "error",
          text: "응답이 없어 삭제 결과를 확인하지 못했어요. 잠시 후 목록을 새로고침해 확인해 주세요.",
        });
        return;
      }

      const { status } = getApiErrorDetails(error_);
      if (status === 404) {
        setItems((current) =>
          current.filter((currentItem) => currentItem.mediaId !== item.mediaId),
        );
        setDeleteTarget(null);
        closeIfViewing();
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
          <h1 className="text-[34px] font-extrabold leading-tight tracking-[-0.03em]">
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

        {/*
            결과는 **지금 보고 있는 자리**에 붙여 둔다.

            배너가 목록보다 위에 있어서, 아래쪽 카드에서 저장·공유·삭제를 누르면 결과가 화면
            밖에 그려졌다 — 390×844 실측으로 맨 아래 카드의 삭제가 실패했을 때 배너 top 이
            -3,917px 이었다. 삭제가 실패하면 확인 창까지 닫히므로(handleDelete) 그 자리에서는
            아무 변화도 보이지 않는다. 맨 위로 끌어올리지는 않는다 — 스크롤을 빼앗으면
            다시 시도할 카드를 놓친다.

            띠에 무대색을 까는 것은 배너 바탕이 8~16% 알파라(globals.css 의 --hc-*-soft-bg)
            아래로 흐르는 사진이 글자에 비쳐서다. 앱 네비와 같은 처리다. 네비(69px)가 뜨는
            lg 에서는 그 아래로 내린다 — z-20 이라 겹치는 1px 은 네비가 덮는다.
            바깥 여백은 안쪽 padding 으로 되돌려, 붙기 전 자리를 예전 그대로 둔다. */}
        {feedback && !viewing ? (
          <div className="sticky top-0 z-20 -mx-4 -my-2 bg-(--hc-surface-soft) px-4 py-2 backdrop-blur-md lg:top-17">
            <HistoryNotice notice={feedback} />
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
            onOpenPhoto={openPhoto}
          />
        ) : items.length === 0 ? (
          <div className="hc-surface-card flex flex-col items-center gap-3 rounded-[20px] border p-8 text-center">
            <ImageIcon className="h-7 w-7 text-(--hc-muted-soft)" />
            <p className="text-[13px] text-(--hc-muted)">
              저장한 기록이 아직 없어요.
            </p>
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
                  <h2 className="text-[18px] font-extrabold tracking-tight">
                    {group.key === "unknown" ? "기타" : monthLabel(group.key)}
                  </h2>
                  <span className="font-mono text-[12px] tabular-nums text-(--hc-muted)">
                    {group.items.length}컷
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
                  {group.items.map((item) => (
                    <article
                      key={item.mediaId}
                      // 홈의 「최근 기록」 카드가 `/history#media-<id>` 로 들어온다.
                      id={`media-${item.mediaId}`}
                      className="min-w-0 scroll-mt-24 target:rounded-2xl target:outline-2 target:outline-offset-4 target:outline-(--hc-primary)"
                    >
                      {/* 카드는 사진·이름·날짜뿐이고, 누르면 크게 본다(2026-11-09, 기록 카드 시안 C안).
                          저장·공유·지우기·이름 바꾸기는 보기 화면으로 옮겼다 — 카드마다 버튼 세 개가 줄을
                          채워, 기록이 쌓이면 사진보다 버튼이 많았다. */}
                      <button
                        type="button"
                        onClick={() => openPhoto(item)}
                        className="flex w-full flex-col gap-2.5 rounded-2xl text-left"
                      >
                        <MediaThumb item={item} />
                        <span className="flex flex-col gap-1">
                          <span className="truncate text-[14px] font-bold tracking-tight">
                            {getUserMediaTitle(item)}
                          </span>
                          <span className="font-mono text-[11px] tabular-nums text-(--hc-muted)">
                            {stripDate(item) ?? "날짜 없음"}
                          </span>
                        </span>
                      </button>
                    </article>
                  ))}
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
      {/* 아래 두 확인·입력 창보다 먼저 그린다. 창은 보기 화면 위에 뜨고(z-120 > z-110), 겹친 창의
          키보드 임자를 가르는 useModalDialog 는 z-index 가 같으면 문서 순서로 본다. */}
      {viewing ? (
        <HistoryPhotoViewer
          items={items}
          index={photoIndex}
          notice={feedback}
          downloading={downloadingId === photoId}
          sharing={sharingId === photoId}
          covered={Boolean(renameTarget || deleteTarget)}
          onIndexChange={showPhotoAt}
          onClose={closePhoto}
          onDownload={(item) => void handleDownload(item)}
          onShare={(item) => void handleShare(item)}
          onRename={handleStartRename}
          onDelete={setDeleteTarget}
        />
      ) : null}
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

/**
 * 사진 달력(2026-11-09, 달력 시안 A안).
 *
 * 기록이 있는 날은 그날 사진이 칸을 채우고, 빈 날은 숫자만 둔다. 예전에는 빈 날까지 35칸이
 * 모두 테두리 상자라 무거웠고, 기록은 손톱만 한 썸네일이라 무슨 사진인지 보이지 않았다.
 * 기록 있는 날의 숫자는 흰 바탕 위 라임색이라 잘 읽히지도 않았다 — 지금은 사진 위 어두운
 * 그러데이션에 흰 숫자다. 칸을 누르면 그날 첫 사진을 크게 보고, 하루 여러 장이면 「+N」을 붙인다.
 */
function CalendarView({
  items,
  months,
  activeMonth,
  onChangeMonth,
  onOpenPhoto,
}: {
  items: UserMedia[];
  months: string[];
  activeMonth: string | null;
  onChangeMonth: (key: string) => void;
  onOpenPhoto: (item: UserMedia) => void;
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

  const now = new Date();
  const today =
    now.getFullYear() === year && now.getMonth() + 1 === month
      ? now.getDate()
      : null;

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
          <b className="min-w-30 text-center text-[18px] tracking-tight">
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

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
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
          if (!day) return <span key={index} aria-hidden />;

          const list = byDay.get(day);
          const isToday = day === today;

          if (!list) {
            return (
              <div key={index} className="flex aspect-3/4 justify-center">
                <span
                  aria-current={isToday ? "date" : undefined}
                  className={`mt-1 grid size-7 place-items-center rounded-full text-[13px] font-semibold tabular-nums ${
                    isToday
                      ? "bg-(--hc-text) text-(--hc-surface)"
                      : "text-(--hc-muted)"
                  }`}
                >
                  {day}
                </span>
              </div>
            );
          }

          const cover = getUserMediaPreviewUrl(list[0]);
          return (
            <button
              key={index}
              type="button"
              onClick={() => onOpenPhoto(list[0])}
              aria-label={`${month}월 ${day}일 기록 ${list.length}컷`}
              aria-current={isToday ? "date" : undefined}
              className={`relative aspect-3/4 overflow-hidden rounded-xl bg-(--hc-surface-muted) ${
                isToday ? "ring-2 ring-(--hc-text)" : ""
              }`}
            >
              {cover ? (
                // 네 컷 띠는 위에서부터 채운다 — 가운데로 자르면 두 사진 사이 여백이 칸을 차지한다.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cover}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover object-top"
                />
              ) : null}
              <span
                aria-hidden
                className="absolute inset-0 bg-linear-to-b from-black/45 to-transparent to-45%"
              />
              <span
                aria-hidden
                className="absolute left-1.5 top-1 text-[12px] font-extrabold tabular-nums text-white"
              >
                {day}
              </span>
              {list.length > 1 ? (
                <span
                  aria-hidden
                  className="absolute bottom-1 right-1 rounded-full bg-black/70 px-1.5 text-[10px] font-extrabold leading-4.5 text-white"
                >
                  +{list.length - 1}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
