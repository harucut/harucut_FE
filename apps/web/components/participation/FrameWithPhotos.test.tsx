import { render } from "@testing-library/react";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { FrameWithPhotos, frameFitStyle, frameIsTall, rotatedPhotos } from "@/components/participation/FrameWithPhotos";

const frame = { layoutType: "CLASSIC" as const, previewUrl: "https://bucket/frame.png" };

describe("FrameWithPhotos", () => {
  // 합성과 같은 순서여야 칸 위 글자·스티커가 사진에 가려지지 않는다.
  it("사진을 프레임 그림 아래에, 칸 자리에 깐다", () => {
    const { container } = render(<FrameWithPhotos frame={frame} photos={["/1", "/2", "/3", "/4"]} />);
    const images = [...container.querySelectorAll("img")];
    expect(images.map((image) => image.getAttribute("src"))).toEqual(["/1", "/2", "/3", "/4", frame.previewUrl]);

    const layout = FRAME_LAYOUTS["classic-4"];
    expect(images[1].style.top).toBe(`${(layout.slots[1].y / layout.totalHeight) * 100}%`);
    expect(images[1].style.height).toBe(`${(layout.slots[1].height / layout.totalHeight) * 100}%`);
  });

  it("서명 URL 인 프레임 그림은 Referer 를 보내지 않는다", () => {
    const { container } = render(<FrameWithPhotos frame={frame} photos={[]} />);
    expect(container.querySelector(`img[src="${frame.previewUrl}"]`)).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("사진이 없는 칸은 자리만 비워 둔다", () => {
    const { container } = render(<FrameWithPhotos frame={frame} photos={["/1", null]} />);
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(container.querySelectorAll("span")).toHaveLength(3);
  });
});

it("프레임 비율로 상자 안에 맞춘다", () => {
  expect(frameFitStyle("CLASSIC").width).toBe(`min(100cqw, calc(100cqh * ${2000 / 6000}))`);
  expect(frameIsTall("CLASSIC")).toBe(true);
  expect(frameIsTall("WIDE")).toBe(false);
});

it("나란히 놓인 프레임이 같은 사진으로 보이지 않게 민다", () => {
  expect(rotatedPhotos(["a", "b", "c", "d"], 2)).toEqual(["c", "d", "a", "b"]);
});
