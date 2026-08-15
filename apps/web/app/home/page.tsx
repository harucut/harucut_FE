"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Camera,
  ChevronRight,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import { parseServerDateTime, serverDateTimeToMillis } from "@harucut/shared";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { getMyUserInfo, type UserInfo } from "@/lib/userApi";
import { listMyMedia } from "@/lib/userMediaApi";
import type { UserMedia } from "@/lib/api-types";
import {
  getUserMediaDateLabel,
  getUserMediaPreviewUrl,
  getUserMediaTitle,
} from "@/lib/userMediaPreview";
import { AppNav } from "@/components/layout/AppNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { CoachMarks, type CoachStep } from "@/components/onboarding/CoachMarks";

const HOME_COACH_STEPS: CoachStep[] = [
  {
    selector: '[data-coach="shoot"]',
    title: "촬영하기",
    body: "카메라로 8장을 찍고 마음에 드는 4장을 골라 네 컷을 만들어요.",
  },
  {
    selector: '[data-coach="upload"]',
    title: "사진 업로드",
    body: "이미 찍어둔 사진으로도 바로 네 컷을 만들 수 있어요.",
  },
  {
    selector: '[data-coach="theme"]',
    title: "꾸미기",
    body: "프레임 색·배경 이미지·텍스트·스티커로 나만의 프레임을 만들어요.",
  },
];

const WEEKDAY_KO = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

// 핸드오프와 동일한 "2026.06.12 · 금요일" 표기.
function formatCurrentDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  return `${yyyy}.${mm}.${dd} · ${WEEKDAY_KO[now.getDay()]}`;
}

// 인사 헤딩용 — "6.27 토요일"(연도·0 패딩 없이). currentDateLabel과 같은 자정 갱신을 공유한다.
function formatHeadingDate() {
  const now = new Date();
  return `${now.getMonth() + 1}.${now.getDate()} ${WEEKDAY_KO[now.getDay()]}`;
}

function getNextDateRefreshDelay() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 1, 0);

  return Math.max(nextMidnight.getTime() - now.getTime(), 1000);
}

function useCurrentDateLabel() {
  const [dateLabel, setDateLabel] = useState(formatCurrentDate);

  useEffect(() => {
    let timeoutId: number;

    const refresh = () => {
      setDateLabel(formatCurrentDate());
      timeoutId = window.setTimeout(refresh, getNextDateRefreshDelay());
    };

    const refreshOnVisible = () => {
      if (!document.hidden) {
        setDateLabel(formatCurrentDate());
      }
    };

    timeoutId = window.setTimeout(refresh, getNextDateRefreshDelay());
    document.addEventListener("visibilitychange", refreshOnVisible);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, []);

  return dateLabel;
}


// createdAt이 같은 (자연) 월에 속하면 이번 달 기록으로 센다.
function countThisMonth(items: UserMedia[]) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return items.filter((item) => {
    const d = parseServerDateTime(item.createdAt);
    if (!d) return false;
    return !Number.isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m;
  }).length;
}

// 월요일 기준 이번 주 시작 이후 만든 기록 수.
function countThisWeek(items: UserMedia[]) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  // 0=일..6=토 -> 월요일까지 경과일. setDate는 로컬 캘린더 기준이라 DST 안전.
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const startMs = weekStart.getTime();
  return items.filter((item) => {
    const d = parseServerDateTime(item.createdAt);
    if (!d) return false;
    return !Number.isNaN(d.getTime()) && d.getTime() >= startMs;
  }).length;
}

export default function HomePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [recentMedia, setRecentMedia] = useState<UserMedia[]>([]);
  const [allMedia, setAllMedia] = useState<UserMedia[]>([]);
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
          listMyMedia().then(
            (media) => ({ ok: true as const, media }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
        ]);

        if (cancelled) return;

        setUser(nextUser);

        if (!mediaResult.ok) {
          console.error(mediaResult.error);
          setRecentMedia([]);
          setAllMedia([]);
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

        setRecentMedia(sortedMedia.slice(0, 4));
        setAllMedia(sortedMedia);
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

  const currentDateLabel = useCurrentDateLabel();
  // 헤딩 날짜는 currentDateLabel과 같은 자정 갱신에 묶어 재계산(별도 타이머 불필요).
  const currentHeadingDate = useMemo(() => formatHeadingDate(), [currentDateLabel]);

  // currentDateLabel을 의존성에 포함해 날짜가 바뀌면(주/월 경계) 카운트도 다시 계산되게 한다.
  const monthCount = useMemo(
    () => countThisMonth(allMedia),
    [allMedia, currentDateLabel],
  );
  const weekCount = useMemo(
    () => countThisWeek(allMedia),
    [allMedia, currentDateLabel],
  );
  // 조회에 실패했으면 0컷이라고 단정하지 않는다.
  const statsUnknown = loadError !== null;
  const monthCountLabel = statsUnknown ? "—" : `${monthCount}`;
  const weekCountLabel = statsUnknown ? "—" : `${weekCount}컷`;

  return (
    <main className="hc-page-app min-h-dvh pb-[calc(90px+env(safe-area-inset-bottom))] text-[color:var(--hc-text)] lg:pb-0">
      <AppNav userInitial={user?.username} />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:py-6 lg:gap-9 lg:py-8">
        {/* 인사 — 오늘 날짜 기반 헤딩("6.27 토요일의 / 기록을 남겨보세요.") */}
        <header className="pt-1 lg:pt-0">
          <h1 className="text-[25px] font-bold leading-[1.5] tracking-tight lg:text-[34px] lg:leading-[1.4]">
            <span className="text-[color:var(--hc-primary-strong)]">{currentHeadingDate}</span>의
            <br />
            기록을 남겨보세요.
          </h1>
        </header>

        {/* 모바일(&lt;lg) 메인 CTA — 핸드오프 app 홈 그린 카드 */}
        <Link
          href="/shoot"
          data-coach="shoot"
          className="flex items-center gap-3.5 rounded-[24px] bg-[color:var(--hc-primary)] p-[18px] text-[color:var(--hc-primary-contrast)] shadow-[var(--hc-button-shadow)] lg:hidden"
        >
          <span className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-[15px] bg-[#06140A]">
            <Camera className="h-[26px] w-[26px] text-[color:var(--hc-primary-strong)]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-extrabold">지금 촬영하기</span>
            <span className="mt-0.5 block whitespace-nowrap text-[13px] font-medium opacity-75">
              프레임 고르고 8장 찍기
            </span>
          </span>
          <ChevronRight className="h-[22px] w-[22px] shrink-0" />
        </Link>

        {/* 모바일(&lt;lg) 보조 2카드 — 사진 불러오기 / 프레임 보기 */}
        <section className="grid grid-cols-2 gap-2.5 lg:hidden">
          <Link
            href="/upload"
            data-coach="upload"
            className="hc-surface-card flex items-center gap-2.5 rounded-2xl border p-3.5"
          >
            <ImageIcon className="h-[22px] w-[22px] shrink-0 text-[color:var(--hc-primary-strong)]" />
            <span className="min-w-0">
              <span className="block whitespace-nowrap text-[13px] font-bold">
                사진 불러오기
              </span>
              <span className="block whitespace-nowrap text-[11px] text-[color:var(--hc-muted)]">
                갤러리에서
              </span>
            </span>
          </Link>
          <Link
            href="/theme"
            data-coach="theme"
            className="hc-surface-card flex items-center gap-2.5 rounded-2xl border p-3.5"
          >
            <Sparkles className="h-[22px] w-[22px] shrink-0 text-[color:var(--hc-primary-strong)]" />
            <span className="min-w-0">
              <span className="block whitespace-nowrap text-[13px] font-bold">
                프레임 보기
              </span>
              <span className="block whitespace-nowrap text-[11px] text-[color:var(--hc-muted)]">
                4가지 테마
              </span>
            </span>
          </Link>
        </section>

        {/* 데스크톱(lg+) 액션 카드 → 촬영 / 업로드 / 꾸미기 (코치마크는 보이는 카드를 비춤) */}
        {/* 01·02·03 인덱스를 뺀 뒤 justify-center로 — justify-between은 자식이 하나면 위로 붙는다. */}
        <section className="hidden gap-3.5 lg:grid lg:grid-cols-3">
          <Link
            href="/shoot"
            data-coach="shoot"
            className="group flex min-h-[108px] flex-col justify-center rounded-2xl bg-[color:var(--hc-primary)] p-[22px] text-[color:var(--hc-primary-contrast)] shadow-[var(--hc-button-shadow)] transition hover:shadow-[var(--hc-button-shadow-hover)]"
          >
            <span>
              <span className="flex items-center justify-between text-[19px] font-extrabold">
                촬영하기
                <ArrowRight className="h-[18px] w-[18px] transition group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-[13px] font-medium opacity-75">
                프레임 고르고 8장, 네 컷만 남겨요
              </span>
            </span>
          </Link>

          <Link
            href="/upload"
            data-coach="upload"
            className="hc-surface-card group flex min-h-[108px] flex-col justify-center rounded-2xl border p-[22px] transition hover:border-[color:var(--hc-border-strong)]"
          >
            <span>
              <span className="flex items-center justify-between text-[19px] font-extrabold">
                업로드하기
                <ArrowRight className="h-[18px] w-[18px] text-[color:var(--hc-muted)] transition group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-[13px] text-[color:var(--hc-muted)]">
                찍어둔 사진으로 만들어요
              </span>
            </span>
          </Link>

          <Link
            href="/theme"
            data-coach="theme"
            className="hc-surface-card group flex min-h-[108px] flex-col justify-center rounded-2xl border p-[22px] transition hover:border-[color:var(--hc-border-strong)]"
          >
            <span>
              <span className="flex items-center justify-between text-[19px] font-extrabold">
                프레임 꾸미기
                <ArrowRight className="h-[18px] w-[18px] text-[color:var(--hc-muted)] transition group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-[13px] text-[color:var(--hc-muted)]">
                만들어두면 촬영할 때 골라 써요
              </span>
            </span>
          </Link>
        </section>

        {/*
          모바일(&lt;lg) 스탯 카드 — 실제로 찍은 수만 보여준다.
          예전에는 "이번 주 목표까지 N컷 남았어요"라고 했는데, 그 목표는 사용자가 정한 적도
          제품이 약속한 적도 없는 상수(5)였다. 가입 첫 화면부터 빚을 지우는 문구였다.
        */}
        <section className="hc-surface-card flex items-center gap-3.5 rounded-2xl border p-4 lg:hidden">
          <span className="font-mono text-[26px] font-semibold leading-none text-[color:var(--hc-primary-strong)]">
            {monthCountLabel}
          </span>
          {/*
            불러오기 전후로 줄 수가 달라져 카드 높이가 바뀌었다(첫 화면 CLS 0.007 지분).
            두 줄 자리를 미리 잡아 둔다 — 13px × 1.45 × 2줄.
          */}
          <p className="min-h-[38px] flex-1 text-[13px] leading-[1.45] text-[color:var(--hc-muted)]">
            {statsUnknown ? (
              "기록을 불러오지 못해 이번 달 기록 수를 알 수 없어요."
            ) : (
              <>
                이번 달 <b className="text-[color:var(--hc-text)]">{monthCount}컷</b>을
                남겼어요.
                <br />
                그중 이번 주에 <b className="text-[color:var(--hc-text)]">{weekCount}컷</b>
                이에요.
              </>
            )}
          </p>
        </section>

        {/* 데스크톱(lg+) 기록 스트립 */}
        <section className="hc-surface-card hidden items-center gap-5 rounded-2xl border p-[22px] lg:flex">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[30px] font-semibold leading-none text-[color:var(--hc-primary-strong)]">
              {monthCountLabel}
            </span>
            <span className="text-[14px] text-[color:var(--hc-muted)]">컷 / 이번 달</span>
          </span>
          <span className="flex-1" />
          <span className="text-[13px] text-[color:var(--hc-muted)]">
            이번 주 <b className="text-[color:var(--hc-text)]">{weekCountLabel}</b>
          </span>
        </section>

        {/* 최근 기록 */}
        <section className="flex flex-col gap-4">
          <div className="flex items-end justify-between">
            <h2 className="text-[17px] font-extrabold tracking-tight lg:text-[22px]">
              최근 기록
            </h2>
            <Link
              href="/history"
              className="hc-link-accent flex items-center gap-1 text-[13px] font-semibold"
            >
              전체보기
              <ArrowRight className="hidden h-3.5 w-3.5 lg:inline" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3.5 sm:gap-4 md:grid-cols-4">
            {loading ? (
              Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="aspect-[3/4] animate-pulse rounded-[18px] bg-[color:var(--hc-surface-muted)]"
                />
              ))
            ) : loadError ? (
              // 실패를 빈 상태로 위장하지 않는다. 문구 + 다시 시도.
              <div className="hc-surface-well col-span-2 flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-6 text-center md:col-span-4">
                <p className="text-[13px] text-[color:var(--hc-muted)]">
                  {loadError}
                </p>
                <button
                  type="button"
                  onClick={() => setReloadKey((prev) => prev + 1)}
                  className="hc-button-secondary rounded-full border px-5 py-2 text-[13px] font-semibold"
                >
                  다시 시도
                </button>
              </div>
            ) : recentMedia.length > 0 ? (
              recentMedia.map((item) => {
                const previewUrl = getUserMediaPreviewUrl(item);

                return (
                  <Link
                    key={item.mediaId}
                    // 넉 장이 전부 목록 맨 위로만 갔다. 누른 그 기록으로 데려간다.
                    href={`/history#media-${item.mediaId}`}
                    className="group flex flex-col gap-2"
                  >
                    <div className="hc-surface-well relative grid aspect-[3/4] place-items-center overflow-hidden rounded-[18px] border bg-[color:var(--hc-surface-inset)] p-2.5 transition group-hover:border-[color:var(--hc-border-strong)]">
                      {previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewUrl}
                          alt={getUserMediaTitle(item)}
                          className="absolute inset-0 h-full w-full object-contain p-3"
                        />
                      ) : (
                        <div className="h-full w-full bg-[color:var(--hc-surface-muted)]" />
                      )}
                    </div>
                    <p className="truncate text-[13px] font-bold tracking-tight">
                      {getUserMediaTitle(item)}
                    </p>
                    {/* 언제 찍은 것인지가 기록에서 가장 먼저 알고 싶은 정보다. */}
                    {getUserMediaDateLabel(item) ? (
                      <p className="-mt-1.5 text-[11px] text-[color:var(--hc-muted)]">
                        {getUserMediaDateLabel(item)}
                      </p>
                    ) : null}
                  </Link>
                );
              })
            ) : (
              <div className="hc-surface-well col-span-2 flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-6 text-center md:col-span-4">
                <p className="text-[13px] text-[color:var(--hc-muted)]">
                  아직 저장한 기록이 없어요. 첫 네 컷을 남겨보세요.
                </p>
                <Link
                  href="/shoot"
                  className="hc-button-primary rounded-full px-5 py-2 text-[13px] font-semibold"
                >
                  촬영 시작
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
      <MobileTabBar />
      <CoachMarks id="home-v1" steps={HOME_COACH_STEPS} />
    </main>
  );
}
