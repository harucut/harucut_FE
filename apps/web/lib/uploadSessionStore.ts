"use client";

import { create } from "zustand";
import type { FrameId } from "@/constants/frames";
import type { FrameMedia } from "@/components/frame/FramePreview";
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

type UploadSessionState = {
  frameId: FrameId | null;
  remoteFrameId: number | null;
  media: FrameMedia[];
  selectedIndexes: SelectionSlot[];
  borderColor: string;
  outputFilter: FourcutFilterId;
  imageResult: GeneratedFourcutAsset | null;

  setFrameId: (id: FrameId | null) => void;
  setRemoteFrameId: (id: number | null) => void;
  setBorderColor: (color: string) => void;
  setOutputFilter: (filter: FourcutFilterId) => void;
  setImageResult: (asset: GeneratedFourcutAsset | null) => void;
  clearResults: () => void;
  addMedia: (items: FrameMedia[]) => void;
  toggleSelect: (index: number) => void;
  resetAll: () => void;
};

const initialState: Pick<
  UploadSessionState,
  | "frameId"
  | "remoteFrameId"
  | "media"
  | "selectedIndexes"
  | "borderColor"
  | "outputFilter"
  | "imageResult"
> = {
  frameId: null,
  remoteFrameId: null,
  media: [],
  selectedIndexes: createEmptySlots(),
  borderColor: DEFAULT_FRAME_BACKGROUND_COLOR,
  outputFilter: DEFAULT_FOURCUT_FILTER,
  imageResult: null,
};

function revokeMediaUrl(src?: string) {
  if (!src?.startsWith("blob:")) return;

  try {
    URL.revokeObjectURL(src);
  } catch {}
}

export const useUploadSession = create<UploadSessionState>((set, get) => ({
  ...initialState,

  setFrameId: (frameId) =>
    set({
      frameId,
      imageResult: null,
    }),

  setRemoteFrameId: (remoteFrameId) =>
    set({
      remoteFrameId,
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

  addMedia: (items) =>
    set((state) => ({
      media: [...state.media, ...items],
      imageResult: null,
    })),

  toggleSelect: (index) =>
    set({
      selectedIndexes: toggleIndexInSlots(get().selectedIndexes, index),
      imageResult: null,
    }),

  resetAll: () =>
    set((state) => {
      state.media.forEach((item) => revokeMediaUrl(item.src));
      return initialState;
    }),
}));
