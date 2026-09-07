"use client";

import { useEffect } from "react";
import { setDarkStageOverride } from "@/lib/colorTheme";

/**
 * 사용자 테마와 무관하게 어두운 화면(마케팅 무대 `.hc-stage-dark`, 촬영 뷰파인더)이 켜져 있는
 * 동안 셸의 상태바 글자색·무대색과 브라우저의 theme-color 를 '다크' 로 맞춘다.
 *
 * 그 둘은 `data-theme` 만 보고 정해지므로, 라이트 사용자가 어두운 화면을 열면 어두운 무대 위에
 * 검은 상태바 글자가 놓였다. 화면에 있는 동안만 다크라고 알리고, 떠날 때 실제 테마로 되돌린다.
 *
 * 마운트 때 한 번 보내는 것으로는 모자란다 — 머무는 동안 OS 테마가 바뀌거나 다른 탭에서 설정이
 * 바뀌면 상시 도는 `ColorThemeSync` 가 실제 테마를 다시 적용해 상태바와 theme-color 만 라이트로
 * 되돌린다. 그래서 여기서 직접 보내지 않고 공용 테마 동기화가 든 override 를 켠다 — 그 뒤에
 * 오는 변경까지 다크가 이긴다.
 */
export function useDarkStage() {
  useEffect(() => {
    setDarkStageOverride(true);
    return () => setDarkStageOverride(false);
  }, []);
}
