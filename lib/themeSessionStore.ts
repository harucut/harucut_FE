import { create } from "zustand";
import type { FrameId } from "@/constants/frames";

type ThemeSessionState = {
  frameId: FrameId | null;
  draftId: string | null;
  setFrameId: (id: FrameId | null) => void;
  setDraftId: (id: string | null) => void;
  reset: () => void;
};

export const useThemeSession = create<ThemeSessionState>((set) => ({
  frameId: null,
  draftId: null,
  setFrameId: (id) => set({ frameId: id }),
  setDraftId: (id) => set({ draftId: id }),
  reset: () => set({ frameId: null, draftId: null }),
}));
