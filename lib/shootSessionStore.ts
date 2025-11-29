"use client";

import { create } from "zustand";
import type { FrameId } from "@/constants/frames";

type ShootSessionState = {
  frameId: FrameId | null;
  shots: string[];
  selectedIndexes: number[];

  setFrameId: (id: FrameId) => void;
  addShot: (dataUrl: string) => void;
  resetShots: () => void;
  toggleSelect: (index: number) => void;
  setSelectedIndexes: (indexes: number[]) => void;
  resetAll: () => void;
};

export const useShootSession = create<ShootSessionState>((set) => ({
  frameId: null,
  shots: [],
  selectedIndexes: [],

  setFrameId: (id) => set({ frameId: id }),
  addShot: (dataUrl) => set((state) => ({ shots: [...state.shots, dataUrl] })),
  resetShots: () => set({ shots: [], selectedIndexes: [] }),
  toggleSelect: (index) =>
    set((state) => {
      const exists = state.selectedIndexes.includes(index);
      if (exists) {
        return {
          selectedIndexes: state.selectedIndexes.filter((i) => i !== index),
        };
      }
      if (state.selectedIndexes.length >= 4) {
        return state;
      }
      return { selectedIndexes: [...state.selectedIndexes, index] };
    }),
  setSelectedIndexes: (indexes) => set({ selectedIndexes: indexes }),
  resetAll: () => set({ frameId: null, shots: [], selectedIndexes: [] }),
}));
