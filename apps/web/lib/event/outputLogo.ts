/**
 * 완성 사진의 행사 로고 자리(theme.branding.outputLogo = ORGANIZER_LOGO). 서버 합성과 같은 규칙이다 — 미리보기가
 * 결과와 다르면 안 된다. 오른쪽 아래, 여백은 캔버스 너비의 3%, 너비는 18%. 너무 길쭉하면 높이를 캔버스 높이의 12% 로
 * 묶고 너비를 비율대로 줄인다. 값은 캔버스 px 이고 각각 반올림한다. 자유 문구보다 위에 얹는다.
 */
export function outputLogoRect(canvas: { width: number; height: number }, logo: { width: number; height: number }) {
  const margin = Math.round(canvas.width * 0.03);
  let width = canvas.width * 0.18;
  let height = width * (logo.height / logo.width);
  if (height > canvas.height * 0.12) {
    height = canvas.height * 0.12;
    width = height * (logo.width / logo.height);
  }
  width = Math.round(width);
  height = Math.round(height);
  return { x: canvas.width - margin - width, y: canvas.height - margin - height, width, height };
}
