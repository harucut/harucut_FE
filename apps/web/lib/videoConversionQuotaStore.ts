"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getSubscriptionUsage } from "@/lib/userApi";

// 게스트/비로그인 또는 사용량 조회 실패 시의 로컬 기본 한도.
// 로그인 사용자는 서버 구독 사용량(setQuota)으로 덮어쓴다.
export const DEFAULT_VIDEO_CONVERSION_LIMIT = 3;

type VideoConversionQuotaState = {
  usedCount: number;
  limit: number;
  /** 무제한 요금제 여부. true면 limit 값은 무시한다. */
  unlimited: boolean;
  consume: () => void;
  reset: () => void;
  setQuota: (quota: {
    usedCount: number;
    limit: number;
    unlimited: boolean;
  }) => void;
};

export const useVideoConversionQuotaStore = create<VideoConversionQuotaState>()(
  persist(
    (set) => ({
      usedCount: 0,
      limit: DEFAULT_VIDEO_CONVERSION_LIMIT,
      unlimited: false,
      consume: () =>
        set((state) =>
          state.unlimited
            ? { usedCount: state.usedCount + 1 }
            : { usedCount: Math.min(state.usedCount + 1, state.limit) },
        ),
      reset: () => set({ usedCount: 0 }),
      setQuota: ({ usedCount, limit, unlimited }) =>
        set({ usedCount, limit, unlimited }),
    }),
    {
      name: "video-conversion-quota",
      version: 1,
    },
  ),
);

/**
 * 로그인 사용자의 영상 업로드 사용량을 서버(GET /api/auth/user/subscription/usage)에서
 * 받아와 스토어에 반영한다. 게스트/비로그인이거나 조회 실패 시 로컬 기본값을 유지한다.
 * @param enabled 게스트 모드 등에서 호출을 막을 때 false (기본 true)
 */
export function useHydrateVideoConversionQuota(enabled = true) {
  const setQuota = useVideoConversionQuotaStore((state) => state.setQuota);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void getSubscriptionUsage()
      .then((usage) => {
        if (cancelled) return;
        setQuota({
          usedCount: usage.videoUploadUsedCount,
          limit: usage.videoUploadMonthlyLimit,
          unlimited: usage.videoUploadUnlimited,
        });
      })
      .catch(() => {
        // 게스트/비로그인 또는 일시 오류 — 로컬 기본값 유지
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, setQuota]);
}
