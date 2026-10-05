import { withRequestDeadline } from "./requestDeadline";

afterEach(() => jest.useRealTimers());
test("응답 없는 요청도 기한에 취소되어 호출부가 잠금 상태를 풀 수 있다", async () => {
  jest.useFakeTimers();
  const request = withRequestDeadline(60_000, (signal) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  const result = expect(request).rejects.toMatchObject({ name: "AbortError" });
  await jest.advanceTimersByTimeAsync(60_000);
  await result;
  expect(jest.getTimerCount()).toBe(0);
});
test("요청이 끝나면 예약한 취소도 정리한다", async () => {
  jest.useFakeTimers();
  expect(await withRequestDeadline(30_000, async () => "saved")).toBe("saved");
  expect(jest.getTimerCount()).toBe(0);
});
