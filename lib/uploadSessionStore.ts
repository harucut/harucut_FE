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
  draftId: string | null;
  media: FrameMedia[];
  selectedIndexes: SelectionSlot[];

  setFrameId: (id: FrameId | null) => void;
  setDraftId: (id: string | null) => void;
  addMedia: (items: FrameMedia[]) => void;
  toggleSelect: (index: number) => void;
  resetAll: () => void;
};

const initialState: Pick<
  UploadSessionState,
  "frameId" | "draftId" | "media" | "selectedIndexes"
> = {
  frameId: null,
  draftId: null,
  media: [],
  selectedIndexes: createEmptySlots(),
};

export const useUploadSession = create<UploadSessionState>((set, get) => ({
  ...initialState,

  setFrameId: (id) => set({ frameId: id }),
  setDraftId: (id) => set({ draftId: id }),

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
