"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  ChevronRight,
  History,
  Palette,
  Upload,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FRAME_CATALOG } from "@/lib/frameCatalog";
import { getMyUserInfo, type UserInfo } from "@/lib/userApi";
import { listMyMedia } from "@/lib/userMediaApi";
import { listMyFrames } from "@/lib/remoteFrameApi";
import type { UserMedia, RemoteFrame } from "@/lib/api-types";
import { frameIdFromFrameType } from "@/lib/frameApi";

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

const quickLinks = [
  { label: "촬영", href: "/shoot", icon: Camera },
  { label: "업로드", href: "/upload", icon: Upload },
  { label: "꾸미기", href: "/theme", icon: Palette },
  { label: "기록", href: "/history", icon: History },
] as const;

export default function HomePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [recentMedia, setRecentMedia] = useState<UserMedia[]>([]);
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

  const recentMoment = useMemo(
    () => getRecentMoment(recentMedia),
    [recentMedia],
  );
  const recommendedFrames = FRAME_CATALOG.slice(0, 3);
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
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="hc-surface-well hc-surface-well-hover flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm text-zinc-200 transition"
                >
                  <Icon className="h-4 w-4 text-[color:var(--hc-primary)]" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </section>

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
                recentMedia.map((item) => (
                  <div
                    key={item.mediaId}
                    className="hc-surface-well overflow-hidden rounded-3xl border"
                  >
                    {item.downloadUrl ? (
                      item.mediaType === "VIDEO" ? (
                        <video
                          src={item.downloadUrl}
                          className="aspect-[3/4] w-full object-cover"
                          muted
                          playsInline
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.downloadUrl}
                          alt={item.displayName ?? "최근 기록"}
                          className="aspect-[3/4] w-full object-cover"
                        />
                      )
                    ) : (
                      <div className="aspect-[3/4] bg-white/5" />
                    )}
                  </div>
                ))
              ) : (
                <div className="hc-surface-well col-span-2 rounded-3xl border border-dashed p-5 text-center text-[11px] text-zinc-400">
                  아직 저장한 결과가 없어요.
                </div>
              )}
            </div>
          </section>

          <div className="flex flex-col gap-4">
            <section className="hc-surface-card rounded-[28px] border p-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                Frame picks
              </p>
              <div className="mt-3 space-y-2">
                {recommendedFrames.map((frame) => (
                  <Link
                    key={frame.id}
                    href={`/shoot?frame=${frame.id}`}
                    className="hc-surface-well hc-surface-well-hover flex items-center justify-between rounded-2xl border px-3 py-3 transition"
                  >
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">
                        {frame.name}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {frame.badge}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-zinc-500" />
                  </Link>
                ))}
              </div>
            </section>

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
