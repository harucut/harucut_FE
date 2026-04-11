import { useThemeDraftStore } from "@/lib/themeDraftStore";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

// 테스트용 최소 Theme JSON 생성 헬퍼
function makeTheme(frameId: ThemeExportJson["frameId"]): ThemeExportJson {
  return {
    frameId,
    components: [],
  };
}

describe("themeDraftStore", () => {
  beforeEach(() => {
    // persist 저장소 흔적과 zustand 상태를 테스트마다 초기화합니다.
    localStorage.removeItem("theme-drafts");
    useThemeDraftStore.setState({ drafts: [] });
  });

  // 새 draft는 최근 저장이 앞에 오도록 배열 맨 앞에 추가됩니다.
  it("adds a draft to the front of the list", () => {
    const firstId = useThemeDraftStore.getState().addDraft(makeTheme("classic-4"));
    const secondId = useThemeDraftStore.getState().addDraft(makeTheme("wide-4"));

    const drafts = useThemeDraftStore.getState().drafts;
    expect(drafts).toHaveLength(2);
    expect(drafts[0].id).toBe(secondId);
    expect(drafts[1].id).toBe(firstId);
  });

  // 선택한 기존 draft를 다시 저장할 때 "추가"가 아니라 "덮어쓰기"여야 합니다.
  it("updates existing draft instead of adding a new one", () => {
    const id = useThemeDraftStore.getState().addDraft(makeTheme("classic-4"));
    const before = useThemeDraftStore.getState().drafts[0].savedAt;

    const result = useThemeDraftStore
      .getState()
      .updateDraft(id, makeTheme("wide-4"));

    const drafts = useThemeDraftStore.getState().drafts;
    expect(result).toBe(id);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe(id);
    expect(drafts[0].frameId).toBe("wide-4");
    expect(drafts[0].name).toBe(id);
    expect(drafts[0].savedAt).toBeGreaterThanOrEqual(before);
  });

  it("preserves the current name when updating without a new name", () => {
    const id = useThemeDraftStore
      .getState()
      .addDraft(makeTheme("classic-4"), { name: "봄 프레임" });

    useThemeDraftStore.getState().updateDraft(id, makeTheme("grid-4"));

    expect(useThemeDraftStore.getState().drafts[0].name).toBe("봄 프레임");
  });

  // 없는 id를 업데이트하면 null을 반환하고 상태를 바꾸지 않아야 합니다.
  it("returns null when updating missing draft id", () => {
    const result = useThemeDraftStore
      .getState()
      .updateDraft("missing-id", makeTheme("classic-4"));

    expect(result).toBeNull();
    expect(useThemeDraftStore.getState().drafts).toHaveLength(0);
  });

  // id로 조회(getDraft)가 정상 동작하는지 확인합니다.
  it("returns draft by id", () => {
    const id = useThemeDraftStore.getState().addDraft(makeTheme("classic-4"));
    const found = useThemeDraftStore.getState().getDraft(id);

    expect(found?.id).toBe(id);
    expect(found?.frameId).toBe("classic-4");
  });

  // 삭제(removeDraft)가 해당 id만 제거하는지 확인합니다.
  it("removes a draft by id", () => {
    const id = useThemeDraftStore.getState().addDraft(makeTheme("classic-4"));
    useThemeDraftStore.getState().addDraft(makeTheme("wide-4"));

    useThemeDraftStore.getState().removeDraft(id);
    const drafts = useThemeDraftStore.getState().drafts;

    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).not.toBe(id);
  });

  // 저장본은 최대 50개까지만 유지해야 합니다.
  it("keeps up to 50 drafts", () => {
    for (let i = 0; i < 55; i++) {
      useThemeDraftStore.getState().addDraft(makeTheme("classic-4"));
    }

    expect(useThemeDraftStore.getState().drafts).toHaveLength(50);
  });
});

