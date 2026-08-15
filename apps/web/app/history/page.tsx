"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  LayoutGrid,
  PencilLine,
  Share2,
} from "lucide-react";
import { parseServerDateTime, serverDateTimeToMillis } from "@harucut/shared";
import { getImageUrlByKey } from "@/lib/presignedUploadApi";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { AppNav } from "@/components/layout/AppNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { downloadFromUrl } from "@/lib/canvas/composeFrame";
import { buildDownloadFilename } from "@/lib/fourcutOutput";
import { shareOrCopyLink } from "@/lib/share";
import {
  getUserMediaPreviewUrl,
  getUserMediaTitle,
} from "@/lib/userMediaPreview";
import {
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
  const candidates = [item.downloadUrl, item.originalFileName, item.s3Key];

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
    : "hc-surface-well relative grid aspect-[3/4] place-items-center overflow-hidden rounded-[18px] border bg-[color:var(--hc-surface-inset)] p-2.5 transition group-hover:border-[color:var(--hc-border-strong)]";

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
        <div className="grid h-full w-full place-items-center px-2 text-center text-[10px] text-[color:var(--hc-muted-soft)]">
          미리보기를 준비하는 중이에요.
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  const [view, setView] = useState<ViewMode>("grid");
  const [items, setItems] = useState<UserMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [savingNameId, setSavingNameId] = useState<number | null>(null);
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

  useEffect(() => {
    if (!feedback) return undefined;

    const timeoutId = window.setTimeout(() => {
      setFeedback(null);
    }, 2400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [feedback]);

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
      alert(
        getUserFacingApiErrorMessage(
          downloadError,
          "다운로드를 준비하지 못했어요.",
        ),
      );
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
        setFeedback("공유 링크를 복사했어요. 링크는 하루 동안 열려 있어요.");
      } else if (result === "shared") {
        setFeedback("공유 창을 열었어요.");
      }
    } catch (shareError) {
      console.error(shareError);
      alert(
        getUserFacingApiErrorMessage(
          shareError,
          "공유 링크를 준비하지 못했어요.",
        ),
      );
    } finally {
      setSharingId(null);
    }
  };

  const handleStartRename = (item: UserMedia) => {
    setEditingId(item.mediaId);
    setDraftName(getUserMediaTitle(item));
  };

  const handleSaveName = async (item: UserMedia) => {
    const nextName = draftName.trim();
    if (!nextName) {
      setFeedback("파일 이름은 비워둘 수 없어요.");
      return;
    }

    setSavingNameId(item.mediaId);

    try {
      const updated = await updateMediaDisplayName(item.mediaId, nextName);
      const resolvedName =
        updated.displayName?.trim() || updated.displayname?.trim() || nextName;

      setItems((current) =>
        current.map((currentItem) =>
          currentItem.mediaId === item.mediaId
            ? { ...currentItem, displayName: resolvedName }
            : currentItem,
        ),
      );
      setEditingId(null);
      setDraftName("");
      setFeedback("파일 이름을 수정했어요.");
    } catch (renameError) {
      console.error(renameError);
      setFeedback("파일 이름을 수정하지 못했어요.");
    } finally {
      setSavingNameId(null);
    }
  };

  return (
    <main className="hc-page-app min-h-dvh pb-[90px] text-[color:var(--hc-text)] lg:pb-0">
      <AppNav />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:py-6 lg:gap-6 lg:py-8">
        {/* 헤더 + 뷰 토글 */}
        <header className="flex flex-col gap-4 pt-1 lg:flex-row lg:items-end lg:justify-between lg:pt-3">
          <div>
            <h1 className="text-[28px] font-extrabold tracking-tight lg:text-[34px]">
              기록
            </h1>
            <p className="mt-2 text-[13.5px] text-[color:var(--hc-muted)]">
              남긴 하루컷 {loading ? "…" : items.length}개
              {planTier
                ? ` · ${PLAN_HISTORY_RETENTION_LABELS[planTier]} 기록을 볼 수 있어요`
                : ""}
            </p>
          </div>

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
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold transition ${
                    view === id
                      ? "bg-white text-[#0B0B0C]"
                      : "text-[color:var(--hc-muted)]"
                  }`}
                >
                  <Icon className="h-[15px] w-[15px]" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {feedback ? (
          <div className="hc-feedback rounded-2xl border px-4 py-3 text-[12px]">
            {feedback}
          </div>
        ) : null}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="aspect-[3/4] animate-pulse rounded-[18px] bg-[color:var(--hc-surface-muted)]"
              />
            ))}
          </div>
        ) : error ? (
          // 조회 실패를 빈 상태로 위장하지 않는다. 실패 문구 + 재시도 버튼.
          <div className="hc-surface-card flex flex-col items-center gap-3 rounded-[20px] border p-8 text-center">
            <p className="text-[13px] text-[color:var(--hc-muted)]">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((prev) => prev + 1)}
              className="hc-button-secondary rounded-full border px-5 py-2 text-[12.5px] font-semibold"
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
            <ImageIcon className="h-7 w-7 text-[color:var(--hc-muted-soft)]" />
            <p className="text-[13px] text-[color:var(--hc-muted)]">
              저장한 기록이 아직 없어요.
            </p>
            {planTier && planTier !== "PRO" ? (
              <p className="text-[12px] text-[color:var(--hc-muted-soft)]">
                {PLAN_HISTORY_RETENTION_LABELS[planTier]} 기록만 보여요. 그 전에 남긴 기록은
                지워진 게 아니라 지금 요금제에서 보이지 않는 거예요.{" "}
                <Link href="/pricing" className="underline">
                  요금제 보기
                </Link>
              </p>
            ) : null}
            <Link
              href="/shoot"
              className="hc-button-primary rounded-full px-5 py-2 text-[12.5px] font-semibold"
            >
              촬영 시작
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {groups.map((group) => (
              <section key={group.key} className="flex flex-col gap-4">
                <div className="flex items-baseline gap-2.5">
                  <h2 className="text-[19px] font-extrabold tracking-tight">
                    {group.key === "unknown" ? "기타" : monthLabel(group.key)}
                  </h2>
                  <span className="text-[12.5px] text-[color:var(--hc-muted-soft)]">
                    {group.items.length}컷
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
                  {group.items.map((item) => {
                    const isEditing = editingId === item.mediaId;

                    return (
                      <article key={item.mediaId} className="group flex flex-col gap-2.5">
                        <MediaThumb item={item} />

                        <div className="flex flex-col gap-1">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <input
                                value={draftName}
                                onChange={(e) => setDraftName(e.target.value)}
                                className="hc-input h-9 flex-1 rounded-xl border px-3 text-[12px]"
                              />
                              <button
                                type="button"
                                onClick={() => void handleSaveName(item)}
                                disabled={savingNameId === item.mediaId}
                                className="hc-button-neutral rounded-full px-3 py-2 text-[11px] font-semibold disabled:opacity-50"
                              >
                                {savingNameId === item.mediaId ? "저장 중" : "저장"}
                              </button>
                            </div>
                          ) : (
                            <p className="truncate text-[14px] font-bold tracking-tight">
                              {getUserMediaTitle(item)}
                            </p>
                          )}
                          <p className="text-[11.5px] text-[color:var(--hc-muted-soft)]">
                            {parseServerDateTime(item.createdAt)
                              ? parseServerDateTime(item.createdAt)!.toLocaleDateString(
                                  "ko-KR",
                                  { month: "long", day: "numeric" },
                                )
                              : "날짜 없음"}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleDownload(item)}
                            disabled={downloadingId === item.mediaId}
                            className="hc-button-primary flex flex-1 items-center justify-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
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
                            className="hc-button-secondary flex flex-1 items-center justify-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                            <span>
                              {sharingId === item.mediaId ? "준비 중" : "공유"}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              isEditing
                                ? setEditingId(null)
                                : handleStartRename(item)
                            }
                            className="hc-button-secondary flex items-center justify-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold"
                          >
                            <PencilLine className="h-3.5 w-3.5" />
                            <span>{isEditing ? "취소" : "이름"}</span>
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
        <CalendarDays className="h-7 w-7 text-[color:var(--hc-muted-soft)]" />
        <p className="text-[13px] text-[color:var(--hc-muted)]">
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
          <b className="min-w-[120px] text-center text-[20px] tracking-tight">
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
        <span className="text-[12.5px] text-[color:var(--hc-muted-soft)]">
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
              className={`relative flex aspect-[3/4] flex-col overflow-hidden rounded-xl border p-1.5 ${
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
                    <span className="absolute right-0 top-0 rounded-full bg-[color:var(--hc-primary)] px-1.5 text-[9px] font-extrabold text-[color:var(--hc-primary-contrast)]">
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
