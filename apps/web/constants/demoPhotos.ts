/**
 * 데모 프레임의 슬롯에 넣는 사진 넉 장(랜딩·기능·로그인).
 *
 * 슬롯에는 낱장 사진이 들어간다 — 제품이 실제로 만드는 것과 같은 모양이다. grid-4 슬롯 비율에 맞춘
 * 640×922 webp 이고, 큰 슬롯(CSS 200px 안팎)을 3배 화면에서 봐도 흐리지 않다.
 * 친구 둘이 카페에서 폰을 세워 두고 찍은 한 회차다. 네 장 다 얼굴을 붙이지 않는다(붙인 것은 네 번째 하나).
 *
 * 전부 AI 로 만든 이미지다. 화면에 AI 표시는 두지 않는다 — 이유는 docs/frame-assets.md 「웹 기본 스티커와 데모 사진」.
 */
export const DEMO_PHOTOS: string[] = [
  "/demo/cut-1.webp",
  "/demo/cut-2.webp",
  "/demo/cut-3.webp",
  "/demo/cut-4.webp",
];

/** 행사 쪽 화면(/enterprise)의 결혼식 네 컷 예시. */
export const DEMO_WEDDING_PHOTOS: string[] = [
  "/demo/wedding-1.webp",
  "/demo/wedding-2.webp",
  "/demo/wedding-3.webp",
  "/demo/wedding-4.webp",
];
