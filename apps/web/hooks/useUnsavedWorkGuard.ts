"use client";

import { useEffect } from "react";

/**
 * 진행 중인 작업(촬영본·업로드·꾸미기 편집)이 있을 때 브라우저 새로고침/닫기/이탈에
 * 확인 프롬프트를 띄운다. 세션 스토어가 비영속(in-memory)이라 이탈 한 번에 작업물이
 * 사라지는 것을 최소한 경고로 막는다.
 *
 * 주의: beforeunload는 새로고침·탭 닫기·사이트 이탈만 가로챈다. 앱 내부 SPA 이동
 * (router.push)은 대상이 아니다.
 */
export function useUnsavedWorkGuard(hasUnsavedWork: boolean) {
  useEffect(() => {
    if (!hasUnsavedWork) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // 일부 브라우저는 returnValue가 설정돼 있어야 기본 확인창을 띄운다(문구는 무시됨).
      event.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedWork]);
}
