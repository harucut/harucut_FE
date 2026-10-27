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

// ── 자유 사진 칸(P5) ──

/** 그릴 칸 — lib/frameCells.ts 의 FreeCell 에서 그리기에 필요한 것만. */
export type CellGeometry = Rect & {
  rotation: number;
  shape: { type: "RECT"; cornerRadius: number } | { type: "ELLIPSE" } | { type: "MASK" };
};

/**
 * 칸 중심을 원점으로 옮기고 회전한 좌표계에서 `draw` 를 부른다. `local` 은 그 좌표계의 칸 사각형이다.
 * 서버 렌더(compose-core)와 같은 기준 — 회전은 칸 중심 축, 도 단위.
 */
export function withCell(ctx: CanvasRenderingContext2D, cell: CellGeometry, draw: (local: Rect) => void) {
  ctx.save();
  ctx.translate(cell.x + cell.width / 2, cell.y + cell.height / 2);
  ctx.rotate((cell.rotation * Math.PI) / 180);
  draw({ x: -cell.width / 2, y: -cell.height / 2, width: cell.width, height: cell.height });
  ctx.restore();
}

/** 칸 모양의 경로를 그린다(채우기·자르기·테두리는 부른 쪽이). 이미지 마스크는 아직 없어 사각으로 둔다. */
export function traceCellShape(ctx: CanvasRenderingContext2D, local: Rect, shape: CellGeometry["shape"]) {
  ctx.beginPath();
  if (shape.type === "ELLIPSE") {
    ctx.ellipse(local.x + local.width / 2, local.y + local.height / 2, local.width / 2, local.height / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  const r = shape.type === "RECT" ? Math.max(0, Math.min(shape.cornerRadius, Math.min(local.width, local.height) / 2)) : 0;
  const { x, y, width: w, height: h } = local;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 사진을 칸 모양 안에 cover 로 깐다(회전 포함). */
export function drawCoverInCell(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  cell: CellGeometry,
) {
  withCell(ctx, cell, (local) => {
    traceCellShape(ctx, local, cell.shape);
    ctx.clip();
    drawCover(ctx, source, srcW, srcH, local);
  });
}
