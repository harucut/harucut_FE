export type Rect = { x: number; y: number; width: number; height: number };

export function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  rect: Rect
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
