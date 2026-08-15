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
  /**
   * 행사 이름. 행사장 QR 로 들어온 참가자는 `/shoot?event=...` 로 도착한다.
   * 그 사람은 우리 서비스를 고른 적이 없고 "이 행사에서 찍는다"고만 알고 있으므로,
   * 촬영이 끝날 때까지 어느 행사인지 화면에 남겨 둔다.
   */
  eventName: string | null;

  setFrameId: (id: FrameId) => void;
  setEventName: (name: string | null) => void;
  setRemoteFrameId: (id: number | null) => void;
  setBorderColor: (color: string) => void;
  setOutputFilter: (filter: FourcutFilterId) => void;
  setImageResult: (asset: GeneratedFourcutAsset | null) => void;
  clearResults: () => void;
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
  | "eventName"
> = {
  frameId: null,
  remoteFrameId: null,
  shots: [],
  selectedIndexes: createEmptySlots(),
  borderColor: DEFAULT_FRAME_BACKGROUND_COLOR,
  outputFilter: DEFAULT_FOURCUT_FILTER,
  imageResult: null,
  eventName: null,
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

  setEventName: (name) => set({ eventName: name }),

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
