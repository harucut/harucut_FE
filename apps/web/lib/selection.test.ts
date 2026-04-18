import {
  createEmptySlots,
  DEFAULT_SELECT_COUNT,
  toggleIndexInSlots,
} from "@/lib/selection";

describe("selection helpers", () => {
  // 기본 슬롯 개수가 유지되고, 초기값은 모두 null이어야 합니다.
  it("creates empty slots with default size", () => {
    const slots = createEmptySlots();
    expect(slots).toHaveLength(DEFAULT_SELECT_COUNT);
    expect(slots.every((v) => v === null)).toBe(true);
  });

  // 선택은 "빈칸에 추가 -> 다시 누르면 해제" 규칙으로 동작해야 합니다.
  it("adds and removes selected index in order", () => {
    const first = toggleIndexInSlots([null, null, null, null], 2);
    expect(first).toEqual([2, null, null, null]);

    const second = toggleIndexInSlots(first, 1);
    expect(second).toEqual([2, 1, null, null]);

    const third = toggleIndexInSlots(second, 2);
    expect(third).toEqual([null, 1, null, null]);
  });

  // 슬롯이 꽉 찬 경우에는 새 index를 추가하지 않아야 합니다.
  it("does not add when no empty slot exists", () => {
    const full = [0, 1, 2, 3];
    const result = toggleIndexInSlots(full, 4);
    expect(result).toEqual(full);
  });

  // 커스텀 개수로 슬롯을 만들 때도 모두 null 초기화여야 합니다.
  it("creates empty slots with custom count", () => {
    const slots = createEmptySlots(2);
    expect(slots).toEqual([null, null]);
  });
});
