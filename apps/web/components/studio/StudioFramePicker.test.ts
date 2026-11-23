import { normalizeFrameRefs } from "@/components/studio/StudioFramePicker";

const ref = (frameVersionId: number, isDefault = false) => ({
  frameVersionId,
  layoutType: "CLASSIC" as const,
  isDefault,
  sortOrder: 0,
});

describe("제공 프레임 정리", () => {
  it("기본이 없으면 첫째를 기본으로 두고 순서를 고른 순서로 매긴다", () => {
    expect(normalizeFrameRefs([ref(1), ref(2)])).toEqual([
      { ...ref(1, true), sortOrder: 1 },
      { ...ref(2), sortOrder: 2 },
    ]);
  });

  // 게시 검사는 기본 프레임을 정확히 하나만 받는다.
  it("기본이 둘이면 앞의 것 하나만 남긴다", () => {
    expect(normalizeFrameRefs([ref(1, true), ref(2, true)]).map((r) => r.isDefault)).toEqual([true, false]);
  });

  it("비어 있으면 비어 있다", () => {
    expect(normalizeFrameRefs([])).toEqual([]);
  });
});
