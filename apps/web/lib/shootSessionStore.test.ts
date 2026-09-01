/**
 * 프레임 **내용 지문**이 「합성 결과를 바꾸는 것」만 보는지 지킨다.
 *
 * 이 지문 하나로 두 가지가 갈린다(docs/backend-contract.md D-4):
 *  - 너무 둔하면 — 프레임을 고쳤는데 옛 멱등키가 나가 서버가 **수정 전 그림을 재생한다**
 *  - 너무 예민하면 — 그림이 그대로인데 새 키가 나가 같은 네컷이 **보관함에 두 벌** 남는다
 *
 * 그래서 「달라졌다/같다」 양쪽을 다 지킨다.
 */
import { buildFrameContentKey } from "@/lib/shootSessionStore";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

function component(
  overrides: Partial<ThemeExportJson["components"][number]> = {},
): ThemeExportJson["components"][number] {
  return {
    type: "IMAGE",
    source: "uploads/sticker.png",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    scale: 1,
    rotation: 0,
    zIndex: 1,
    ...overrides,
  } as ThemeExportJson["components"][number];
}

function theme(components: ThemeExportJson["components"]): ThemeExportJson {
  return {
    frameId: "classic-4",
    background: { type: "COLOR", value: "111827" },
    cellCutouts: [false, false, false, false],
    components,
  } as ThemeExportJson;
}

describe("buildFrameContentKey", () => {
  it("프레임을 아직 못 읽었으면 null 이다", () => {
    expect(buildFrameContentKey(null)).toBeNull();
    expect(buildFrameContentKey(undefined)).toBeNull();
  });

  /*
    글자를 지운 TEXT 는 `toCreateFrameRequest` 가 요청에서 뺀다(`source` 가 @NotBlank).
    서버가 그리는 그림에 없는 레이어이므로 지문에도 없어야 한다.
  */
  it("저장 요청에서 빠지는 빈 TEXT 는 지문에 넣지 않는다", () => {
    const withBlank = theme([
      component({ zIndex: 1 }),
      component({ type: "TEXT", source: "   ", zIndex: 2 }),
    ]);
    const without = theme([component({ zIndex: 1 })]);

    expect(buildFrameContentKey(withBlank)).toBe(buildFrameContentKey(without));
  });

  /*
    편집기의 `normalizeZ` 는 빈 레이어까지 세어 1,2,3… 을 다시 매긴다. 그래서 빈 TEXT 를
    스티커 사이에서 옮기기만 해도 살아남은 레이어의 번호가 밀린다. 그림에 나타나는 것은
    **상대 순서**뿐이므로 지문은 같아야 한다.
  */
  it("빈 TEXT 를 사이에서 옮겨 번호만 밀려도 지문은 같다", () => {
    // 빈 레이어가 맨 앞 → 살아남은 둘의 zIndex 는 2,3
    const blankFirst = theme([
      component({ type: "TEXT", source: "", zIndex: 1 }),
      component({ source: "uploads/a.png", zIndex: 2 }),
      component({ source: "uploads/b.png", zIndex: 3 }),
    ]);
    // 빈 레이어가 맨 뒤 → 살아남은 둘의 zIndex 는 1,2
    const blankLast = theme([
      component({ source: "uploads/a.png", zIndex: 1 }),
      component({ source: "uploads/b.png", zIndex: 2 }),
      component({ type: "TEXT", source: "", zIndex: 3 }),
    ]);

    expect(buildFrameContentKey(blankFirst)).toBe(buildFrameContentKey(blankLast));
  });

  /*
    레이어 순서를 쥔 것은 `zIndex` 다 — 그리는 쪽이 둘 다 `zIndex` 로 정렬한다
    (`canvas/renderThemePreview.ts`, `theme/editor/canvas/CanvasStage.tsx`).
    그래서 서버가 같은 컴포넌트를 다른 배열 순서로 돌려줘도 그림은 같다.
  */
  it("배열 순서만 다르고 zIndex 가 같으면 지문도 같다", () => {
    const ascending = theme([
      component({ source: "uploads/a.png", zIndex: 1 }),
      component({ source: "uploads/b.png", zIndex: 2 }),
    ]);
    const reversed = theme([
      component({ source: "uploads/b.png", zIndex: 2 }),
      component({ source: "uploads/a.png", zIndex: 1 }),
    ]);

    expect(buildFrameContentKey(ascending)).toBe(buildFrameContentKey(reversed));
  });

  /* 반대쪽: 보이는 레이어의 겹치는 차례가 바뀌면 그림이 달라진다. */
  it("보이는 레이어의 순서가 바뀌면 지문도 달라진다", () => {
    const aOnTop = theme([
      component({ source: "uploads/a.png", zIndex: 2 }),
      component({ source: "uploads/b.png", zIndex: 1 }),
    ]);
    const bOnTop = theme([
      component({ source: "uploads/a.png", zIndex: 1 }),
      component({ source: "uploads/b.png", zIndex: 2 }),
    ]);

    expect(buildFrameContentKey(aOnTop)).not.toBe(buildFrameContentKey(bOnTop));
  });

  /*
    렌더 전용 주소는 조회할 때마다 다시 서명된다. 지문에 넣으면 내용이 그대로인데도
    매번 새 키가 나가 같은 네컷이 두 벌 남는다.
  */
  it("다시 서명된 렌더 주소로는 지문이 달라지지 않는다", () => {
    const first = theme([component({ renderUrl: "https://s3/a?sig=1" })]);
    const second = theme([component({ renderUrl: "https://s3/a?sig=2" })]);

    expect(buildFrameContentKey(first)).toBe(buildFrameContentKey(second));
  });

  it("배경색이 바뀌면 지문도 달라진다", () => {
    const dark = theme([]);
    const green = {
      ...theme([]),
      background: { type: "COLOR" as const, value: "1ED760" },
    };

    expect(buildFrameContentKey(dark)).not.toBe(buildFrameContentKey(green));
  });
});
