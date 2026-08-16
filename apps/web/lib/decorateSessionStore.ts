"use client";

import { create } from "zustand";

// 결과 화면에서 완성된 네컷 이미지를 /decorate 로 넘기기 위한 가벼운 세션.
type DecorateSessionState = {
  imageSrc: string | null;
  title: string;
  /** 어느 결과 화면에서 왔는지. 꾸미기에서 나갈 길을 만드는 데 쓴다. */
  origin: string;
  setSource: (imageSrc: string, opts?: { title?: string; origin?: string }) => void;
};

export const useDecorateSession = create<DecorateSessionState>((set) => ({
  imageSrc: null,
  title: "하루컷",
  origin: "/home",
  setSource: (imageSrc, opts) =>
    set({
      imageSrc,
      title: opts?.title ?? "하루컷",
      origin: opts?.origin ?? "/home",
    }),
}));
