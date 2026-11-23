import { drawCoverInCell, traceCellShape, withCell, type CellGeometry } from "@/lib/canvas/draw";

/** 부른 순서만 적는 가짜 2D 컨텍스트 — jsdom 에는 canvas 가 없다. */
function recorder() {
  const calls: Array<[string, ...number[]]> = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, name: string) =>
        (...args: unknown[]) => {
          calls.push([name, ...args.filter((a): a is number => typeof a === "number").map((n) => Math.round(n * 100) / 100)]);
        },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const CELL: CellGeometry = { x: 100, y: 200, width: 400, height: 300, rotation: 90, shape: { type: "RECT", cornerRadius: 40 } };

// 자유 칸(P5)은 칸 중심을 축으로 돌리고 모양으로 자른다 — 서버 렌더와 같은 기준이어야 미리보기와 결과가 같다.
describe("자유 칸 그리기", () => {
  it("칸 중심으로 옮겨 회전한 좌표계에서 칸 사각형을 넘긴다", () => {
    const { ctx, calls } = recorder();
    let local = null as unknown;
    withCell(ctx, CELL, (rect) => {
      local = rect;
    });
    expect(calls.slice(0, 3)).toEqual([["save"], ["translate", 300, 350], ["rotate", 1.57]]);
    expect(local).toEqual({ x: -200, y: -150, width: 400, height: 300 });
    expect(calls.at(-1)).toEqual(["restore"]);
  });

  it("타원은 ellipse 로, 사각은 모서리 반지름을 칸 반쪽 안으로 줄여 그린다", () => {
    const { ctx, calls } = recorder();
    traceCellShape(ctx, { x: -200, y: -150, width: 400, height: 300 }, { type: "ELLIPSE" });
    expect(calls[1]).toEqual(["ellipse", 0, 0, 200, 150, 0, 0, 6.28]);

    const square = recorder();
    traceCellShape(square.ctx, { x: 0, y: 0, width: 100, height: 100 }, { type: "RECT", cornerRadius: 999 });
    expect(square.calls[1]).toEqual(["moveTo", 50, 0]);
  });

  it("사진은 칸 모양으로 자른 뒤 cover 로 깐다", () => {
    const { ctx, calls } = recorder();
    drawCoverInCell(ctx, {} as CanvasImageSource, 800, 600, CELL);
    const names = calls.map((c) => c[0]);
    expect(names.indexOf("clip")).toBeLessThan(names.indexOf("drawImage"));
    expect(calls.find((c) => c[0] === "drawImage")).toEqual(["drawImage", -200, -150, 400, 300]);
  });
});
