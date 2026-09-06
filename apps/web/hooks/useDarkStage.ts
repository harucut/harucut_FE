"use client";

import { useEffect } from "react";
import { getEffectiveColorTheme, syncThemeColorMeta } from "@/lib/colorTheme";
import { nativeSetColorScheme } from "@/lib/nativeBridge";

/**
 * 사용자 테마와 무관하게 어두운 화면(마케팅 무대 `.hc-stage-dark`, 촬영 뷰파인더)이 켜져 있는
 * 동안 셸의 상태바 글자색·무대색과 브라우저의 theme-color 를 '다크' 로 맞춘다.
 *
 * 그 둘은 `data-theme` 만 보고 정해지므로, 라이트 사용자가 어두운 화면을 열면 어두운 무대 위에
 * 검은 상태바 글자가 놓였다. 화면에 있는 동안만 다크라고 알리고, 떠날 때 실제 테마로 되돌린다.
 */
export function useDarkStage() {
  useEffect(() => {
    nativeSetColorScheme("dark");
    syncThemeColorMeta("dark");
    return () => {
      const actual = getEffectiveColorTheme();
      nativeSetColorScheme(actual);
      syncThemeColorMeta(actual);
    };
  }, []);
}
