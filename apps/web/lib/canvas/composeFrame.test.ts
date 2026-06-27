import { composeFramePng } from "@/lib/canvas/composeFrame";

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
        sources: [{ type: "image", src: "/a.png" }],
      }),
    ).rejects.toThrow("sources length must match slot count");
  });
});

