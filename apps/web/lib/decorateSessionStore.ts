"use client";

import { create } from "zustand";

// 결과 화면에서 완성된 네컷 이미지를 /decorate 로 넘기기 위한 가벼운 세션.
type DecorateSessionState = {
  imageSrc: string | null;
  title: string;
  setSource: (imageSrc: string, title?: string) => void;
  clear: () => void;
};

export const useDecorateSession = create<DecorateSessionState>((set) => ({
  imageSrc: null,
  title: "하루컷",
  setSource: (imageSrc, title = "하루컷") => set({ imageSrc, title }),
  clear: () => set({ imageSrc: null, title: "하루컷" }),
}));
