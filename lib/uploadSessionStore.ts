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
  draftId: string | null;
  media: FrameMedia[];
  selectedIndexes: SelectionSlot[];
  borderColor: string;
  outputFilter: FourcutFilterId;
  includeVideo: boolean;
  imageResult: GeneratedFourcutAsset | null;
  videoResult: GeneratedFourcutAsset | null;

  setFrameId: (id: FrameId | null) => void;
  setDraftId: (id: string | null) => void;
  setBorderColor: (color: string) => void;
  setOutputFilter: (filter: FourcutFilterId) => void;
  setIncludeVideo: (value: boolean) => void;
  setImageResult: (asset: GeneratedFourcutAsset | null) => void;
  setVideoResult: (asset: GeneratedFourcutAsset | null) => void;
  clearResults: () => void;
  addMedia: (items: FrameMedia[]) => void;
  toggleSelect: (index: number) => void;
  resetAll: () => void;
};

const initialState: Pick<
  UploadSessionState,
  | "frameId"
  | "draftId"
  | "media"
  | "selectedIndexes"
  | "borderColor"
  | "outputFilter"
  | "includeVideo"
  | "imageResult"
  | "videoResult"
> = {
  frameId: null,
  draftId: null,
  media: [],
  selectedIndexes: createEmptySlots(),
  borderColor: DEFAULT_FRAME_BACKGROUND_COLOR,
  outputFilter: DEFAULT_FOURCUT_FILTER,
  includeVideo: false,
  imageResult: null,
  videoResult: null,
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
      videoResult: null,
    }),

  setDraftId: (draftId) =>
    set({
      draftId,
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

  addMedia: (items) =>
    set((state) => ({
      media: [...state.media, ...items],
      imageResult: null,
      videoResult: null,
    })),

  toggleSelect: (index) =>
    set({
      selectedIndexes: toggleIndexInSlots(get().selectedIndexes, index),
      imageResult: null,
      videoResult: null,
    }),

  resetAll: () =>
    set((state) => {
      state.media.forEach((item) => revokeMediaUrl(item.src));
      return initialState;
    }),
}));
