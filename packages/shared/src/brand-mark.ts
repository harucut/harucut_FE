/**
 * 하루컷 마크의 **도형** — 웹과 앱이 같은 값을 본다.
 *
 * 왜 shared 로 올렸나: 이 도형을 그리는 곳이 둘이 됐다. 웹 헤더의 `BrandMark` 와, 앱
 * 알림 아이콘을 굽는 `scripts/gen-notification-icon.mjs` 다. 좌표를 양쪽에 적어 두면 한쪽만
 * 고쳐지고 갈라진다 — `social-marks.ts` 가 shared 로 올라온 것과 같은 이유다.
 *
 * 여기 있는 것은 **좌표와 색**뿐이다. 어떻게 그릴지(React 컴포넌트냐 PNG 냐)는 각자 정한다.
 */

/** 마크 원본 좌표계. 세로가 긴 것은 네컷 필름 비율이다. */
export const BRAND_MARK_VIEWBOX = { width: 24, height: 32 } as const;

/** 바깥 몸통 — 딥다크 라운드 사각형. */
export const BRAND_MARK_BODY = {
  radius: 6,
  fill: '#0B0B0C',
} as const;

/** 네 칸 스트립. 위에서 아래로 갈수록 진해진다. */
export const BRAND_MARK_BAR_SHADES = [
  '#7BEAA6',
  '#4FDD86',
  '#2FD06B',
  '#17B551',
] as const;

/** 칸 하나의 크기와 배치. `y = top + index * gap`. */
export const BRAND_MARK_BAR = {
  x: 5,
  top: 4,
  gap: 6.35,
  width: 14,
  height: 5,
  radius: 1.6,
} as const;

/** 칸 하나의 사각형. 웹 컴포넌트와 PNG 생성기가 같이 쓴다. */
export function brandMarkBarRect(index: number) {
  return {
    x: BRAND_MARK_BAR.x,
    y: BRAND_MARK_BAR.top + index * BRAND_MARK_BAR.gap,
    width: BRAND_MARK_BAR.width,
    height: BRAND_MARK_BAR.height,
    rx: BRAND_MARK_BAR.radius,
  };
}

/**
 * 마크를 SVG 문자열로 만든다.
 *
 * `silhouette` 를 켜면 **몸통을 빼고 칸만** 한 가지 색으로 그린다. 안드로이드 알림의 작은
 * 아이콘이 그것을 요구한다 — 시스템이 **알파 채널만** 보고 통째로 흰색으로 칠하므로,
 * 불투명한 몸통을 그대로 두면 화면에는 **흰 사각형 하나**만 뜬다(칸이 그 안에 묻힌다).
 */
export function brandMarkToSvg(
  options: { silhouette?: boolean; fill?: string } = {},
): string {
  const { silhouette = false, fill = '#FFFFFF' } = options;
  const { width, height } = BRAND_MARK_VIEWBOX;

  const body = silhouette
    ? ''
    : `<rect width="${width}" height="${height}" rx="${BRAND_MARK_BODY.radius}" fill="${BRAND_MARK_BODY.fill}"/>`;

  const bars = BRAND_MARK_BAR_SHADES.map((shade, index) => {
    const rect = brandMarkBarRect(index);
    return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${rect.rx}" fill="${silhouette ? fill : shade}"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}${bars}</svg>`;
}
