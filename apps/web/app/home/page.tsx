"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowRight } from "lucide-react";
import { serverDateTimeToMillis } from "@harucut/shared";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { getMyUserInfo, type UserInfo } from "@/lib/userApi";
import { listRecentMedia } from "@/lib/userMediaApi";
import type { UserMedia } from "@/lib/api-types";
import {
  getUserMediaDate,
  getUserMediaPreviewUrl,
  getUserMediaTitle,
} from "@/lib/userMediaPreview";
import { FramePreview } from "@/components/frame/FramePreview";
import { DEMO_PHOTOS } from "@/constants/demoPhotos";
import { DEMO_DECORATED_THEME } from "@/constants/demoTheme";
import { AppNav } from "@/components/layout/AppNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { RecordSourceDialog } from "@/components/shoot/RecordSourceDialog";
import { useStudioAccess } from "@/hooks/useStudioAccess";

/** 가장 최근 한 장은 큰 카드에, 나머지는 아래 줄에 놓는다. 조회도 딱 이만큼만 받는다. */
const RECENT_LIMIT = 7;

/** 큰 카드 아래의 낮은 줄. 첫 화면의 주인공은 사진과 「지금 찍기」 하나다. */
const THEME_ACTION = {
  id: "theme",
  title: "프레임 꾸미기",
  description: "만들어두면 촬영할 때 골라 써요",
  href: "/theme",
};

/** 행사를 맡은 계정에게만 보인다(hooks/useStudioAccess). */
const STUDIO_ACTION = {
  id: "studio",
  title: "행사 운영",
  description: "내 행사와 사진함을 봐요",
  href: "/studio",
};

const WEEKDAY_KO = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

/** 오늘이 며칠인지만 담는 로컬 기준 "yyyy-mm-dd" 키. 날짜가 바뀌었는지 비교하는 용도다. */
function getCurrentDateKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 제목 위 작은 날짜 — "11월 2일 월요일". 날짜 키를 받아 표기만 바꾼다 —
// 자정 갱신은 useCurrentDateKey 가 맡는다.
function formatHeadingDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${month}월 ${day}일 ${WEEKDAY_KO[date.getDay()]}`;
}

/** 줄 아래의 날짜 — "11.02". 값이라 모노로 세운다. */
function formatStripDate(item: UserMedia) {
  const date = getUserMediaDate(item);
  if (!date) return null;
  return `${`${date.getMonth() + 1}`.padStart(2, "0")}.${`${date.getDate()}`.padStart(2, "0")}`;
}

function getNextDateRefreshDelay() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 1, 0);

  return Math.max(nextMidnight.getTime() - now.getTime(), 1000);
}

/**
 * 날짜가 넘어가면 화면을 다시 그리게 하는 훅. 자정 타이머와 탭 복귀(visibilitychange)
 * 둘 다 본다 — 탭이 백그라운드에 있는 동안 타이머가 밀려도 돌아온 순간 맞춰진다.
 * 반환값은 "yyyy-mm-dd" 키라, 같은 날 다시 확인해도 값이 그대로여서 재렌더가 없다.
 */
function subscribeToDateChange(notify: () => void) {
  let timeoutId: number;
  const refresh = () => {
    notify();
    timeoutId = window.setTimeout(refresh, getNextDateRefreshDelay());
  };
  const refreshOnVisible = () => { if (!document.hidden) notify(); };
  timeoutId = window.setTimeout(refresh, getNextDateRefreshDelay());
  document.addEventListener("visibilitychange", refreshOnVisible);
  return () => {
    window.clearTimeout(timeoutId);
    document.removeEventListener("visibilitychange", refreshOnVisible);
  };
}

function useCurrentDateKey() {
  return useSyncExternalStore(subscribeToDateChange, getCurrentDateKey, () => null);
}


export default function HomePage() {
  const studioAccess = useStudioAccess();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [recentMedia, setRecentMedia] = useState<UserMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setLoadError(null);

      try {
        // 기록 조회 실패는 빈 상태로 삼키지 않고 에러 상태로 구분한다.
        const [nextUser, mediaResult] = await Promise.all([
          getMyUserInfo().catch(() => null),
          listRecentMedia(RECENT_LIMIT).then(
            (media) => ({ ok: true as const, media }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
        ]);

        if (cancelled) return;

        setUser(nextUser);

        if (!mediaResult.ok) {
          console.error(mediaResult.error);
          setRecentMedia([]);
          setLoadError(
            getUserFacingApiErrorMessage(
              mediaResult.error,
              "기록을 불러오지 못했어요.",
            ),
          );
          return;
        }

        const sortedMedia = [...mediaResult.media].sort((a, b) => {
          const aTime = serverDateTimeToMillis(a.createdAt);
          const bTime = serverDateTimeToMillis(b.createdAt);
          return bTime - aTime;
        });

        setRecentMedia(sortedMedia.slice(0, RECENT_LIMIT));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const currentDateKey = useCurrentDateKey();
  // 날짜는 자정에 갱신되는 날짜 키에서 파생된다(별도 타이머 불필요). 서버 렌더에서는 비운다.
  const currentHeadingDate = useMemo(
    () => (currentDateKey ? formatHeadingDate(currentDateKey) : ""),
    [currentDateKey],
  );

  const latest = recentMedia[0] ?? null;
  // 큰 카드에 올린 한 장은 아래 줄에서 뺀다. 한 장뿐이면 줄이 비지 않게 그대로 둔다.
  const stripMedia = recentMedia.length > 1 ? recentMedia.slice(1) : recentMedia;
  const actions = studioAccess ? [STUDIO_ACTION, THEME_ACTION] : [THEME_ACTION];

  return (
    <main className="hc-page-app min-h-dvh pb-[calc(90px+env(safe-area-inset-bottom))] text-(--hc-text) lg:pb-12">
      <AppNav userInitial={user?.username} />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:py-6 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start lg:gap-x-8 lg:gap-y-6 lg:py-8">
        <header className="pt-1 lg:col-span-2 lg:pt-0">
          <p className="min-h-5 text-[13px] font-semibold text-(--hc-muted)">{currentHeadingDate}</p>
          <h1 className="mt-0.5 text-[34px] font-extrabold leading-tight tracking-[-0.03em]">오늘의 네 컷</h1>
        </header>

        {/*
          첫 화면의 주인공은 내 사진이다(DESIGN.md 「사진이 제일 밝다」). 예전에는 글자 카드 둘과 빈 상자가 먼저 보였고,
          사진은 스크롤 아래 작은 칸이었다. 가장 최근 네 컷을 크게 놓고 바로 다음 한 장을 찍는 버튼을 그 아래 둔다.
          라임은 이 버튼 하나다 — 같은 일을 하는 탭바 버튼은 이 화면에서 무채색으로 물러난다(quietShoot).
        */}
        <section aria-label="가장 최근 사진" className="hc-surface-card flex flex-col gap-4 rounded-[20px] border p-4 lg:sticky lg:top-24">
          <HeroPhoto loading={loading} item={latest} />
          <button
            type="button"
            onClick={() => setSourceDialogOpen(true)}
            className="hc-button-primary inline-flex h-14 w-full items-center justify-center rounded-full text-[16px] font-extrabold"
          >
            지금 찍기
          </button>
        </section>

        <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
          <nav aria-label="다른 할 일" className="flex flex-col gap-2.5">
            {actions.map((action) => (
              <Link
                key={action.id}
                href={action.href}
                className="hc-surface-well group flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 transition hover:border-(--hc-border-strong)"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">{action.title}</span>
                  <span className="mt-0.5 block text-[13px] text-(--hc-muted)">{action.description}</span>
                </span>
                <ArrowRight aria-hidden className="h-4.5 w-4.5 shrink-0 text-(--hc-muted)" />
              </Link>
            ))}
          </nav>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-extrabold tracking-tight">최근 기록</h2>
              <Link
                href="/history"
                className="hc-link-accent inline-flex min-h-11 items-center gap-1 px-1 text-[13px] font-semibold"
              >
                전체보기
                <ArrowRight aria-hidden className="hidden h-3.5 w-3.5 lg:inline" />
              </Link>
            </div>

            {/*
              폰에서는 좌우로 넘긴다. 화면 밖으로 살짝 걸치게 둬서 "옆에 더 있다"는 것이 보이게 한다
              (-mx-4 로 화면 가장자리까지 흘린다). 넓은 화면은 격자.
              실패·빈 상태는 넘길 것이 없으므로 스크롤러가 아니라 한 칸을 채우는 카드다.
            */}
            {loading || stripMedia.length > 0 ? (
              <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
                {loading
                  ? Array.from({ length: 3 }, (_, index) => (
                      <div key={index} className="aspect-3/4 w-28 shrink-0 animate-pulse rounded-xl bg-(--hc-surface-muted) lg:w-auto" />
                    ))
                  : stripMedia.map((item) => <RecentStrip key={item.mediaId} item={item} />)}
              </div>
            ) : loadError ? (
              // 실패를 빈 상태로 위장하지 않는다. 문구 + 다시 시도.
              <div className="hc-surface-well flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-6 text-center">
                <p className="text-[13px] text-(--hc-muted)">{loadError}</p>
                <button
                  type="button"
                  onClick={() => setReloadKey((prev) => prev + 1)}
                  className="hc-button-secondary min-h-11 rounded-full border px-5 text-[13px] font-semibold"
                >
                  다시 시도
                </button>
              </div>
            ) : (
              <p className="hc-surface-well rounded-[18px] border border-dashed p-6 text-center text-[13px] text-(--hc-muted)">
                아직 저장한 기록이 없어요. 첫 네 컷을 남겨보세요.
              </p>
            )}
          </section>
        </div>
      </div>
      <MobileTabBar quietShoot />
      <RecordSourceDialog
        open={sourceDialogOpen}
        onClose={() => setSourceDialogOpen(false)}
      />
    </main>
  );
}

/**
 * 큰 카드의 사진. 기록이 있으면 가장 최근 것, 없으면 예시 프레임이다.
 * 예시는 진짜 기록처럼 보이면 안 되므로 예시라고 적는다. 칸 높이를 고정해 사진이 늦게 와도 버튼이 밀리지 않는다.
 */
function HeroPhoto({ loading, item }: { loading: boolean; item: UserMedia | null }) {
  // 세로로 긴 스트립만 살짝 기울인다. 실물처럼 보이는 것은 긴 띠뿐이고, 가로 사진을 기울이면 삐뚤게만 보인다.
  const [isStrip, setIsStrip] = useState(false);
  const previewUrl = item ? getUserMediaPreviewUrl(item) : null;

  const box = "relative flex h-[min(46svh,400px)] items-center justify-center lg:h-[min(58svh,520px)]";

  if (loading) {
    return (
      <div className={box}>
        <div className="aspect-2/3 h-full animate-pulse rounded-lg bg-(--hc-surface-muted)" />
      </div>
    );
  }

  if (item && previewUrl) {
    const title = getUserMediaTitle(item);
    return (
      // 넉 장이 전부 목록 맨 위로만 갔다. 누른 그 기록으로 데려간다.
      <Link href={`/history#media-${item.mediaId}`} aria-label={`기록에서 보기: ${title}`} className={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={title}
          fetchPriority="high"
          onLoad={(e) => setIsStrip(e.currentTarget.naturalHeight > e.currentTarget.naturalWidth * 1.6)}
          className={`max-h-full max-w-full rounded-md object-contain shadow-[0_18px_36px_rgba(0,0,0,0.35)] transition-transform ${isStrip ? "rotate-[3deg]" : ""}`}
        />
      </Link>
    );
  }

  return (
    <div className={`${box} flex-col gap-2.5`}>
      <div aria-hidden className="min-h-0 flex-1 -rotate-2 drop-shadow-2xl">
        <FramePreview
          frameId="grid-4"
          images={DEMO_PHOTOS}
          theme={DEMO_DECORATED_THEME}
          borderColor="#141416"
          imageLoading="eager"
          className="h-full! w-auto!"
        />
      </div>
      <p className="shrink-0 text-[12px] text-(--hc-muted)">이렇게 남아요. 예시 사진이에요.</p>
    </div>
  );
}

/** 아래 줄의 작은 기록 한 장. 사진을 자르지 않는다. */
function RecentStrip({ item }: { item: UserMedia }) {
  const previewUrl = getUserMediaPreviewUrl(item);
  const date = formatStripDate(item);
  return (
    <Link
      href={`/history#media-${item.mediaId}`}
      className="group flex w-28 shrink-0 snap-start flex-col gap-1.5 lg:w-auto"
    >
      <div className="hc-surface-well relative grid aspect-3/4 place-items-center overflow-hidden rounded-xl border bg-(--hc-surface-inset) transition group-hover:border-(--hc-border-strong)">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={getUserMediaTitle(item)}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-contain p-1.5"
          />
        ) : (
          <div className="h-full w-full bg-(--hc-surface-muted)" />
        )}
      </div>
      {/* 언제 찍은 것인지가 기록에서 가장 먼저 알고 싶은 정보다. */}
      {date ? <p className="text-center font-mono text-[11px] tabular-nums text-(--hc-muted)">{date}</p> : null}
    </Link>
  );
}
