import { useThemeEditorStore } from "@/lib/themeEditorStore";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

function makeJson(ids: string[]): ThemeExportJson {
  return {
    frameId: "classic-4",
    components: ids.map((id, index) => ({
      id,
      type: "TEXT",
      source: id,
      x: 10,
      y: 20,
      width: 300,
      height: 120,
      scale: 1,
      rotation: 0,
      zIndex: index + 1,
      styleJson: {},
    })),
  };
}

function ids() {
  return useThemeEditorStore.getState().components.map((c) => c.id);
}

describe("themeEditorStore 삭제 되돌리기", () => {
  beforeEach(() => {
    useThemeEditorStore.getState().reset();
    useThemeEditorStore.getState().importJson(makeJson(["a", "b", "c"]));
  });

  // 되돌리기가 "이전 상태로 되돌리기"가 아니면 이름값을 못한다. 예전에는 지운 것을 배열
  // 끝에 붙여서, 중간 레이어가 항상 맨 위로 올라오며 합성 결과가 달라졌다.
  it("중간 레이어를 지웠다 되돌리면 원래 쌓임 순서로 돌아온다", () => {
    useThemeEditorStore.getState().remove("b");
    expect(ids()).toEqual(["a", "c"]);

    useThemeEditorStore.getState().restoreRemoved();
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(
      useThemeEditorStore.getState().components.map((c) => c.zIndex),
    ).toEqual([1, 2, 3]);
  });

  // 삭제 기록이 프레임을 넘어 살아 있으면, 다른 프레임에서 되돌리기를 눌렀을 때
  // 이전 프레임의 요소가 지금 프레임에 끼어들어 그대로 저장된다.
  it("다른 프레임을 열면 삭제 기록을 버린다", () => {
    useThemeEditorStore.getState().remove("b");
    expect(useThemeEditorStore.getState().canRestoreRemoved).toBe(true);

    useThemeEditorStore.getState().importJson(makeJson(["x", "y"]));

    expect(useThemeEditorStore.getState().canRestoreRemoved).toBe(false);
    expect(useThemeEditorStore.getState().lastRemoved).toBeNull();

    // 혹시 눌리더라도 이전 프레임의 요소가 들어오지 않아야 한다.
    useThemeEditorStore.getState().restoreRemoved();
    expect(ids()).toEqual(["x", "y"]);
  });
});
