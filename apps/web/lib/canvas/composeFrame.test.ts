import { composeFramePng, fitCanvasScale } from "@/lib/canvas/composeFrame";

describe("composeFrame validations", () => {
  const layout = {
    totalWidth: 100,
    totalHeight: 100,
    slots: [
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 50, y: 0, width: 50, height: 50 },
      { x: 0, y: 50, width: 50, height: 50 },
      { x: 50, y: 50, width: 50, height: 50 },
    ],
  };

  // 슬롯 개수와 소스 개수가 다르면 합성을 시작하면 안 됩니다.
  it("throws when PNG sources length does not match slot count", async () => {
    await expect(
      composeFramePng({
        layout,
        borderColor: "#000",
        sources: [{ src: "/a.png" }],
      }),
    ).rejects.toThrow("sources length must match slot count");
  });
});

// iOS Safari 는 캔버스 넓이가 2^24px 를 넘으면 조용히 빈 캔버스를 돌려준다.
// 가로 4컷(6000×4000)·세로형(4000×6000)이 24MP 라 그 선을 넘는다.
describe("fitCanvasScale", () => {
  it("leaves canvases within the budget untouched", () => {
    // 세로 4컷 2000×6000 = 12MP — 상한 안이다.
    expect(fitCanvasScale(2000, 6000)).toBe(1);
  });

  it("shrinks oversized canvases below the budget while keeping the ratio", () => {
    const scale = fitCanvasScale(6000, 4000);
    expect(scale).toBeLessThan(1);

    const width = Math.floor(6000 * scale);
    const height = Math.floor(4000 * scale);
    expect(width * height).toBeLessThanOrEqual(16_000_000);
    // 비율(1.5)이 유지돼야 사진이 늘어나지 않는다.
    expect(width / height).toBeCloseTo(1.5, 2);
  });
});
