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

/**
 * 랜딩 첫 화면 뒤쪽 두 프레임의 사진. 세 프레임에 같은 넉 장이 들어가 같은 사진이 세 번 보였다.
 * 뒤쪽은 다른 사람들로 채운다 — 커플(겨울 저녁 데이트)과 여행(제주, 친구 셋). 비율은 위와 같고 크기는 400×576 이다.
 * 뒤쪽 프레임 칸은 가장 커도 66×93px 안팎이라 3배 화면에서도 이것으로 충분하다. 첫 화면에서 바로 불러오므로 줄였다.
 */
export const DEMO_COUPLE_PHOTOS: string[] = [
  "/demo/couple-1.webp",
  "/demo/couple-2.webp",
  "/demo/couple-3.webp",
  "/demo/couple-4.webp",
];

export const DEMO_TRAVEL_PHOTOS: string[] = [
  "/demo/travel-1.webp",
  "/demo/travel-2.webp",
  "/demo/travel-3.webp",
  "/demo/travel-4.webp",
];

/** 행사 쪽 화면(/enterprise)의 결혼식 네 컷 예시. */
export const DEMO_WEDDING_PHOTOS: string[] = [
  "/demo/wedding-1.webp",
  "/demo/wedding-2.webp",
  "/demo/wedding-3.webp",
  "/demo/wedding-4.webp",
];
