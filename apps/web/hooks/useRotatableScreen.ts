"use client";

import { useEffect } from "react";
import { nativeSetOrientation } from "@/lib/nativeBridge";

/**
 * 이 화면에 있는 동안 앱 창이 기기를 돌리는 대로 따라간다 — 떠나면 다시 세로다.
 *
 * 앱은 세로 고정이다. 촬영 화면만 예외다(2026-11-15 「앱 회전 촬영 때만 해주는 건? 가로로 찍는 사람도 많으니깐」) —
 * 가로로 들면 프리뷰가 옆 배치로 넓어진다(app/create/capture/page.tsx 의 landscape 격자). 브라우저는 원래 돌아가므로
 * 이 훅은 앱 셸에만 알린다(lib/nativeBridge.ts 의 nativeSetOrientation). 셸도 촬영 화면이 아닌 주소로 가면 스스로 다시
 * 잠근다 — 새로고침처럼 이 정리가 못 도는 길이 있어서다.
 */
export function useRotatableScreen() {
  useEffect(() => {
    nativeSetOrientation("free");
    return () => nativeSetOrientation("portrait");
  }, []);
}
