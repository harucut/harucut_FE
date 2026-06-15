"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  ChevronRight,
  Palette,
  Play,
  Upload,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { getMyUserInfo, type UserInfo } from "@/lib/userApi";
import { listMyMedia } from "@/lib/userMediaApi";
import { listMyFrames } from "@/lib/remoteFrameApi";
import type { UserMedia, RemoteFrame } from "@/lib/api-types";
import { frameIdFromFrameType } from "@/lib/frameApi";
import { getUserMediaPreview, getUserMediaTitle } from "@/lib/userMediaPreview";

const WEEKLY_GOAL = 5;

type WeeklyStat = {
  monthCount: number;
  weekCount: number;
  remaining: number;
  pct: number;
};

function startOfWeekMonday(now: Date) {
  const day = now.getDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function computeWeeklyStat(items: UserMedia[], now: Date): WeeklyStat {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1,
  ).getTime();
  const weekStart = startOfWeekMonday(now).getTime();
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;

  let monthCount = 0;
  let weekCount = 0;

  for (const item of items) {
    if (!item.createdAt) continue;
    const t = new Date(item.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= monthStart && t < nextMonthStart) monthCount += 1;
    if (t >= weekStart && t < weekEnd) weekCount += 1;
  }

  return {
    monthCount,
    weekCount,
    remaining: Math.max(WEEKLY_GOAL - weekCount, 0),
    pct: Math.min(weekCount / WEEKLY_GOAL, 1),
  };
}

function Ring({ pct }: { pct: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
      <circle
        cx="23"
        cy="23"
        r={r}
        fill="none"
        stroke="var(--hc-border-strong)"
        strokeWidth="5"
      />
      <circle
        cx="23"
        cy="23"
        r={r}
        fill="none"
        stroke="var(--hc-primary)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 23 23)"
      />
    </svg>
  );
}

function getRecentMoment(items: UserMedia[]) {
  if (items.length === 0) return "첫 기록을 남겨보세요";

  const latest = items[0].createdAt ? new Date(items[0].createdAt) : null;
  if (!latest || Number.isNaN(latest.getTime())) return "최근 기록 확인";

  return latest.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export default function HomePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [recentMedia, setRecentMedia] = useState<UserMedia[]>([]);
  const [previewMedia, setPreviewMedia] = useState<UserMedia[]>([]);
  const [savedFrames, setSavedFrames] = useState<RemoteFrame[]>([]);
  const [loading, setLoading] = useState(true);
  const [mediaError, setMediaError] = useState(false);
  const [weeklyStat, setWeeklyStat] = useState<WeeklyStat | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);

      try {
        let mediaFailed = false;
        const [nextUser, nextMedia, nextFrames] = await Promise.all([
          getMyUserInfo().catch(() => null),
          listMyMedia().catch(() => {
            mediaFailed = true;
            return [] as UserMedia[];
          }),
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
        setMediaError(mediaFailed);
        // Compute date-dependent stats after mount to avoid SSR/hydration mismatch.
        setWeeklyStat(
          mediaFailed ? null : computeWeeklyStat(sortedMedia, new Date()),
        );
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

  const recentMoment = useMemo(
    () => getRecentMoment(recentMedia),
    [recentMedia],
  );
  const savedFrame = savedFrames[0] ?? null;

  return (
    <main className="hc-page-showcase min-h-dvh px-4 py-5 text-[color:var(--hc-text)] sm:py-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <PageHeader
          title={
            <span className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.26em] text-[color:var(--hc-primary)]/80">
                Record your day
              </span>
              <span>
                {user?.username ? `${user.username}님, ` : ""}오늘 하루를 네 컷으로
                남겨보세요
              </span>
            </span>
          }
          rightHref="/mypage"
          rightLabel="내 계정으로 이동"
          rightSlot={<User size={16} />}
          description=""
        />

        <section className="hc-surface-card-xl rounded-[28px] border p-5 backdrop-blur sm:p-6">
          <div className="hc-accent-chip inline-flex rounded-full border px-3 py-1 text-[11px]">
            {recentMoment}
          </div>

          <div className="mt-4 space-y-3">
            <h1 className="max-w-2xl text-[28px] font-semibold tracking-tight sm:text-[32px] md:text-5xl">
              찍고 저장하고,
              <span
                className="block bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, var(--hc-primary-strong), var(--hc-primary), var(--hc-hero-gradient-end))",
                }}
              >
                다시 꺼내 보는 하루컷
              </span>
            </h1>
            <p className="max-w-xl text-[14px] leading-6 text-zinc-300 sm:text-[15px] sm:leading-7">
              촬영하거나 업로드해서 기록에 남겨두세요.
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/shoot"
              className="hc-button-hero inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition sm:w-auto"
            >
              <Camera className="h-4 w-4" />
              바로 촬영 시작
            </Link>
            <Link
              href="/upload"
              className="hc-button-secondary inline-flex w-full items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition sm:w-auto"
            >
              <Upload className="h-4 w-4" />
              사진 업로드
            </Link>
            <Link
              href="/theme"
              className="hc-button-secondary inline-flex w-full items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition sm:w-auto"
            >
              <Palette className="h-4 w-4" />
              꾸미기
            </Link>
          </div>

        </section>

        {!mediaError &&
          (loading ? (
            <section className="hc-surface-card flex items-center gap-4 rounded-[28px] border p-5">
              <div className="h-12 w-12 animate-pulse rounded-full bg-white/5" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-3/4 animate-pulse rounded bg-white/5" />
                <div className="h-3.5 w-1/2 animate-pulse rounded bg-white/5" />
              </div>
              <div className="h-[46px] w-[46px] animate-pulse rounded-full bg-white/5" />
            </section>
          ) : weeklyStat ? (
            <section className="hc-surface-card flex items-center gap-4 rounded-[28px] border p-5">
              <div className="text-[28px] font-semibold tabular-nums text-[color:var(--hc-primary)] sm:text-[32px]">
                {weeklyStat.monthCount}
              </div>
              <p className="flex-1 text-[13px] leading-6 text-zinc-300 sm:text-sm">
                {weeklyStat.monthCount === 0 ? (
                  "이번 달 첫 네 컷을 남겨보세요."
                ) : (
                  <>
                    이번 달{" "}
                    <b className="text-[color:var(--hc-text)]">
                      {weeklyStat.monthCount}컷
                    </b>
                    을 남겼어요.
                    <br />
                    {weeklyStat.remaining > 0 ? (
                      <>
                        이번 주 목표까지{" "}
                        <b className="text-[color:var(--hc-primary)]">
                          {weeklyStat.remaining}컷
                        </b>{" "}
                        남았어요!
                      </>
                    ) : (
                      "이번 주 목표를 달성했어요! 🎉"
                    )}
                  </>
                )}
              </p>
              <div className="h-[46px] w-[46px] shrink-0">
                <Ring pct={weeklyStat.pct} />
              </div>
            </section>
          ) : null)}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="hc-surface-card rounded-[28px] border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                  Recent
                </p>
                <h2 className="mt-2 text-lg font-semibold">최근 저장한 결과</h2>
              </div>
              <Link href="/history" className="hc-link-accent text-[11px]">
                전체 보기
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {loading ? (
                Array.from({ length: 4 }, (_, index) => (
                  <div
                    key={index}
                    className="aspect-[3/4] animate-pulse rounded-3xl bg-white/5"
                  />
                ))
              ) : recentMedia.length > 0 ? (
                recentMedia.map((item) => {
                  const preview = getUserMediaPreview(item, previewMedia);
                  const isVideo = item.mediaType === "VIDEO";

                  return (
                    <div
                      key={item.mediaId}
                      className="hc-surface-well relative overflow-hidden rounded-3xl border"
                    >
                      {preview.url ? (
                        preview.kind === "video" ? (
                          <video
                            src={preview.url}
                            className="aspect-[3/4] w-full object-cover"
                            muted
                            playsInline
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={preview.url}
                            alt={getUserMediaTitle(item)}
                            className="aspect-[3/4] w-full object-cover"
                          />
                        )
                      ) : (
                        <div className="aspect-[3/4] bg-white/5" />
                      )}
                      {isVideo ? (
                        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10">
                          <span className="grid h-10 w-10 place-items-center rounded-full border border-white/40 bg-black/45 text-white shadow-lg backdrop-blur">
                            <Play
                              aria-hidden="true"
                              className="ml-0.5 h-4 w-4"
                              fill="currentColor"
                            />
                          </span>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="hc-surface-well col-span-2 rounded-3xl border border-dashed p-5 text-center text-[11px] text-zinc-400">
                  아직 저장한 결과가 없어요.
                </div>
              )}
            </div>
          </section>

          <div className="flex flex-col gap-4">
            <section className="hc-surface-card rounded-[28px] border p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-100">
                  저장된 프레임
                </p>
                <Link href="/theme" className="hc-link-accent text-[11px]">
                  전체 보기
                </Link>
              </div>

              <div className="mt-3">
                {savedFrame ? (
                  <Link
                    href={`/theme?frame=${frameIdFromFrameType(savedFrame.frameType)}&remoteFrameId=${savedFrame.frameId}`}
                    className="hc-surface-well hc-surface-well-hover flex items-center justify-between rounded-2xl border px-3 py-3 transition"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-100">
                        {savedFrame.title}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        저장한 프레임을 이어서 수정할 수 있어요.
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
                  </Link>
                ) : (
                  <p className="hc-surface-well rounded-2xl border border-dashed px-4 py-4 text-[11px] text-zinc-400">
                    아직 저장한 프레임이 없어요.
                  </p>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
