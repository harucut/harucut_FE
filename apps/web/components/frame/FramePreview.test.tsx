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


// 자유 사진 칸(P5) — 칸마다 회전·모양을 그리고, 사진은 그 칸의 shotIndex 번째를 넣는다.
it("자유 칸이면 칸의 회전·모양과 사진 순서를 따른다", () => {
  const cells = [0, 1, 2, 3].map((i) => ({
    x: 150,
    y: 200 + i * 1280,
    width: 1700,
    height: 1200,
    rotation: i === 0 ? 10 : 0,
    shape: i === 1 ? ({ type: "ELLIPSE" } as const) : ({ type: "RECT", cornerRadius: 0 } as const),
    shotIndex: [3, 2, 1, 0][i],
  }));
  const { container } = render(
    <FramePreview
      frameId="classic-4"
      theme={{ ...theme, cells }}
      images={["/a.png", "/b.png", "/c.png", "/d.png"]}
    />,
  );
  const imgs = Array.from(container.querySelectorAll("img"));
  expect(imgs.map((img) => img.getAttribute("src"))).toEqual(["/d.png", "/c.png", "/b.png", "/a.png"]);
  expect(imgs[0].style.transform).toBe("rotate(10deg)");
  expect(imgs[1].style.borderRadius).toBe("50%");
});
