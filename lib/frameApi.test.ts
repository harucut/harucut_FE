import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import type { RemoteFrame } from "@/lib/api-types";
import {
  frameIdFromFrameType,
  frameTypeFromFrameId,
  toCreateFrameRequest,
  toThemeExportJson,
} from "@/lib/frameApi";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

function makeJson(frameId: ThemeExportJson["frameId"]): ThemeExportJson {
  return {
    frameId,
    components: [
      {
        id: "c-1",
        type: "TEXT",
        source: "Hello",
        x: 10,
        y: 20,
        width: 300,
        height: 120,
        scale: 1,
        rotation: 0,
        zIndex: 1,
        styleJson: { color: "#fff" },
      },
    ],
  };
}

describe("frame api mapping", () => {
  it("maps canvas size and metadata from frame layout", () => {
    const json = makeJson("classic-4");
    const req = toCreateFrameRequest(json, {
      title: "t",
      description: "d",
      previewKey: "p",
    });

    expect(req.title).toBe("t");
    expect(req.description).toBe("d");
    expect(req.previewKey).toBe("p");
    expect(req.canvasWidth).toBe(FRAME_LAYOUTS["classic-4"].totalWidth);
    expect(req.canvasHeight).toBe(FRAME_LAYOUTS["classic-4"].totalHeight);
    expect(req.background).toEqual({ type: "COLOR", value: "000000" });
  });

  it("maps each frame id to the swagger frame type", () => {
    expect(frameTypeFromFrameId("classic-4")).toBe("CLASSIC");
    expect(frameTypeFromFrameId("wide-4")).toBe("WIDE");
    expect(frameTypeFromFrameId("grid-4")).toBe("GRID");
    expect(frameTypeFromFrameId("polaroid-4")).toBe("POLAROID");
  });

  it("maps swagger frame types back to local frame ids", () => {
    expect(frameIdFromFrameType("CLASSIC")).toBe("classic-4");
    expect(frameIdFromFrameType("WIDE")).toBe("wide-4");
    expect(frameIdFromFrameType("GRID")).toBe("grid-4");
    expect(frameIdFromFrameType("POLAROID")).toBe("polaroid-4");
  });

  it("converts a remote frame response into theme editor json", () => {
    const remoteFrame: RemoteFrame = {
      frameId: 12,
      title: "saved",
      description: "saved desc",
      frameType: "GRID",
      background: { type: "COLOR", value: "ffffff" },
      components: [
        {
          id: 3,
          type: "TEXT",
          source: "hello",
          x: 1,
          y: 2,
          width: 3,
          height: 4,
          zIndex: 1,
          style: { color: "#fff" },
        },
      ],
    };

    expect(toThemeExportJson(remoteFrame)).toEqual({
      frameId: "grid-4",
      background: { type: "COLOR", value: "ffffff" },
      components: [
        {
          id: "3",
          type: "TEXT",
          source: "hello",
          x: 1,
          y: 2,
          width: 3,
          height: 4,
          scale: 1,
          rotation: 0,
          zIndex: 1,
          styleJson: { color: "#fff" },
        },
      ],
    });
  });
});
