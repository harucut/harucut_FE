/** 사용자 조작을 잠그는 요청은 회선이 응답 없이 끊겨도 끝나야 한다. */
export async function withRequestDeadline<T>(milliseconds: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try { return await operation(controller.signal); }
  finally { clearTimeout(timer); }
}
