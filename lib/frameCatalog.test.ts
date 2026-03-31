import {
  FRAME_CATALOG,
  getFrameCatalogItem,
  parseFrameIdQuery,
} from "@/lib/frameCatalog";

describe("frameCatalog", () => {
  test("keeps metadata for every frame layout", () => {
    expect(FRAME_CATALOG).toHaveLength(4);
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
