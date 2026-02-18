import { render } from "@testing-library/react";
import { FramePreview } from "@/components/frame/FramePreview";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

// 오버레이 렌더 유무 확인용 최소 테마 데이터
const theme: ThemeExportJson = {
  frameId: "classic-4",
  components: [
    {
      id: "st-1",
      type: "STICKER",
      source: "/stickers/sticker-001.png",
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      scale: 1,
      rotation: 0,
      zIndex: 1,
      styleJson: { opacity: 1 },
    },
  ],
};

describe("FramePreview", () => {
  // 현재 frameId와 테마의 frameId가 같으면 오버레이(SVG)가 보여야 합니다.
  it("renders overlay when theme frame matches current frame", () => {
    const { container } = render(
      <FramePreview
        frameId="classic-4"
        theme={theme}
        media={[null, null, null, null]}
      />,
    );

    expect(container.querySelector("svg")).toBeTruthy();
  });

  // frameId가 다르면 오버레이를 렌더하지 않아야 합니다.
  it("does not render overlay when theme frame does not match", () => {
    const { container } = render(
      <FramePreview
        frameId="wide-4"
        theme={theme}
        media={[null, null, null, null]}
      />,
    );

    expect(container.querySelector("svg")).toBeNull();
  });
});

