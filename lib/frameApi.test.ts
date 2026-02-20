import { toCreateFrameRequest } from "@/lib/frameApi";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

// 테스트용 최소 Theme JSON 생성 헬퍼
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

describe("toCreateFrameRequest", () => {
  // frame layout에서 캔버스 크기를 가져오고 meta 값이 그대로 전달되어야 합니다.
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

  // wide-* 프레임은 서버 enum 기준 WIDE로 변환되어야 합니다.
  it("infers wide frame type from frame id", () => {
    const req = toCreateFrameRequest(makeJson("wide-4"), {
      title: "t",
      description: "d",
      previewKey: "p",
    });

    expect(req.frameType).toBe("WIDE");
  });

  // wide가 아닌 프레임은 현재 규칙상 CLASSIC으로 매핑됩니다.
  it("keeps non-wide frame as CLASSIC", () => {
    const req = toCreateFrameRequest(makeJson("grid-4"), {
      title: "t",
      description: "d",
      previewKey: "p",
    });

    expect(req.frameType).toBe("CLASSIC");
  });

  // scale/rotation/styleJson이 비어 있어도 안전한 기본값으로 보정되어야 합니다.
  it("fills missing component defaults", () => {
    const json = {
      frameId: "classic-4",
      components: [
        {
          id: "c-2",
          type: "STICKER",
          source: "/x.png",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          // 의도적으로 undefined를 넣어 기본값(1, 0) 보정 동작 확인
          scale: undefined,
          rotation: undefined,
          zIndex: 1,
          styleJson: undefined,
        },
      ],
    } as unknown as ThemeExportJson;

    const req = toCreateFrameRequest(json, {
      title: "t",
      description: "d",
      previewKey: "p",
    });

    expect(req.components[0].scale).toBe(1);
    expect(req.components[0].rotation).toBe(0);
    expect(req.components[0].styleJson).toEqual({});
  });
});

