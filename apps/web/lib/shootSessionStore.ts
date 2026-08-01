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

type ShootSessionState = {
  frameId: FrameId | null;
  remoteFrameId: number | null;
  // 촬영본은 data URL 문자열 배열이다.
  shots: string[];
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
  setShots: (shots: string[]) => void;
  toggleSelect: (index: number) => void;
  clearSelection: () => void;
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

  // 4장 선택만 비운다(촬영본은 유지). '선택 초기화' 버튼이 세션 전체를 지우지 않도록.
  clearSelection: () =>
    set({
      selectedIndexes: createEmptySlots(),
      imageResult: null,
    }),

  addShotPhoto: (photoDataUrl) =>
    set((state) => ({
      shots: [...state.shots, photoDataUrl],
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
