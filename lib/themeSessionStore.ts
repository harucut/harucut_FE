import { create } from "zustand";
import type { FrameId } from "@/constants/frames";

type ThemeSessionState = {
  frameId: FrameId | null;
  remoteFrameId: number | null;
  setFrameId: (id: FrameId | null) => void;
  setRemoteFrameId: (id: number | null) => void;
  reset: () => void;
};

export const useThemeSession = create<ThemeSessionState>((set) => ({
  frameId: null,
  remoteFrameId: null,
  setFrameId: (id) => set({ frameId: id }),
  setRemoteFrameId: (id) => set({ remoteFrameId: id }),
  reset: () => set({ frameId: null, remoteFrameId: null }),
}));
