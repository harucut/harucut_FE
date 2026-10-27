import type { FrameLayout } from "@/constants/frameLayouts";

/**
 * 자유 사진 칸(P5, R5 6절). 네 칸은 유지하고 칸마다 위치·크기·회전·모양과 「몇 번째 사진을 넣을지」를 정한다.
 * 칸 수를 바꾸는 일은 필요가 확정될 때만 한다(R5) — 그래서 여기서는 늘 4칸이다.
 *
 * 값은 서버 계약(프레임 cells, FrameSpec v2 layout.cells)과 같은 모양이다. 검증도 서버와 같은 규칙으로 미리 해,
 * 저장 버튼을 누르기 전에 무엇이 틀렸는지 알려 준다(서버가 마지막에 400 GEN-002 로 다시 막는다).
 * 좌표는 프레임 캔버스(px) 기준이고, 회전은 칸 중심을 축으로 도(degree) 단위다.
 */

export const FREE_CELL_COUNT = 4;
/** 칸 한 변의 최소 길이(px). 너무 작은 칸은 사진이 알아볼 수 없게 줄어든다. */
export const MIN_CELL_SIZE = 100;
export const MAX_CELL_ROTATION = 180;
/** 고정 레이아웃의 칸 모서리 반지름 — 렌더러들이 써 온 값이다. 자유 칸의 기본 모양도 이것으로 시작한다. */
export const DEFAULT_CELL_RADIUS = 40;

export type FreeCellShape =
  | { type: "RECT"; cornerRadius: number }
  | { type: "ELLIPSE" }
  /** 이미지 마스크 — 계약에 자리만 있고 아직 저장할 수 없다(서버 400). 편집기는 고를 수 없게 둔다. */
  | { type: "MASK"; maskAssetId: string };

export type FreeCell = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 도, -180~180, 칸 중심 기준. */
  rotation: number;
  shape: FreeCellShape;
  /** 이 칸에 넣을 사진의 순서(0~3). 네 칸에서 서로 달라야 한다. */
  shotIndex: number;
};

/** 고정 레이아웃을 자유 칸 4개로 옮긴다 — 「칸 자유 편집」을 켜면 지금 모양에서 시작한다. */
export function cellsFromLayout(layout: FrameLayout): FreeCell[] {
  return layout.slots.slice(0, FREE_CELL_COUNT).map((slot, index) => ({
    x: slot.x,
    y: slot.y,
    width: slot.width,
    height: slot.height,
    rotation: 0,
    shape: { type: "RECT", cornerRadius: DEFAULT_CELL_RADIUS },
    shotIndex: index,
  }));
}

export type CellViolation = { index: number | null; field: string; reason: string };

/** 서버 검증과 같은 규칙. 비면 저장할 수 있다. */
export function validateCells(cells: FreeCell[], canvas: { width: number; height: number }): CellViolation[] {
  const violations: CellViolation[] = [];
  if (cells.length !== FREE_CELL_COUNT) {
    violations.push({ index: null, field: "cells", reason: `사진 칸은 ${FREE_CELL_COUNT}개여야 해요.` });
    return violations;
  }
  const shots = new Set<number>();
  cells.forEach((cell, index) => {
    const at = (field: string, reason: string) => violations.push({ index, field, reason });
    if (![cell.x, cell.y, cell.width, cell.height].every(Number.isInteger)) at("x", "위치와 크기는 정수(px)여야 해요.");
    if (cell.width < MIN_CELL_SIZE || cell.height < MIN_CELL_SIZE) {
      at("width", `칸은 가로·세로 ${MIN_CELL_SIZE}px 이상이어야 해요.`);
    }
    // 회전 전 사각형이 캔버스 안에 있어야 한다(서버와 같은 기준).
    if (cell.x < 0 || cell.y < 0 || cell.x + cell.width > canvas.width || cell.y + cell.height > canvas.height) {
      at("x", "칸이 프레임 밖으로 나갔어요.");
    }
    if (!Number.isFinite(cell.rotation) || Math.abs(cell.rotation) > MAX_CELL_ROTATION) {
      at("rotation", `회전은 -${MAX_CELL_ROTATION}~${MAX_CELL_ROTATION}도여야 해요.`);
    }
    if (cell.shape.type === "RECT") {
      const max = Math.min(cell.width, cell.height) / 2;
      if (!(cell.shape.cornerRadius >= 0 && cell.shape.cornerRadius <= max)) {
        at("shape.cornerRadius", `모서리는 0~${Math.floor(max)}px 이어야 해요.`);
      }
    } else if (cell.shape.type === "MASK") {
      at("shape", "이미지 모양은 아직 쓸 수 없어요.");
    }
    if (!Number.isInteger(cell.shotIndex) || cell.shotIndex < 0 || cell.shotIndex >= FREE_CELL_COUNT) {
      at("shotIndex", "사진 순서는 1~4번 중 하나여야 해요.");
    } else if (shots.has(cell.shotIndex)) {
      at("shotIndex", `${cell.shotIndex + 1}번 사진이 두 칸에 들어갔어요.`);
    }
    shots.add(cell.shotIndex);
  });
  return violations;
}

/** 회전한 칸의 네 꼭짓점(캔버스 좌표). 렌더·바운딩 박스·히트 판정에 쓴다. */
export function cellCorners(cell: FreeCell): Array<{ x: number; y: number }> {
  const cx = cell.x + cell.width / 2;
  const cy = cell.y + cell.height / 2;
  const rad = (cell.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    [-cell.width / 2, -cell.height / 2],
    [cell.width / 2, -cell.height / 2],
    [cell.width / 2, cell.height / 2],
    [-cell.width / 2, cell.height / 2],
  ].map(([dx, dy]) => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }));
}

/**
 * 편집 입력을 저장할 수 있는 값으로 맞춘다 — 정수로 반올림하고, 최소 크기·캔버스 범위·회전 범위·모서리 범위 안으로 넣는다.
 * shotIndex 중복은 고치지 않는다(어느 칸을 바꿀지 편집기가 정한다 — swapShotIndex).
 */
export function clampCell(cell: FreeCell, canvas: { width: number; height: number }): FreeCell {
  const width = Math.min(canvas.width, Math.max(MIN_CELL_SIZE, Math.round(cell.width)));
  const height = Math.min(canvas.height, Math.max(MIN_CELL_SIZE, Math.round(cell.height)));
  const x = Math.min(canvas.width - width, Math.max(0, Math.round(cell.x)));
  const y = Math.min(canvas.height - height, Math.max(0, Math.round(cell.y)));
  const rotation = Math.max(-MAX_CELL_ROTATION, Math.min(MAX_CELL_ROTATION, Number.isFinite(cell.rotation) ? cell.rotation : 0));
  const shape: FreeCellShape =
    cell.shape.type === "RECT"
      ? { type: "RECT", cornerRadius: Math.max(0, Math.min(Math.floor(Math.min(width, height) / 2), Math.round(cell.shape.cornerRadius))) }
      : cell.shape;
  return { ...cell, x, y, width, height, rotation, shape };
}

/**
 * 한 칸의 사진 순서를 바꾼다. 그 순서를 쓰던 다른 칸과 맞바꿔 네 칸이 늘 서로 다르게 둔다.
 */
export function swapShotIndex(cells: FreeCell[], index: number, shotIndex: number): FreeCell[] {
  const current = cells[index]?.shotIndex;
  if (current === undefined || current === shotIndex) return cells;
  return cells.map((cell, i) => {
    if (i === index) return { ...cell, shotIndex };
    if (cell.shotIndex === shotIndex) return { ...cell, shotIndex: current };
    return cell;
  });
}
