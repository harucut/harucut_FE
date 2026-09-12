import type { ThemeExportJson } from "@/lib/types/themeEditor";

// 랜딩/기능 페이지에서 "꾸민 프레임"을 보여줄 때 쓰는 데모 테마.
// 목업 이미지가 아니라 테마 에디터가 실제로 내보내는 ThemeExportJson 그대로라,
// 제품과 똑같은 렌더러(FramePreview + ThemeOverlaySvg)로 그려진다.
// 좌표계는 grid-4 레이아웃의 원본 캔버스(4000×6000) 기준이다.
export const DEMO_DECORATED_THEME: ThemeExportJson = {
  frameId: "grid-4",
  components: [
    {
      // 우상단 — 첫 컷 모서리를 물고 얹히는 스티커
      id: "demo-sticker-corner",
      type: "STICKER",
      source: "/stickers/sticker-003.png",
      x: 2640,
      y: 40,
      width: 1250,
      height: 740,
      scale: 1,
      rotation: -9,
      zIndex: 6,
    },
    {
      // 아래쪽 두 컷 사이 이음새에 걸치는 스티커
      id: "demo-sticker-seam",
      type: "STICKER",
      source: "/stickers/sticker-012.png",
      x: 1500,
      y: 4460,
      width: 1000,
      height: 790,
      scale: 1,
      rotation: 13,
      zIndex: 7,
    },
    {
      // 하단 여백에 얹는 손글씨 자리 — 에디터의 TEXT 컴포넌트
      id: "demo-text",
      type: "TEXT",
      source: "오늘도, 네 컷",
      x: 200,
      y: 5420,
      width: 3600,
      height: 420,
      scale: 1,
      rotation: 0,
      zIndex: 8,
      styleJson: {
        fontFamily: "Pretendard",
        fontSize: 320,
        color: "#1ED760",
        textAlign: "center",
      },
    },
  ],
};
