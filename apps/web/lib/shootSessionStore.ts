"use client";

import { create } from "zustand";
import type { FrameId } from "@/constants/frames";
import type { GeneratedFourcutAsset } from "@/lib/fourcutOutput";
import {
  createEmptySlots,
  toggleIndexInSlots,
  type SelectionSlot,
} from "@/lib/selection";
import {
  DEFAULT_FOURCUT_FILTER,
  type FourcutFilterId,
} from "@/lib/frameFilters";
import { DEFAULT_FRAME_BACKGROUND_COLOR } from "@/lib/themeBackground";

export type ShotItem = {
  photo: string;
  video?: string;
};

type ShootSessionState = {
  frameId: FrameId | null;
  remoteFrameId: number | null;
  shots: ShotItem[];
  selectedIndexes: SelectionSlot[];
  borderColor: string;
  outputFilter: FourcutFilterId;
  includeVideo: boolean;
  imageResult: GeneratedFourcutAsset | null;
  videoResult: GeneratedFourcutAsset | null;

  setFrameId: (id: FrameId) => void;
  setRemoteFrameId: (id: number | null) => void;
  setBorderColor: (color: string) => void;
  setOutputFilter: (filter: FourcutFilterId) => void;
  setIncludeVideo: (value: boolean) => void;
  setImageResult: (asset: GeneratedFourcutAsset | null) => void;
  setVideoResult: (asset: GeneratedFourcutAsset | null) => void;
  clearResults: () => void;
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
  | "frameId"
  | "remoteFrameId"
  | "shots"
  | "selectedIndexes"
  | "borderColor"
  | "outputFilter"
  | "includeVideo"
  | "imageResult"
  | "videoResult"
> = {
  frameId: null,
  remoteFrameId: null,
  shots: [],
  selectedIndexes: createEmptySlots(),
  borderColor: DEFAULT_FRAME_BACKGROUND_COLOR,
  outputFilter: DEFAULT_FOURCUT_FILTER,
  includeVideo: false,
  imageResult: null,
  videoResult: null,
};

export const useShootSession = create<ShootSessionState>((set, get) => ({
  ...initialState,

  setFrameId: (frameId) =>
    set({
      frameId,
      imageResult: null,
      videoResult: null,
    }),

  setRemoteFrameId: (id) =>
    set({
      remoteFrameId: id,
      imageResult: null,
      videoResult: null,
    }),

  setBorderColor: (borderColor) =>
    set({
      borderColor,
      imageResult: null,
      videoResult: null,
    }),

  setOutputFilter: (outputFilter) =>
    set({
      outputFilter,
      imageResult: null,
      videoResult: null,
    }),

  setIncludeVideo: (includeVideo) =>
    set({
      includeVideo,
      imageResult: null,
      videoResult: null,
    }),

  setImageResult: (imageResult) => set({ imageResult }),
  setVideoResult: (videoResult) => set({ videoResult }),

  clearResults: () =>
    set({
      imageResult: null,
      videoResult: null,
    }),

  setShots: (shots) =>
    set({
      shots,
      selectedIndexes: createEmptySlots(),
      imageResult: null,
      videoResult: null,
    }),

  toggleSelect: (index) =>
    set({
      selectedIndexes: toggleIndexInSlots(get().selectedIndexes, index),
      imageResult: null,
      videoResult: null,
    }),

  addShotPhoto: (photoDataUrl) =>
    set((state) => ({
      shots: [...state.shots, { photo: photoDataUrl }],
      imageResult: null,
      videoResult: null,
    })),

  attachVideoToShot: (videoUrl) =>
    set((state) => {
      const idx = [...state.shots]
        .map((shot, index) => ({ shot, index }))
        .reverse()
        .find(({ shot }) => !shot.video)?.index;

      if (idx == null) return state;

      const nextShots = [...state.shots];
      revokeBlobUrl(nextShots[idx].video);
      nextShots[idx] = { ...nextShots[idx], video: videoUrl };

      return {
        shots: nextShots,
        imageResult: null,
        videoResult: null,
      };
    }),

  resetShots: () =>
    set((state) => {
      state.shots.forEach((shot) => revokeBlobUrl(shot.video));
      return {
        shots: [],
        selectedIndexes: createEmptySlots(),
        imageResult: null,
        videoResult: null,
      };
    }),

  reset: () =>
    set((state) => {
      state.shots.forEach((shot) => revokeBlobUrl(shot.video));
      return initialState;
    }),
}));
