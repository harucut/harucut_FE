"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Camera,
  ChevronRight,
  Image as ImageIcon,
  Play,
  Sparkles,
} from "lucide-react";
import { getMyUserInfo, type UserInfo } from "@/lib/userApi";
import { listMyMedia } from "@/lib/userMediaApi";
import type { UserMedia } from "@/lib/api-types";
import { getUserMediaPreview, getUserMediaTitle } from "@/lib/userMediaPreview";
import { AppNav } from "@/components/layout/AppNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { CoachMarks, type CoachStep } from "@/components/onboarding/CoachMarks";

// 핸드오프 문구에 맞춘 주간 목표 컷 수(임의 상수). 진행 링/남은 컷 계산의 기준.
const WEEKLY_GOAL = 5;

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

// 진행 링(SVG). 핸드오프 app 홈 스탯 카드의 그린 링.
function ProgressRing({
  pct,
  size = 46,
  stroke = 5,
}: {
  pct: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--hc-surface-muted)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--hc-primary)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

// createdAt이 같은 (자연) 월에 속하면 이번 달 기록으로 센다.
function countThisMonth(items: UserMedia[]) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return items.filter((item) => {
    if (!item.createdAt) return false;
    const d = new Date(item.createdAt);
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
    if (!item.createdAt) return false;
    const d = new Date(item.createdAt);
    return !Number.isNaN(d.getTime()) && d.getTime() >= startMs;
  }).length;
}

export default function HomePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [recentMedia, setRecentMedia] = useState<UserMedia[]>([]);
  const [previewMedia, setPreviewMedia] = useState<UserMedia[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);

      try {
        const [nextUser, nextMedia] = await Promise.all([
          getMyUserInfo().catch(() => null),
          listMyMedia().catch(() => []),
        ]);

        if (cancelled) return;

        const sortedMedia = [...nextMedia].sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });

        setUser(nextUser);
        setRecentMedia(sortedMedia.slice(0, 4));
        setPreviewMedia(sortedMedia);
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
  }, []);

  const currentDateLabel = useCurrentDateLabel();
  const greetingName = user?.username ? `${user.username}님, ` : "";

  // currentDateLabel을 의존성에 포함해 날짜가 바뀌면(주/월 경계) 카운트도 다시 계산되게 한다.
  const monthCount = useMemo(
    () => countThisMonth(previewMedia),
    [previewMedia, currentDateLabel],
  );
  const weekCount = useMemo(
    () => countThisWeek(previewMedia),
    [previewMedia, currentDateLabel],
  );
  const remainingToGoal = Math.max(0, WEEKLY_GOAL - weekCount);
  const ringPct = WEEKLY_GOAL > 0 ? Math.min(1, weekCount / WEEKLY_GOAL) : 0;
  const progressWidth = `${Math.round(ringPct * 100)}%`;

  return (
    <main className="hc-page-app min-h-dvh pb-[90px] text-[color:var(--hc-text)] lg:pb-0">
      <AppNav userInitial={user?.username} />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:py-6 lg:gap-9 lg:py-8">
        {/* 인사 */}
        <header className="pt-1 lg:pt-0">
          <span className="font-mono text-[11.5px] uppercase tracking-[0.2em] text-[color:var(--hc-primary)] lg:text-[12px]">
            {currentDateLabel}
          </span>
          {/* 데스크톱(lg+): handoff web 카피 */}
          <h1 className="mt-3 hidden text-[34px] font-extrabold leading-[1.15] tracking-tight lg:block">
            {greetingName}오늘은
            <br />
            어떻게 남겨볼까요?
          </h1>
          {/* 모바일(&lt;lg): handoff app 카피 ("어떤 네 컷"만 그린) */}
          <h1 className="mt-2 text-[25px] font-extrabold leading-[1.25] tracking-tight lg:hidden">
            {greetingName}오늘은
            <br />
            <span className="text-[color:var(--hc-primary)]">어떤 네 컷</span>
            일까요?
          </h1>
        </header>

        {/* 모바일(&lt;lg) 메인 CTA — 핸드오프 app 홈 그린 카드 */}
        <Link
          href="/shoot"
          data-coach="shoot"
          className="flex items-center gap-3.5 rounded-[24px] bg-[color:var(--hc-primary)] p-[18px] text-[color:var(--hc-primary-contrast)] shadow-[var(--hc-button-shadow)] lg:hidden"
        >
          <span className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-[15px] bg-[#06140A]">
            <Camera className="h-[26px] w-[26px] text-[color:var(--hc-primary)]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-extrabold">지금 촬영하기</span>
            <span className="mt-0.5 block whitespace-nowrap text-[12.5px] font-medium opacity-75">
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
            <ImageIcon className="h-[22px] w-[22px] shrink-0 text-[color:var(--hc-primary)]" />
            <span className="min-w-0">
              <span className="block whitespace-nowrap text-[13.5px] font-bold">
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
            <Sparkles className="h-[22px] w-[22px] shrink-0 text-[color:var(--hc-primary)]" />
            <span className="min-w-0">
              <span className="block whitespace-nowrap text-[13.5px] font-bold">
                프레임 보기
              </span>
              <span className="block whitespace-nowrap text-[11px] text-[color:var(--hc-muted)]">
                4가지 테마
              </span>
            </span>
          </Link>
        </section>

        {/* 데스크톱(lg+) 액션 인덱스 → 촬영 / 업로드 / 꾸미기 (코치마크는 보이는 카드를 비춤) */}
        <section className="hidden gap-3.5 lg:grid lg:grid-cols-3">
          <Link
            href="/shoot"
            data-coach="shoot"
            className="group flex min-h-[108px] flex-col justify-between rounded-2xl bg-[color:var(--hc-primary)] p-[22px] text-[color:var(--hc-primary-contrast)] shadow-[var(--hc-button-shadow)] transition hover:shadow-[var(--hc-button-shadow-hover)]"
          >
            <span className="font-mono text-[11px] tracking-[0.18em] opacity-60">01</span>
            <span>
              <span className="flex items-center justify-between text-[19px] font-extrabold">
                촬영하기
                <ArrowRight className="h-[18px] w-[18px] transition group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-[12.5px] font-medium opacity-75">
                프레임 고르고 8장, 네 컷만 남겨요
              </span>
            </span>
          </Link>

          <Link
            href="/upload"
            data-coach="upload"
            className="hc-surface-card group flex min-h-[108px] flex-col justify-between rounded-2xl border p-[22px] transition hover:border-[color:var(--hc-border-strong)]"
          >
            <span className="font-mono text-[11px] tracking-[0.18em] text-[color:var(--hc-muted-soft)]">
              02
            </span>
            <span>
              <span className="flex items-center justify-between text-[19px] font-extrabold">
                업로드하기
                <ArrowRight className="h-[18px] w-[18px] text-[color:var(--hc-muted)] transition group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-[12.5px] text-[color:var(--hc-muted)]">
                찍어둔 사진·영상으로 만들어요
              </span>
            </span>
          </Link>

          <Link
            href="/theme"
            data-coach="theme"
            className="hc-surface-card group flex min-h-[108px] flex-col justify-between rounded-2xl border p-[22px] transition hover:border-[color:var(--hc-border-strong)]"
          >
            <span className="font-mono text-[11px] tracking-[0.18em] text-[color:var(--hc-muted-soft)]">
              03
            </span>
            <span>
              <span className="flex items-center justify-between text-[19px] font-extrabold">
                프레임 꾸미기
                <ArrowRight className="h-[18px] w-[18px] text-[color:var(--hc-muted)] transition group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-[12.5px] text-[color:var(--hc-muted)]">
                만들어두면 촬영할 때 골라 써요
              </span>
            </span>
          </Link>
        </section>

        {/* 모바일(&lt;lg) 스탯 카드 — 이번 달 컷 수 + 주간 목표 + 진행 링 */}
        <section className="hc-surface-card flex items-center gap-3.5 rounded-2xl border p-4 lg:hidden">
          <span className="font-mono text-[26px] font-semibold leading-none text-[color:var(--hc-primary)]">
            {monthCount}
          </span>
          <p className="flex-1 text-[13px] leading-[1.45] text-[color:var(--hc-muted)]">
            이번 달 <b className="text-[color:var(--hc-text)]">{monthCount}컷</b>을
            남겼어요.
            <br />
            이번 주 목표까지{" "}
            <b className="text-[color:var(--hc-primary)]">{remainingToGoal}컷</b> 남았어요!
          </p>
          <ProgressRing pct={ringPct} />
        </section>

        {/* 데스크톱(lg+) 주간 진행 스트립 */}
        <section className="hc-surface-card hidden items-center gap-5 rounded-2xl border p-[22px] lg:flex">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[30px] font-semibold leading-none text-[color:var(--hc-primary)]">
              {monthCount}
            </span>
            <span className="text-[14px] text-[color:var(--hc-muted)]">컷 / 이번 달</span>
          </span>
          <span className="h-2 min-w-[160px] flex-1 overflow-hidden rounded-full bg-[color:var(--hc-surface-muted)]">
            <span
              className="block h-full rounded-full bg-[color:var(--hc-primary)]"
              style={{ width: progressWidth }}
            />
          </span>
          <span className="text-[13.5px] text-[color:var(--hc-muted)]">
            이번 주 목표까지{" "}
            <b className="text-[color:var(--hc-text)]">{remainingToGoal}컷</b>
          </span>
        </section>

        {/* 최근 기록 */}
        <section className="flex flex-col gap-4">
          <div className="flex items-end justify-between">
            <h2 className="flex items-baseline gap-2 text-[17px] font-extrabold tracking-tight lg:text-[22px]">
              최근 기록
              <span className="hidden font-mono text-[13px] font-normal uppercase tracking-[0.18em] text-[color:var(--hc-muted-soft)] lg:inline">
                Recent
              </span>
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
            ) : recentMedia.length > 0 ? (
              recentMedia.map((item) => {
                const preview = getUserMediaPreview(item, previewMedia);
                const isVideo = item.mediaType === "VIDEO";

                return (
                  <Link
                    key={item.mediaId}
                    href="/history"
                    className="group flex flex-col gap-2"
                  >
                    <div className="hc-surface-well relative grid aspect-[3/4] place-items-center overflow-hidden rounded-[18px] border bg-[color:var(--hc-surface-inset)] p-2.5 transition group-hover:border-[color:var(--hc-border-strong)]">
                      {preview.url ? (
                        preview.kind === "video" ? (
                          <video
                            src={preview.url}
                            className="absolute inset-0 h-full w-full object-contain p-3"
                            muted
                            playsInline
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={preview.url}
                            alt={getUserMediaTitle(item)}
                            className="absolute inset-0 h-full w-full object-contain p-3"
                          />
                        )
                      ) : (
                        <div className="h-full w-full bg-[color:var(--hc-surface-muted)]" />
                      )}
                      <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10.5px] font-bold text-white backdrop-blur">
                        {isVideo ? (
                          <>
                            <Play
                              aria-hidden="true"
                              className="h-2.5 w-2.5"
                              fill="currentColor"
                            />
                            영상
                          </>
                        ) : (
                          <>
                            <ImageIcon aria-hidden="true" className="h-2.5 w-2.5" />
                            사진
                          </>
                        )}
                      </span>
                    </div>
                    <p className="truncate text-[13.5px] font-bold tracking-tight">
                      {getUserMediaTitle(item)}
                    </p>
                  </Link>
                );
              })
            ) : (
              <div className="hc-surface-well col-span-2 flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-6 text-center md:col-span-4">
                <Sparkles className="h-6 w-6 text-[color:var(--hc-primary)]" />
                <p className="text-[13px] text-[color:var(--hc-muted)]">
                  아직 저장한 기록이 없어요. 첫 네 컷을 남겨보세요.
                </p>
                <Link
                  href="/shoot"
                  className="hc-button-primary rounded-full px-4 py-2 text-[12px] font-semibold"
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
