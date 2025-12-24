import { create } from "zustand";
import type { FrameId } from "@/constants/frames";

type ThemeSessionState = {
  frameId: FrameId | null;
  setFrameId: (id: FrameId) => void;
  reset: () => void;
};

export const useThemeSession = create<ThemeSessionState>((set) => ({
  frameId: null,
  setFrameId: (id) => set({ frameId: id }),
  reset: () => set({ frameId: null }),
}));
