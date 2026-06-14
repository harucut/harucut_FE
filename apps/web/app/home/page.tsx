"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Camera,
  ChevronRight,
  Image as ImageIcon,
  Palette,
  Play,
  Sparkles,
} from "lucide-react";
import { getMyUserInfo, type UserInfo } from "@/lib/userApi";
import { listMyMedia } from "@/lib/userMediaApi";
import { listMyFrames } from "@/lib/remoteFrameApi";
import type { UserMedia, RemoteFrame } from "@/lib/api-types";
import { frameIdFromFrameType } from "@/lib/frameApi";
import { getUserMediaPreview, getUserMediaTitle } from "@/lib/userMediaPreview";
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

function formatCurrentDate() {
  return new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
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

export default function HomePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [recentMedia, setRecentMedia] = useState<UserMedia[]>([]);
  const [previewMedia, setPreviewMedia] = useState<UserMedia[]>([]);
  const [savedFrames, setSavedFrames] = useState<RemoteFrame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);

      try {
        const [nextUser, nextMedia, nextFrames] = await Promise.all([
          getMyUserInfo().catch(() => null),
          listMyMedia().catch(() => []),
          listMyFrames().catch(() => []),
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
        setSavedFrames(nextFrames.slice(0, 1));
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
  const savedFrame = savedFrames[0] ?? null;
  const greetingName = user?.username ? `${user.username}님, ` : "";

  return (
    <main className="hc-page-app min-h-dvh px-4 py-5 pb-[90px] text-[color:var(--hc-text)] sm:py-6 lg:pb-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:gap-9">
        {/* 인사 */}
        <header className="pt-1 lg:pt-4">
          <span className="text-[12px] font-medium uppercase tracking-[0.22em] text-[color:var(--hc-primary)]">
            {currentDateLabel}
          </span>
          <h1 className="mt-3 text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px] lg:text-[34px]">
            {greetingName}오늘은
            <br className="lg:hidden" />
            <span className="lg:ml-2">어떻게 남겨볼까요?</span>
          </h1>
        </header>

        {/* 액션 인덱스 → 촬영 / 업로드 / 꾸미기 (data-coach 앵커 유지) */}
        <section className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/shoot"
            data-coach="shoot"
            className="group flex min-h-[120px] flex-col justify-between rounded-[20px] bg-[color:var(--hc-primary)] p-5 text-[color:var(--hc-primary-contrast)] shadow-[var(--hc-button-shadow)] transition hover:shadow-[var(--hc-button-shadow-hover)]"
          >
            <span className="text-[11px] font-semibold tracking-[0.18em] opacity-70">
              01
            </span>
            <span>
              <span className="flex items-center justify-between text-[18px] font-extrabold">
                촬영하기
                <ArrowRight className="h-[18px] w-[18px] transition group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-[12.5px] font-medium opacity-75">
                프레임 고르고 네 컷을 남겨요
              </span>
            </span>
          </Link>

          <Link
            href="/upload"
            data-coach="upload"
            className="hc-surface-card group flex min-h-[120px] flex-col justify-between rounded-[20px] border p-5 transition hover:border-[color:var(--hc-border-strong)]"
          >
            <span className="text-[11px] font-semibold tracking-[0.18em] text-[color:var(--hc-muted-soft)]">
              02
            </span>
            <span>
              <span className="flex items-center justify-between text-[18px] font-extrabold">
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
            className="hc-surface-card group flex min-h-[120px] flex-col justify-between rounded-[20px] border p-5 transition hover:border-[color:var(--hc-border-strong)]"
          >
            <span className="text-[11px] font-semibold tracking-[0.18em] text-[color:var(--hc-muted-soft)]">
              03
            </span>
            <span>
              <span className="flex items-center justify-between text-[18px] font-extrabold">
                프레임 꾸미기
                <ArrowRight className="h-[18px] w-[18px] text-[color:var(--hc-muted)] transition group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-[12.5px] text-[color:var(--hc-muted)]">
                만들어두면 촬영할 때 골라 써요
              </span>
            </span>
          </Link>
        </section>

        {/* 모바일 보조 진입 (앱 느낌) */}
        <section className="grid gap-3 sm:hidden">
          <Link
            href="/shoot"
            className="hc-surface-card flex items-center gap-3 rounded-2xl border p-4"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--hc-accent-soft-bg)]">
              <Camera className="h-5 w-5 text-[color:var(--hc-primary)]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold">바로 촬영 시작</span>
              <span className="block text-[11.5px] text-[color:var(--hc-muted)]">
                셔터를 누르면 네 컷이 자동으로 찍혀요
              </span>
            </span>
            <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-[color:var(--hc-muted-soft)]" />
          </Link>
        </section>

        {/* 최근 기록 */}
        <section className="flex flex-col gap-4">
          <div className="flex items-end justify-between">
            <h2 className="flex items-baseline gap-2 text-[20px] font-extrabold tracking-tight lg:text-[22px]">
              최근 기록
              <span className="text-[12px] font-normal uppercase tracking-[0.2em] text-[color:var(--hc-muted-soft)]">
                Recent
              </span>
            </h2>
            <Link
              href="/history"
              className="hc-link-accent flex items-center gap-1 text-[13px] font-semibold"
            >
              전체보기
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
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
                    <div className="hc-surface-well relative aspect-[3/4] overflow-hidden rounded-[18px] border transition group-hover:border-[color:var(--hc-border-strong)]">
                      {preview.url ? (
                        preview.kind === "video" ? (
                          <video
                            src={preview.url}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={preview.url}
                            alt={getUserMediaTitle(item)}
                            className="h-full w-full object-cover"
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
                            <ImageIcon
                              aria-hidden="true"
                              className="h-2.5 w-2.5"
                            />
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

        {/* 저장된 프레임 */}
        <section className="hc-surface-card flex items-center justify-between rounded-[20px] border p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--hc-accent-soft-bg)]">
              <Palette className="h-5 w-5 text-[color:var(--hc-primary)]" />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-bold">저장된 프레임</p>
              <p className="mt-0.5 truncate text-[12px] text-[color:var(--hc-muted)]">
                {savedFrame
                  ? savedFrame.title
                  : "만들어둔 프레임을 촬영할 때 골라 쓸 수 있어요."}
              </p>
            </div>
          </div>
          <Link
            href={
              savedFrame
                ? `/theme?frame=${frameIdFromFrameType(savedFrame.frameType)}&remoteFrameId=${savedFrame.frameId}`
                : "/theme"
            }
            className="hc-link-accent ml-3 flex shrink-0 items-center gap-1 text-[13px] font-semibold"
          >
            {savedFrame ? "이어서 수정" : "프레임 만들기"}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
      <MobileTabBar />
      <CoachMarks id="home-v1" steps={HOME_COACH_STEPS} />
    </main>
  );
}
