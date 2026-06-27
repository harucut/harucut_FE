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
};

type ShootSessionState = {
  frameId: FrameId | null;
  remoteFrameId: number | null;
  shots: ShotItem[];
  selectedIndexes: SelectionSlot[];
  borderColor: string;
  outputFilter: FourcutFilterId;
  imageResult: GeneratedFourcutAsset | null;

  setFrameId: (id: FrameId) => void;
  setRemoteFrameId: (id: number | null) => void;
  setBorderColor: (color: string) => void;
  setOutputFilter: (filter: FourcutFilterId) => void;
  setImageResult: (asset: GeneratedFourcutAsset | null) => void;
  clearResults: () => void;
  setShots: (shots: ShotItem[]) => void;
  toggleSelect: (index: number) => void;
  addShotPhoto: (photoDataUrl: string) => void;
  resetShots: () => void;
  reset: () => void;
};

const initialState: Pick<
  ShootSessionState,
  | "frameId"
  | "remoteFrameId"
  | "shots"
  | "selectedIndexes"
  | "borderColor"
  | "outputFilter"
  | "imageResult"
> = {
  frameId: null,
  remoteFrameId: null,
  shots: [],
  selectedIndexes: createEmptySlots(),
  borderColor: DEFAULT_FRAME_BACKGROUND_COLOR,
  outputFilter: DEFAULT_FOURCUT_FILTER,
  imageResult: null,
};

export const useShootSession = create<ShootSessionState>((set, get) => ({
  ...initialState,

  setFrameId: (frameId) =>
    set({
      frameId,
      imageResult: null,
    }),

  setRemoteFrameId: (id) =>
    set({
      remoteFrameId: id,
      imageResult: null,
    }),

  setBorderColor: (borderColor) =>
    set({
      borderColor,
      imageResult: null,
    }),

  setOutputFilter: (outputFilter) =>
    set({
      outputFilter,
      imageResult: null,
    }),

  setImageResult: (imageResult) => set({ imageResult }),

  clearResults: () =>
    set({
      imageResult: null,
    }),

  setShots: (shots) =>
    set({
      shots,
      selectedIndexes: createEmptySlots(),
      imageResult: null,
    }),

  toggleSelect: (index) =>
    set({
      selectedIndexes: toggleIndexInSlots(get().selectedIndexes, index),
      imageResult: null,
    }),

  addShotPhoto: (photoDataUrl) =>
    set((state) => ({
      shots: [...state.shots, { photo: photoDataUrl }],
      imageResult: null,
    })),

  resetShots: () =>
    set(() => ({
      shots: [],
      selectedIndexes: createEmptySlots(),
      imageResult: null,
    })),

  reset: () => set(() => initialState),
}));
