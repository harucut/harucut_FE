/**
 * 하루컷 마크의 **도형** — 웹과 앱이 같은 값을 본다.
 *
 * 왜 shared 로 올렸나: 이 도형을 그리는 곳이 여럿이다. 웹 헤더의 `BrandMark`, 앱 알림 아이콘을 굽는
 * `scripts/gen-notification-icon.mjs`, 웹·앱 아이콘을 굽는 `scripts/gen-brand-icons.mjs`. 좌표를 따로 적어 두면
 * 한쪽만 고쳐지고 갈라진다 — `social-marks.ts` 가 shared 로 올라온 것과 같은 이유다.
 *
 * 마크는 **ㅎ** 이다. 하루컷의 첫 글자이자, 위 짧은 획은 셔터, 긴 획은 카메라 윗면, 동그라미는 렌즈로 읽힌다.
 * 렌즈 안의 라임 점이 유일한 색이다. ㅎㅎ(웃음)와도 닿는다. 예전의 초록 네 줄은 작게 보면 배터리처럼 읽혔다.
 *
 * 여기 있는 것은 **좌표와 색**뿐이다. 어떻게 그릴지(React 컴포넌트냐 PNG 냐)는 각자 정한다.
 */

/** 마크 원본 좌표계. */
export const BRAND_MARK_VIEWBOX = { width: 32, height: 32 } as const;

/** 바깥 몸통 — 딥다크 라운드 사각형. 어떤 바탕에서도 ㅎ 이 보이게 받쳐 준다. */
export const BRAND_MARK_BODY = {
  radius: 8,
  fill: '#0B0B0C',
} as const;

export const BRAND_MARK_COLORS = {
  glyph: '#FFFFFF',
  /** 렌즈의 점. 브랜드 강조색과 같다(--hc-primary 다크). */
  accent: '#C8F135',
} as const;

/** ㅎ 의 획. */
export const BRAND_MARK_GLYPH = {
  /** 위 짧은 획 — 셔터 */
  top: { x: 11.4, y: 5.4, width: 9.2, height: 3, rx: 1.5 },
  /** 긴 획 — 카메라 윗면 */
  bar: { x: 6.6, y: 10, width: 18.8, height: 3, rx: 1.5 },
  /** 동그라미 — 렌즈 */
  ring: { cx: 16, cy: 20, r: 5.6, strokeWidth: 3.1 },
  /** 렌즈 안의 점. 살짝 위로 치우쳐 빛을 받은 것처럼 보인다. */
  dot: { cx: 17, cy: 19, r: 1.7 },
} as const;

/**
 * 마크를 SVG 문자열로 만든다.
 *
 * `silhouette` 를 켜면 **몸통을 빼고 ㅎ 만** 한 가지 색으로 그린다. 안드로이드 알림의 작은
 * 아이콘이 그것을 요구한다 — 시스템이 **알파 채널만** 보고 통째로 흰색으로 칠하므로,
 * 불투명한 몸통을 그대로 두면 화면에는 **흰 사각형 하나**만 뜬다(ㅎ 이 그 안에 묻힌다).
 * 실루엣에서는 렌즈 점을 뺀다. 한 색이면 점이 링에 붙어 뭉갠다.
 */
export function brandMarkToSvg(
  options: { silhouette?: boolean; fill?: string } = {},
): string {
  const { silhouette = false, fill = BRAND_MARK_COLORS.glyph } = options;
  const { width, height } = BRAND_MARK_VIEWBOX;
  const { top, bar, ring, dot } = BRAND_MARK_GLYPH;

  const body = silhouette
    ? ''
    : `<rect width="${width}" height="${height}" rx="${BRAND_MARK_BODY.radius}" fill="${BRAND_MARK_BODY.fill}"/>`;
  const strokes =
    `<rect x="${top.x}" y="${top.y}" width="${top.width}" height="${top.height}" rx="${top.rx}" fill="${fill}"/>` +
    `<rect x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" rx="${bar.rx}" fill="${fill}"/>` +
    `<circle cx="${ring.cx}" cy="${ring.cy}" r="${ring.r}" fill="none" stroke="${fill}" stroke-width="${ring.strokeWidth}"/>`;
  const lens = silhouette ? '' : `<circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${BRAND_MARK_COLORS.accent}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}${strokes}${lens}</svg>`;
}
