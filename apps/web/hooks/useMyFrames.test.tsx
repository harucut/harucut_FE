import { act, renderHook, waitFor } from "@testing-library/react";
import { useMyFrames } from "./useMyFrames";
const mockList = jest.fn();
jest.mock("@/lib/remoteFrameApi", () => ({ listMyFrames: () => mockList() }));
beforeEach(() => { mockList.mockReset(); });
test("비회원이면 인증 전용 목록 API를 호출하지 않는다", async () => {
  const { result } = renderHook(() => useMyFrames(false));
  await act(async () => { await result.current.refresh(); });
  expect(mockList).not.toHaveBeenCalled();
  expect(result.current.isLoading).toBe(false);
});
test("조회 중 게스트로 바뀌면 이전 회원의 응답을 버린다", async () => {
  let resolve!: (value: unknown) => void;
  mockList.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const { result, rerender } = renderHook(({ enabled }) => useMyFrames(enabled), { initialProps: { enabled: true } });
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
  rerender({ enabled: false });
  await act(async () => { resolve([{ frameId: 1 }]); });
  expect(result.current.frames).toEqual([]);
});
