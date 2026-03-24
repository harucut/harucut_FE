"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DEFAULT_VIDEO_CONVERSION_LIMIT = 3;

type VideoConversionQuotaState = {
  usedCount: number;
  limit: number;
  consume: () => void;
  reset: () => void;
};

export const useVideoConversionQuotaStore = create<VideoConversionQuotaState>()(
  persist(
    (set) => ({
      usedCount: 0,
      limit: DEFAULT_VIDEO_CONVERSION_LIMIT,
      consume: () =>
        set((state) => ({
          usedCount: Math.min(state.usedCount + 1, state.limit),
        })),
      reset: () => set({ usedCount: 0 }),
    }),
    {
      name: "video-conversion-quota",
      version: 1,
    },
  ),
);
