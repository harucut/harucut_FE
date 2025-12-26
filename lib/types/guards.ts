export function isNotNull<T>(v: T | null): v is T {
  return v !== null;
}
