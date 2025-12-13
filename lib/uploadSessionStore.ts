"use client";

import { create } from "zustand";
import type { FrameId } from "@/constants/frames";
import type { FrameMedia } from "@/components/frame/FramePreview";

const MAX_SELECT = 4;

type UploadSessionState = {
  frameId: FrameId | null;
  media: FrameMedia[];
  selectedIndexes: (number | null)[];

  setFrameId: (id: FrameId | null) => void;
  addMedia: (items: FrameMedia[]) => void;
  toggleSelect: (index: number) => void;
  resetAll: () => void;
};

export const useUploadSession = create<UploadSessionState>((set) => ({
  frameId: null,
  media: [],
  selectedIndexes: Array(MAX_SELECT).fill(null),

  setFrameId: (id) => set({ frameId: id }),

  addMedia: (items) =>
    set((state) => ({
      media: [...state.media, ...items],
    })),

  toggleSelect: (index) =>
    set((state) => {
      const selected = [...state.selectedIndexes];
      const existingSlot = selected.indexOf(index);

      if (existingSlot !== -1) {
        selected[existingSlot] = null;
        return { selectedIndexes: selected };
      }

      const emptySlot = selected.indexOf(null);
      if (emptySlot === -1) return state;

      selected[emptySlot] = index;
      return { selectedIndexes: selected };
    }),

  resetAll: () =>
    set({
      frameId: null,
      media: [],
      selectedIndexes: Array(MAX_SELECT).fill(null),
    }),
}));
