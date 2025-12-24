"use client";

import { create } from "zustand";
import type { FrameId } from "@/constants/frames";
import type { FrameMedia } from "@/components/frame/FramePreview";
import {
  createEmptySlots,
  toggleIndexInSlots,
  type SelectionSlot,
} from "@/lib/selection";

type UploadSessionState = {
  frameId: FrameId | null;
  media: FrameMedia[];
  selectedIndexes: SelectionSlot[];

  setFrameId: (id: FrameId | null) => void;
  addMedia: (items: FrameMedia[]) => void;
  toggleSelect: (index: number) => void;
  resetAll: () => void;
};

const initialState: Pick<
  UploadSessionState,
  "frameId" | "media" | "selectedIndexes"
> = {
  frameId: null,
  media: [],
  selectedIndexes: createEmptySlots(),
};

export const useUploadSession = create<UploadSessionState>((set, get) => ({
  ...initialState,

  setFrameId: (id) => set({ frameId: id }),

  addMedia: (items) =>
    set((state) => ({
      media: [...state.media, ...items],
    })),

  toggleSelect: (index) =>
    set({
      selectedIndexes: toggleIndexInSlots(get().selectedIndexes, index),
    }),

  resetAll: () => set(initialState),
}));
