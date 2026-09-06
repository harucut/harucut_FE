"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { serverDateTimeToMillis } from "@harucut/shared";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { getMyUserInfo, type UserInfo } from "@/lib/userApi";
import { listRecentMedia } from "@/lib/userMediaApi";
import type { UserMedia } from "@/lib/api-types";
import {
  getUserMediaDateLabel,
  getUserMediaPreviewUrl,
  getUserMediaTitle,
} from "@/lib/userMediaPreview";
import { AppNav } from "@/components/layout/AppNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { RecordSourceDialog } from "@/components/shoot/RecordSourceDialog";

/** 홈에 보여 줄 최근 기록 수. 조회도 딱 이만큼만 받는다. */
const RECENT_LIMIT = 4;

/**
 * 홈 카드 한 장의 규격.
 *
 * 둘이 서로 다른 패딩·최소높이를 쓰고 있어서 크기가 제각각이었다. 크기 차이는 중요도
 * 차이로 읽히는데, 이 둘은 나란한 선택지다. 강조는 색이 맡는다.
 * 화면 크기에 따라 달라지는 것은 여백과 글자 크기뿐이다.
 */
const HOME_CARD =
  "flex min-h-19.5 items-center gap-3.5 rounded-2xl p-4 transition lg:min-h-27 lg:p-5.5";

/** 제목·설명은 여기 한 벌만 둔다. 화면 크기가 문구를 바꾸지 않는다. */
const HOME_ACTIONS = [
  {
    id: "shoot",
    title: "기록 남기기",
    description: "찍거나 갖고 있는 사진으로 네 컷을 만들어요",
    href: null as string | null,
    primary: true,
  },
  {
    id: "theme",
    title: "프레임 꾸미기",
    description: "만들어두면 촬영할 때 골라 써요",
    href: "/theme" as string | null,
    primary: false,
  },
];

const WEEKDAY_KO = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

/** 오늘이 며칠인지만 담는 로컬 기준 "yyyy-mm-dd" 키. 날짜가 바뀌었는지 비교하는 용도다. */
function getCurrentDateKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 인사 헤딩용 — "6.27 토요일"(연도·0 패딩 없이). 날짜 키를 받아 표기만 바꾼다 —
// 자정 갱신은 useCurrentDateKey 가 맡는다.
function formatHeadingDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${month}.${day} ${WEEKDAY_KO[date.getDay()]}`;
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
function useCurrentDateKey() {
  const [dateKey, setDateKey] = useState(getCurrentDateKey);

  useEffect(() => {
    let timeoutId: number;

    const refresh = () => {
      setDateKey(getCurrentDateKey());
      timeoutId = window.setTimeout(refresh, getNextDateRefreshDelay());
    };

    const refreshOnVisible = () => {
      if (!document.hidden) {
        setDateKey(getCurrentDateKey());
      }
    };

    timeoutId = window.setTimeout(refresh, getNextDateRefreshDelay());
    document.addEventListener("visibilitychange", refreshOnVisible);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, []);

  return dateKey;
}


export default function HomePage() {
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
  // 헤딩 날짜는 자정에 갱신되는 날짜 키에서 파생된다(별도 타이머 불필요).
  const currentHeadingDate = useMemo(
    () => formatHeadingDate(currentDateKey),
    [currentDateKey],
  );

  return (
    <main className="hc-page-app min-h-dvh pb-[calc(90px+env(safe-area-inset-bottom))] text-(--hc-text) lg:pb-0">
      <AppNav userInitial={user?.username} />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:py-6 lg:gap-9 lg:py-8">
        {/* 인사 — 오늘 날짜 기반 헤딩("6.27 토요일의 / 기록을 남겨보세요.") */}
        <header className="pt-1 lg:pt-0">
          <h1 className="text-[25px] font-bold leading-normal tracking-tight lg:text-[34px] lg:leading-[1.4]">
            <span className="text-(--hc-primary-strong)">{currentHeadingDate}</span>의
            <br />
            기록을 남겨보세요.
          </h1>
        </header>

        {/*
          카드 두 장. **한 벌만 쓴다.**

          예전에는 폰용(lg:hidden)과 데스크톱용(hidden lg:grid) 블록이 따로 있어서, 같은
          카드인데 제목과 설명이 갈렸다("프레임 보기 / 4가지 테마" vs "프레임 꾸미기 /
          만들어두면 촬영할 때 골라 써요"). 화면 크기가 문구를 바꿀 이유는 없다 —
          달라져야 하는 것은 배치뿐이라 반응형 클래스로 처리한다.
        */}
        <section className="grid gap-3.5 lg:grid-cols-2">
          {HOME_ACTIONS.map((action) => {
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-extrabold lg:text-[19px]">
                    {action.title}
                  </span>
                  <span
                    className={`mt-0.5 block text-[13px] lg:mt-1 ${
                      action.primary
                        ? "font-medium opacity-75"
                        : "text-(--hc-muted)"
                    }`}
                  >
                    {action.description}
                  </span>
                </span>
                <ArrowRight
                  className={`h-4.5 w-4.5 shrink-0 transition group-hover:translate-x-0.5 ${
                    action.primary ? "" : "text-(--hc-muted)"
                  }`}
                />
              </>
            );

            /*
              주 카드는 중립(흰 면·검은 글자)이다. 예전에는 초록이었는데 탭바의 촬영 버튼이 같은
              다이얼로그를 여는 같은 초록이라 첫 화면에 같은 행동이 두 번 초록으로 놓였다
              (DESIGN.md 「한 화면 한 초록」). 탭바는 모든 탭에 상주하는 전역 진입로라 초록을 거기
              남기고, 카드는 크기·굵기·그림자로 무게를 갖는다. 보조 카드는 한 단 낮춘다.
            */
            const className = `group ${HOME_CARD} ${
              action.primary
                ? "bg-(--hc-neutral-button-bg) text-left text-(--hc-neutral-button-text) shadow-(--hc-neutral-button-shadow) hover:bg-(--hc-neutral-button-hover)"
                : "hc-surface-well border hover:border-(--hc-border-strong)"
            }`;

            return action.href ? (
              <Link
                key={action.id}
                href={action.href}
                className={className}
              >
                {body}
              </Link>
            ) : (
              <button
                key={action.id}
                type="button"
                onClick={() => setSourceDialogOpen(true)}
                className={`${className} w-full`}
              >
                {body}
              </button>
            );
          })}
        </section>

        {/* 최근 기록 */}
        <section className="flex flex-col gap-4">
          <div className="flex items-end justify-between">
            <h2 className="text-[17px] font-extrabold tracking-tight lg:text-[22px]">
              최근 기록
            </h2>
            <Link
              href="/history"
              className="hc-link-accent inline-flex min-h-11 items-center gap-1 px-1 text-[13px] font-semibold"
            >
              전체보기
              <ArrowRight className="hidden h-3.5 w-3.5 lg:inline" />
            </Link>
          </div>

          {/*
            폰에서는 좌우로 넘긴다. 2열로 아래에 쌓으면 최근 기록만으로 한 화면을 다 써서
            그 아래 내용이 스크롤 밖으로 밀려난다. 화면 밖으로 살짝 걸치게 둬서
            "옆에 더 있다"는 것이 보이게 한다(-mx-4 로 화면 가장자리까지 흘린다).
            md 이상은 자리가 넉넉하니 그대로 4열 그리드.

            실패·빈 상태는 넘길 것이 없으므로 스크롤러가 아니라 한 칸을 채우는 카드다.
          */}
          <div
            className={
              loading || recentMedia.length > 0
                ? "-mx-4 flex snap-x scroll-px-4 gap-3.5 overflow-x-auto px-4 pb-1 scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0"
                : "grid grid-cols-1 gap-3.5 sm:gap-4"
            }
          >
            {loading ? (
              Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="aspect-3/4 w-[42vw] shrink-0 animate-pulse rounded-[18px] bg-(--hc-surface-muted) sm:w-[30vw] md:w-auto"
                />
              ))
            ) : loadError ? (
              // 실패를 빈 상태로 위장하지 않는다. 문구 + 다시 시도.
              <div className="hc-surface-well flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-6 text-center">
                <p className="text-[13px] text-(--hc-muted)">
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
                    className="group flex w-[42vw] shrink-0 snap-start flex-col gap-2 sm:w-[30vw] md:w-auto"
                  >
                    <div className="hc-surface-well relative grid aspect-3/4 place-items-center overflow-hidden rounded-[18px] border bg-(--hc-surface-inset) p-2.5 transition group-hover:border-(--hc-border-strong)">
                      {previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewUrl}
                          alt={getUserMediaTitle(item)}
                          className="absolute inset-0 h-full w-full object-contain p-3"
                        />
                      ) : (
                        <div className="h-full w-full bg-(--hc-surface-muted)" />
                      )}
                    </div>
                    <p className="truncate text-[13px] font-bold tracking-tight">
                      {getUserMediaTitle(item)}
                    </p>
                    {/* 언제 찍은 것인지가 기록에서 가장 먼저 알고 싶은 정보다. */}
                    {getUserMediaDateLabel(item) ? (
                      <p className="-mt-1.5 text-[11px] text-(--hc-muted)">
                        {getUserMediaDateLabel(item)}
                      </p>
                    ) : null}
                  </Link>
                );
              })
            ) : (
              <div className="hc-surface-well flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-6 text-center">
                <p className="text-[13px] text-(--hc-muted)">
                  아직 저장한 기록이 없어요. 첫 네 컷을 남겨보세요.
                </p>
                {/* 위 큰 카드와 같은 것을 연다. 여기만 카메라로 직행하면 같은 뜻의
                    버튼 둘이 다르게 동작한다. */}
                <button
                  type="button"
                  onClick={() => setSourceDialogOpen(true)}
                  className="hc-button-primary rounded-full px-5 py-2 text-[13px] font-semibold"
                >
                  기록 남기기
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
      <MobileTabBar />
      <RecordSourceDialog
        open={sourceDialogOpen}
        onClose={() => setSourceDialogOpen(false)}
      />
    </main>
  );
}
