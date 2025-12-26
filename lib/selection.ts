export const DEFAULT_SELECT_COUNT = 4;

export type SelectionSlot = number | null;

export function createEmptySlots(
  count: number = DEFAULT_SELECT_COUNT
): SelectionSlot[] {
  return Array(count).fill(null);
}

export function toggleIndexInSlots(
  slots: SelectionSlot[],
  index: number
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
