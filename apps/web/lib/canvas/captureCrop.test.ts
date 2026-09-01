import {
  centerCrop,
  cropPhotoToPreviewThenSlot,
  stillBeatsVideo,
} from "@/lib/canvas/captureCrop";

describe("centerCrop", () => {
  it("같은 비율이면 그대로 둔다", () => {
    expect(centerCrop(1600, 900, 16 / 9)).toEqual({ sx: 0, sy: 0, sw: 1600, sh: 900 });
  });

  it("원본이 더 넓으면 좌우를 자른다", () => {
    const r = centerCrop(1920, 1080, 1); // 정사각형으로
    expect(r).toEqual({ sx: 420, sy: 0, sw: 1080, sh: 1080 });
  });

  it("원본이 더 좁으면 위아래를 자른다", () => {
    const r = centerCrop(1080, 1920, 1);
    expect(r).toEqual({ sx: 0, sy: 420, sw: 1080, sh: 1080 });
  });
});

describe("cropPhotoToPreviewThenSlot", () => {
  /*
    실제 기기에서 가장 흔한 조합 — 사진은 4:3 센서 전체, 프리뷰는 16:9.
    사진을 곧장 슬롯 비율로 자르면 프리뷰에 없던 위아래가 들어온다. 그걸 막는 것이 목적이다.
  */
  it("사진을 먼저 프리뷰 화각으로 맞춘다 (4:3 사진 · 16:9 프리뷰)", () => {
    const r = cropPhotoToPreviewThenSlot({
      photoWidth: 4032,
      photoHeight: 3024, // 4:3
      previewAspect: 16 / 9,
      slotAspect: 16 / 9, // 슬롯도 16:9 → 화각 보정만 일어난다
    });
    // 4032 폭은 그대로, 세로는 16:9 만큼만 남는다.
    expect(r.sw).toBeCloseTo(4032, 0);
    expect(r.sh).toBeCloseTo(4032 / (16 / 9), 0);
    expect(r.sx).toBe(0);
    expect(r.sy).toBeCloseTo((3024 - 4032 / (16 / 9)) / 2, 0);
  });

  it("화각을 맞춘 뒤 슬롯 비율로 다시 자른다", () => {
    const r = cropPhotoToPreviewThenSlot({
      photoWidth: 4032,
      photoHeight: 3024,
      previewAspect: 16 / 9,
      slotAspect: 1700 / 1200, // classic 슬롯
    });
    const fovH = 4032 / (16 / 9); // 2268
    // 슬롯이 프리뷰보다 좁으므로(1.417 < 1.778) 좌우가 더 잘린다.
    expect(r.sh).toBeCloseTo(fovH, 0);
    expect(r.sw).toBeCloseTo(fovH * (1700 / 1200), 0);
    // 잘린 영역은 프리뷰 화각 안에 있어야 한다.
    expect(r.sy).toBeGreaterThanOrEqual((3024 - fovH) / 2 - 1);
    expect(r.sy + r.sh).toBeLessThanOrEqual((3024 + fovH) / 2 + 1);
  });

  it("사진과 프리뷰 비율이 같으면 한 번만 자른 것과 같다", () => {
    const two = cropPhotoToPreviewThenSlot({
      photoWidth: 3840,
      photoHeight: 2160,
      previewAspect: 16 / 9,
      slotAspect: 1700 / 2400,
    });
    const one = centerCrop(3840, 2160, 1700 / 2400);
    expect(two).toEqual(one);
  });
});

describe("stillBeatsVideo", () => {
  it("12MP 스틸은 4K 영상보다 낫다", () => {
    expect(
      stillBeatsVideo({
        photoWidth: 4032, photoHeight: 3024,
        videoWidth: 3840, videoHeight: 2160,
        slotAspect: 1700 / 1200,
      }),
    ).toBe(true);
  });

  it("스틸이 영상과 같은 크기면 굳이 쓰지 않는다", () => {
    expect(
      stillBeatsVideo({
        photoWidth: 1920, photoHeight: 1080,
        videoWidth: 1920, videoHeight: 1080,
        slotAspect: 1700 / 1200,
      }),
    ).toBe(false);
  });

  it("스틸이 더 작은 기기에서는 영상 프레임을 쓴다", () => {
    expect(
      stillBeatsVideo({
        photoWidth: 1280, photoHeight: 960,
        videoWidth: 3840, videoHeight: 2160,
        slotAspect: 1700 / 1200,
      }),
    ).toBe(false);
  });
});
