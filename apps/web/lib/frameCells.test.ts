import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import {
  cellCorners,
  cellsFromLayout,
  clampCell,
  swapShotIndex,
  validateCells,
  type FreeCell,
} from "@/lib/frameCells";

const CANVAS = { width: 2000, height: 6000 };

/*
  자유 사진 칸(P5) 규칙. 서버 검증(400 GEN-002)과 같은 기준이라, 여기서 통과한 값은 서버에서도 통과해야 한다.
*/
describe("자유 사진 칸", () => {
  it("고정 레이아웃에서 시작하면 지금 모양 그대로 네 칸이고 사진 순서는 칸 순서와 같다", () => {
    const cells = cellsFromLayout(FRAME_LAYOUTS["classic-4"]);
    expect(cells).toHaveLength(4);
    expect(cells.map((c) => c.shotIndex)).toEqual([0, 1, 2, 3]);
    expect(cells[1]).toMatchObject({ x: 150, y: 1480, width: 1700, height: 1200, rotation: 0, shape: { type: "RECT", cornerRadius: 40 } });
    expect(validateCells(cells, CANVAS)).toEqual([]);
  });

  it("칸 수·크기·범위·회전·모서리·순서 중복·이미지 모양을 막는다", () => {
    const base = cellsFromLayout(FRAME_LAYOUTS["classic-4"]);
    expect(validateCells(base.slice(0, 3), CANVAS)[0].field).toBe("cells");

    const bad: FreeCell[] = [
      { ...base[0], width: 99 },
      { ...base[1], x: 1000 },
      { ...base[2], rotation: 181, shape: { type: "RECT", cornerRadius: 700 } },
      { ...base[3], shotIndex: 0 },
    ];
    const fields = validateCells(bad, CANVAS).map((v) => `${v.index}:${v.field}`);
    expect(fields).toEqual(["0:width", "1:x", "2:rotation", "2:shape.cornerRadius", "3:shotIndex"]);

    const masked: FreeCell[] = [{ ...base[0], shape: { type: "MASK", maskAssetId: "a1" } }, ...base.slice(1)];
    expect(validateCells(masked, CANVAS)[0]).toMatchObject({ index: 0, field: "shape" });
  });

  it("편집 입력을 저장할 수 있는 값으로 맞춘다", () => {
    const cell = clampCell(
      { x: -10.4, y: 5900, width: 50, height: 300.6, rotation: 400, shape: { type: "RECT", cornerRadius: 999 }, shotIndex: 2 },
      CANVAS,
    );
    expect(cell).toEqual({ x: 0, y: 5699, width: 100, height: 301, rotation: 180, shape: { type: "RECT", cornerRadius: 50 }, shotIndex: 2 });
    expect(validateCells([cell, ...cellsFromLayout(FRAME_LAYOUTS["classic-4"]).slice(1)].map((c, i) => ({ ...c, shotIndex: [2, 1, 0, 3][i] })), CANVAS)).toEqual([]);
  });

  it("사진 순서를 바꾸면 그 순서를 쓰던 칸과 맞바꾼다", () => {
    const cells = swapShotIndex(cellsFromLayout(FRAME_LAYOUTS["grid-4"]), 0, 3);
    expect(cells.map((c) => c.shotIndex)).toEqual([3, 1, 2, 0]);
  });

  it("회전한 칸의 꼭짓점을 중심 기준으로 구한다", () => {
    const corners = cellCorners({ x: 0, y: 0, width: 200, height: 100, rotation: 90, shape: { type: "ELLIPSE" }, shotIndex: 0 });
    expect(corners.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [150, -50],
      [150, 150],
      [50, 150],
      [50, -50],
    ]);
  });
});
