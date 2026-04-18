const mockLoadVideo = jest.fn();

jest.mock("@/lib/canvas/loaders", () => ({
  loadVideo: (...args: unknown[]) => mockLoadVideo(...args),
}));

import {
  MAX_FOURCUT_VIDEO_SECONDS,
  hasVideoSourceLongerThan,
} from "@/lib/fourcutVideo";

describe("fourcut video helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns false when there are no video sources", async () => {
    await expect(
      hasVideoSourceLongerThan([{ type: "image", src: "/photo.png" }]),
    ).resolves.toBe(false);
    expect(mockLoadVideo).not.toHaveBeenCalled();
  });

  it("detects input videos that exceed the max result length", async () => {
    mockLoadVideo
      .mockResolvedValueOnce({
        duration: MAX_FOURCUT_VIDEO_SECONDS + 1,
        pause: jest.fn(),
      })
      .mockResolvedValueOnce({
        duration: 3,
        pause: jest.fn(),
      });

    await expect(
      hasVideoSourceLongerThan([
        { type: "video", src: "/long.webm" },
        { type: "video", src: "/short.webm" },
      ]),
    ).resolves.toBe(true);
  });
});
