/** 선택 슬롯 기본 개수 */
export const DEFAULT_SELECT_COUNT = 4;

export type SelectionSlot = number | null;

/** 빈 선택 슬롯 배열 생성 */
export function createEmptySlots(
  count: number = DEFAULT_SELECT_COUNT,
): SelectionSlot[] {
  return Array(count).fill(null);
}

/**
 * 선택 토글: 이미 선택된 index면 해제, 빈 슬롯이 있으면 추가
 */
export function toggleIndexInSlots(
  slots: SelectionSlot[],
  index: number,
): SelectionSlot[] {
  const next = [...slots];

  const existsAt = next.indexOf(index);
  if (existsAt !== -1) {
    next[existsAt] = null;
    return next;
  }

  const emptyAt = next.indexOf(null);
  if (emptyAt === -1) return slots;

  next[emptyAt] = index;
  return next;
}
