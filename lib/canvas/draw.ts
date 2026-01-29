export type Rect = { x: number; y: number; width: number; height: number };

/**
 * cover 방식으로 슬롯(rect)에 이미지를 그린다
 * - 이미지 비율 유지 + 가운데 정렬 + 클리핑
 */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  rect: Rect,
) {
  const { x, y, width, height } = rect;

  const scale = Math.max(width / srcW, height / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  const dx = x + (width - dw) / 2;
  const dy = y + (height - dh) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.drawImage(source, dx, dy, dw, dh);
  ctx.restore();
}
