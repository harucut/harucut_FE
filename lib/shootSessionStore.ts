"use client";

import { create } from "zustand";
import type { FrameId } from "@/constants/frames";
import {
  createEmptySlots,
  toggleIndexInSlots,
  type SelectionSlot,
} from "@/lib/selection";

export type ShotItem = {
  photo: string;
  video?: string;
};

type ShootSessionState = {
  frameId: FrameId | null;
  shots: ShotItem[];
  selectedIndexes: SelectionSlot[];

  setFrameId: (id: FrameId) => void;
  setShots: (shots: ShotItem[]) => void;
  toggleSelect: (index: number) => void;

  addShotPhoto: (photoDataUrl: string) => void;
  attachVideoToShot: (videoUrl: string) => void;
  resetShots: () => void;

  reset: () => void;
};

function revokeBlobUrl(url?: string) {
  if (!url) return;
  if (url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
}

const initialState: Pick<
  ShootSessionState,
  "frameId" | "shots" | "selectedIndexes"
> = {
  frameId: null,
  shots: [],
  selectedIndexes: createEmptySlots(),
};

export const useShootSession = create<ShootSessionState>((set, get) => ({
  ...initialState,

  setFrameId: (frameId) => set({ frameId }),

  setShots: (shots) =>
    set({
      shots,
      selectedIndexes: createEmptySlots(),
    }),

  toggleSelect: (index) =>
    set({
      selectedIndexes: toggleIndexInSlots(get().selectedIndexes, index),
    }),

  addShotPhoto: (photoDataUrl) =>
    set((state) => ({
      shots: [...state.shots, { photo: photoDataUrl }],
      selectedIndexes: state.selectedIndexes,
    })),

  attachVideoToShot: (videoUrl) =>
    set((state) => {
      const idx = [...state.shots]
        .map((s, i) => ({ s, i }))
        .reverse()
        .find(({ s }) => !s.video)?.i;

      if (idx == null) return state;

      const next = [...state.shots];
      revokeBlobUrl(next[idx].video);
      next[idx] = { ...next[idx], video: videoUrl };
      return { shots: next };
    }),

  resetShots: () =>
    set((state) => {
      state.shots.forEach((s) => revokeBlobUrl(s.video));
      return {
        shots: [],
        selectedIndexes: createEmptySlots(),
      };
    }),

  reset: () =>
    set((state) => {
      state.shots.forEach((s) => revokeBlobUrl(s.video));
      return initialState;
    }),
}));
