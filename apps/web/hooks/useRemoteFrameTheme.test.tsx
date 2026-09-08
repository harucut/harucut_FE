/**
 * 이 훅의 null 은 뜻이 두 가지다 — "꾸민 프레임을 안 쓴다"와 "쓰는데 못 읽었다".
 * 둘을 뭉개면 화면이 배경색 고르기를 열어 주고, 서버 합성은 프레임에 저장된 배경을 쓰면서
 * 그 색을 버린다(lib/fourcutCompose.ts 의 usesStoredBackground). 사용자에게는 "골랐는데
 * 안 먹었다"로만 보이는 실패다. 그래서 error 가 언제 서고 언제 안 서는지를 여기서 못박는다.
 *
 * 재시도도 같이 본다. 조회는 effect 안에서 도므로, reload 가 effect 의존성을 흔들지 않으면
 * 버튼만 있고 아무 일도 일어나지 않는다.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRemoteFrameThemeState } from "@/hooks/useRemoteFrameTheme";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

const mockGetFrame = jest.fn();

jest.mock("@/lib/remoteFrameApi", () => ({
  getFrame: (frameId: number) => mockGetFrame(frameId),
}));

// 응답을 그대로 통과시킨다 — 여기서 보려는 것은 변환이 아니라 성공·실패 판정이다.
jest.mock("@/lib/frameApi", () => ({
  toThemeExportJson: (frame: unknown) => frame,
}));

jest.mock("@/lib/frameAssets", () => ({
  resolveThemeAssetUrls: async (theme: unknown) => theme,
}));

jest.mock("@/lib/presignedUploadApi", () => ({
  getImageUrlByKey: async () => null,
}));

const theme: ThemeExportJson = {
  frameId: "grid-4",
  background: { type: "COLOR", value: "#112233" },
  components: [],
};

let consoleError: jest.SpyInstance;

beforeEach(() => {
  mockGetFrame.mockReset();
  // 훅이 실패를 console 에도 남긴다. 테스트 출력이 실패처럼 보이지 않게 삼킨다.
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

test("조회에 실패하면 내용은 비고 error 가 선다", async () => {
  mockGetFrame.mockRejectedValue(new Error("boom"));

  const { result } = renderHook(() => useRemoteFrameThemeState(7, "grid-4"));

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.data).toBeNull();
  expect(result.current.error).toBeTruthy();
});

test("프레임 종류가 화면과 다르면 실패가 아니다", async () => {
  mockGetFrame.mockResolvedValue({ ...theme, frameId: "polaroid-4" });

  const { result } = renderHook(() => useRemoteFrameThemeState(7, "grid-4"));

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.data).toBeNull();
  expect(result.current.error).toBeNull();
});

test("꾸민 프레임을 안 쓰면 조회하지 않고, 기다리는 상태로 두지도 않는다", async () => {
  const { result } = renderHook(() => useRemoteFrameThemeState(null, "grid-4"));

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(mockGetFrame).not.toHaveBeenCalled();
  expect(result.current.data).toBeNull();
  expect(result.current.error).toBeNull();
});

test("reload 는 실제로 다시 조회하고, 성공하면 앞선 실패를 지운다", async () => {
  mockGetFrame.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(theme);

  const { result } = renderHook(() => useRemoteFrameThemeState(7, "grid-4"));

  await waitFor(() => expect(result.current.error).toBeTruthy());

  act(() => {
    result.current.reload();
  });

  await waitFor(() => expect(result.current.data).toEqual(theme));
  expect(result.current.error).toBeNull();
  expect(mockGetFrame).toHaveBeenCalledTimes(2);
});
