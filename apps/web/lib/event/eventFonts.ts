import { Black_Han_Sans, Gowun_Dodum, Nanum_Myeongjo } from "next/font/google";

/*
  행사 테마 글꼴(ADR-0008 §5). next/font 가 빌드 때 받아 같은 오리진(/_next/static)으로 낸다 — Pretendard 와
  같은 이유로 서드파티 CDN 을 쓰지 않는다(app/layout.tsx). 한글 조각이 많아 미리 받지 않는다(preload: false).
  고른 글꼴의 클래스만 화면에 붙으므로, 그 글꼴을 쓰는 행사 화면에서만 글꼴 파일을 받는다.
*/
const nanumMyeongjo = Nanum_Myeongjo({ weight: ["400", "700", "800"], preload: false, display: "swap" });
const gowunDodum = Gowun_Dodum({ weight: "400", preload: false, display: "swap" });
const blackHanSans = Black_Han_Sans({ weight: "400", preload: false, display: "swap" });

/**
 * 글꼴 이름 → 클래스. SYSTEM(서버 기본값)과 PRETENDARD 는 하루컷 기본 서체를 그대로 쓴다 — 테마 없는 행사가
 * 지금 모양을 지키게 한다. 모르는 이름도 기본 서체다.
 */
export function eventFontClassName(font?: string | null): string | undefined {
  switch (font) {
    case "NANUM_MYEONGJO":
      return nanumMyeongjo.className;
    case "GOWUN_DODUM":
      return gowunDodum.className;
    case "BLACK_HAN_SANS":
      return blackHanSans.className;
    default:
      return undefined;
  }
}
