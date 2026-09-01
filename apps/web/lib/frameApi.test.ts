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

function textComponent(
  id: string,
  source: string,
  zIndex: number,
): ThemeExportJson["components"][number] {
  return {
    id,
    type: "TEXT",
    source,
    x: 0,
    y: 0,
    width: 300,
    height: 120,
    scale: 1,
    rotation: 0,
    zIndex,
    styleJson: {},
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

  // 아래 셋은 전부 "저장은 되는데 그 프레임으로 찍으면 결과물이 하나도 안 나오던" 원인이다.
  // 서버는 컴포넌트 위치를 S3 key 로만 읽고(정적 경로·URL 은 400 GEN-002),
  // 글자는 구운 PNG(renderedKey) 없이는 그리지 못한다.
  it("칸별 누끼를 저장 요청에 싣는다 (4개일 때만)", () => {
    const json = makeJson("classic-4");
    const meta = { title: "t", description: "d", previewKey: "p" };

    expect(
      toCreateFrameRequest(
        { ...json, cellCutouts: [true, false, true, false] },
        meta,
      ).cellCutouts,
    ).toEqual([true, false, true, false]);

    // 개수가 어긋나면 서버가 거절하므로(minItems/maxItems 4) 아예 안 보낸다.
    expect(
      toCreateFrameRequest({ ...json, cellCutouts: [true] }, meta).cellCutouts,
    ).toBeUndefined();
    expect(toCreateFrameRequest(json, meta).cellCutouts).toBeUndefined();
  });

  it("글자의 renderedKey 를 싣고, 렌더 전용 주소는 보내지 않는다", () => {
    const json: ThemeExportJson = {
      frameId: "classic-4",
      components: [
        {
          id: "t-1",
          type: "TEXT",
          source: "안녕",
          renderedKey: "uploads/users/me/components/text-1.png",
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          scale: 1,
          rotation: 0,
          zIndex: 1,
        },
        {
          id: "s-1",
          type: "STICKER",
          source: "uploads/users/me/components/heart.png",
          renderUrl: "https://cdn.example.com/signed/heart.png?sig=abc",
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          scale: 1,
          rotation: 0,
          zIndex: 2,
        },
      ],
    };

    const req = toCreateFrameRequest(json, {
      title: "t",
      description: "d",
      previewKey: "p",
    });

    expect(req.components[0].renderedKey).toBe(
      "uploads/users/me/components/text-1.png",
    );
    expect(req.components[1].source).toBe(
      "uploads/users/me/components/heart.png",
    );
    // renderUrl 은 계약에 없는 값이라 실리면 안 된다.
    expect(req.components[1]).not.toHaveProperty("renderUrl");
  });

  // 서버는 components[].source 를 required + minLength 1(@NotBlank)로 받는다.
  // 편집 화면의 글자 입력에는 막는 것이 없어서, 글자를 지우면 source 가 "" 가 된다.
  // 그 레이어 하나 때문에 저장 전체가 400 GEN-003
  // (`components[0].source: must not be blank`)으로 죽던 자리다 — 로컬 백엔드로 실측.
  it("글자가 빈 TEXT 레이어는 저장 요청에서 뺀다", () => {
    const json: ThemeExportJson = {
      frameId: "classic-4",
      components: [
        textComponent("t-empty", "", 1),
        textComponent("t-space", "   ", 2),
        textComponent("t-ok", "안녕", 3),
      ],
    };

    const req = toCreateFrameRequest(json, {
      title: "t",
      description: "d",
      previewKey: "p",
    });

    expect(req.components.map((c) => c.id)).toEqual(["t-ok"]);
    expect(req.components[0].source).toBe("안녕");
  });

  it("서명 URL 로 저장돼 있던 옛 프레임도 key 로 되돌려 보낸다", () => {
    const json: ThemeExportJson = {
      frameId: "classic-4",
      components: [
        {
          id: "p-1",
          type: "PHOTO",
          source:
            "https://bucket.s3.ap-northeast-2.amazonaws.com/uploads/users/me/components/a.png?X-Amz-Signature=zz",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          scale: 1,
          rotation: 0,
          zIndex: 1,
        },
      ],
    };

    expect(
      toCreateFrameRequest(json, { title: "t", description: "d", previewKey: "p" })
        .components[0].source,
    ).toBe("uploads/users/me/components/a.png");
  });

  it("응답의 key 를 source 로, 서명 URL 은 렌더 전용으로 되돌린다", () => {
    const remoteFrame: RemoteFrame = {
      frameId: 1,
      title: "t",
      frameType: "CLASSIC",
      cellCutouts: [true, true, false, false],
      components: [
        {
          id: 9,
          type: "PHOTO",
          source: "https://cdn.example.com/signed/a.png?sig=1",
          key: "uploads/users/me/components/a.png",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          zIndex: 1,
        },
      ],
    };

    const theme = toThemeExportJson(remoteFrame);
    expect(theme.cellCutouts).toEqual([true, true, false, false]);
    // 스웨거: "수정 요청을 다시 만들 때 source 자리에 이 key 값을 넣는다."
    expect(theme.components[0].source).toBe(
      "uploads/users/me/components/a.png",
    );
    expect(theme.components[0].renderUrl).toBe(
      "https://cdn.example.com/signed/a.png?sig=1",
    );
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
      // 서버가 cellCutouts 를 안 줬으면 전부 꺼진 것으로 본다(스웨거의 생략 규칙).
      cellCutouts: [false, false, false, false],
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

  it("preserves non-color remote backgrounds when mapping through the editor json", () => {
    const remoteFrame: RemoteFrame = {
      frameId: 34,
      title: "image-bg",
      frameType: "WIDE",
      background: {
        type: "IMAGE",
        key: "backgrounds/cover.png",
      },
      components: [],
    };

    const mapped = toThemeExportJson(remoteFrame);

    // 스웨거 ImageBackgroundAttributes는 opacity가 required라 비어 있으면 1로 채운다.
    expect(mapped.background).toEqual({
      type: "IMAGE",
      key: "backgrounds/cover.png",
      opacity: 1,
    });

    expect(
      toCreateFrameRequest(mapped, {
        title: "t",
        description: "d",
        previewKey: "p",
      }).background,
    ).toEqual({
      type: "IMAGE",
      key: "backgrounds/cover.png",
      opacity: 1,
    });
  });

  it("keeps an explicit background opacity instead of overwriting it with the default", () => {
    const remoteFrame: RemoteFrame = {
      frameId: 35,
      title: "image-bg-translucent",
      frameType: "WIDE",
      background: {
        type: "IMAGE",
        key: "backgrounds/cover.png",
        opacity: 0.4,
      },
      components: [],
    };

    const mapped = toThemeExportJson(remoteFrame);

    expect(mapped.background).toEqual({
      type: "IMAGE",
      key: "backgrounds/cover.png",
      opacity: 0.4,
    });

    expect(
      toCreateFrameRequest(mapped, {
        title: "t",
        description: "d",
        previewKey: "p",
      }).background,
    ).toEqual({
      type: "IMAGE",
      key: "backgrounds/cover.png",
      opacity: 0.4,
    });
  });
});
