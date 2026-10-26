import { hasLocalImages, parseServerDocument, toServerDocument } from "@/lib/serverEditorDocument";
import type { EditorComponent } from "@/lib/types/themeEditor";

function layer(extra: Partial<EditorComponent>): EditorComponent {
  return {
    id: "c",
    type: "PHOTO",
    source: "uploads/users/me/assets/As1.png",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    scale: 1,
    rotation: 0,
    zIndex: 1,
    ...extra,
  } as EditorComponent;
}

const base = {
  frameId: "classic-4" as const,
  backgroundColor: "111827",
  background: { type: "COLOR" as const, value: "111827" },
  cellCutouts: [false, false, false, false],
};

describe("toServerDocument", () => {
  // 서버 초안은 256KB 상한이고 다른 기기에서 열린다 — 이 기기의 blob·dataURL 은 넣지 않는다.
  it("아직 안 올린 사진이나 배경이 있으면 만들지 않는다", () => {
    expect(toServerDocument({ ...base, components: [layer({ source: "blob:x" })] })).toBeNull();
    expect(
      toServerDocument({
        ...base,
        components: [],
        background: { type: "IMAGE", url: "blob:bg" },
        pendingBackgroundFile: new File(["x"], "bg.png"),
      }),
    ).toBeNull();
  });

  it("정적 스티커와 글자는 그대로 넣는다", () => {
    expect(
      hasLocalImages({
        ...base,
        components: [layer({ type: "STICKER", source: "/stickers/sticker-001.png" }), layer({ type: "TEXT", source: "안녕" })],
      }),
    ).toBe(false);
  });

  it("그릴 주소는 빼고, 문서가 쓰는 자산 id 를 모두 모은다", () => {
    const built = toServerDocument({
      ...base,
      background: { type: "IMAGE", key: "uploads/bg.png", assetId: "AsBg", url: "https://s3/bg" },
      components: [
        layer({ assetId: "As1", renderUrl: "blob:local" }),
        layer({ id: "t", type: "TEXT", source: "안녕", renderedAssetId: "AsT" }),
      ],
    })!;

    expect(built.document.components[0]).not.toHaveProperty("renderUrl");
    expect(built.document.background).toEqual({ type: "IMAGE", key: "uploads/bg.png", assetId: "AsBg" });
    // 빠뜨리면 정리 배치가 「아무도 안 쓴다」고 보고 지울 수 있다.
    expect(built.assetIds.sort()).toEqual(["As1", "AsBg", "AsT"]);
  });
});

describe("parseServerDocument", () => {
  const doc = { schemaVersion: 1, ...base, components: [] };

  it("이 판형의 문서만 읽는다", () => {
    expect(parseServerDocument(doc, "classic-4")).toMatchObject({ frameId: "classic-4" });
    expect(parseServerDocument(doc, "grid-4")).toBeNull();
  });

  // 반쯤 읽어 복원하면 잃는 레이어가 생겨도 사용자가 알 수 없다.
  it("모르는 schemaVersion 이나 모양은 버린다", () => {
    expect(parseServerDocument({ ...doc, schemaVersion: 2 }, "classic-4")).toBeNull();
    expect(parseServerDocument({ ...doc, components: "x" }, "classic-4")).toBeNull();
    expect(parseServerDocument("x", "classic-4")).toBeNull();
  });
});

// Codex 리뷰(#528): 올린 뒤에도 고른 파일이 남아 있어, 그 배경을 쓰는 동안 서버 초안이 한 번도 저장되지 않았다.
it("배경 파일이 남아 있어도 이미 올려 key 가 있으면 문서를 만든다", () => {
  const built = toServerDocument({
    frameId: "classic-4",
    backgroundColor: "111827",
    background: { type: "IMAGE", key: "uploads/bg.png", assetId: "AsBg", url: "blob:bg" },
    cellCutouts: [false, false, false, false],
    components: [],
    pendingBackgroundFile: new File(["x"], "bg.png"),
  });
  expect(built?.assetIds).toEqual(["AsBg"]);
});
