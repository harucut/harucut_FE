import { FRAME_CONFIGS } from "@/constants/frames";
import {
  FRAME_CATALOG,
  getFrameCatalogItem,
  parseFrameIdQuery,
} from "@/lib/frameCatalog";

describe("frameCatalog", () => {
  test("covers every frame layout exactly once", () => {
    expect(FRAME_CATALOG).toHaveLength(FRAME_CONFIGS.length);
    expect(FRAME_CATALOG.map((frame) => frame.id)).toEqual(
      FRAME_CONFIGS.map((frame) => frame.id),
    );
  });

  test("keeps the copy that FramePicker renders on every card", () => {
    for (const frame of FRAME_CATALOG) {
      expect(frame.shortLabel.length).toBeGreaterThan(0);
      expect(frame.badge.length).toBeGreaterThan(0);
      expect(frame.description.length).toBeGreaterThan(0);
      expect(frame.recommendedFor.length).toBeGreaterThan(0);
    }
  });

  test("parses only supported frame ids from query values", () => {
    expect(parseFrameIdQuery("classic-4")).toBe("classic-4");
    expect(parseFrameIdQuery("grid-4")).toBe("grid-4");
    expect(parseFrameIdQuery("unknown")).toBeNull();
    expect(parseFrameIdQuery(null)).toBeNull();
  });

  test("returns a stable fallback item when frame id lookup misses", () => {
    expect(getFrameCatalogItem("wide-4").id).toBe("wide-4");
  });
});
