/**
 * 공유할 사진을 미리 받아 둔다(2026-11-15 「카톡으로 바로 보내거나 인스타로 바로」). 누른 뒤에 받으면 그사이 제스처가 풀려
 * 브라우저가 공유 창을 거절한다 — 그래서 사진이 화면에 뜰 때 받는다. 파일 공유가 되는 브라우저에서만, 앱 밖에서만 받는다.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { usePreparedPhotoFile } from "@/hooks/usePreparedPhotoFile";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const fetchMock = jest.fn();
/** jsdom 에는 Response 가 없다. 훅이 쓰는 만큼만 흉내 낸다. */
const photoResponse = () => ({ ok: true, blob: async () => new Blob([JPEG], { type: "image/jpeg" }) });

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => photoResponse());
  global.fetch = fetchMock as unknown as typeof fetch;
  Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "canShare");
  delete window.__HARUCUT_NATIVE__;
  delete window.ReactNativeWebView;
});

it("파일 공유가 되는 브라우저는 사진을 받아 이름 붙인 파일로 들고 있는다", async () => {
  const { result } = renderHook(() => usePreparedPhotoFile("https://cdn.example/1.jpg", "우리 넷.jpg"));

  await waitFor(() => expect(result.current).not.toBeNull());
  expect(result.current?.name).toBe("우리 넷.jpg");
  expect(result.current?.type).toBe("image/jpeg");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  // 쿠키도 이 화면 주소(Referer)도 저장소로 보내지 않는다 — 서명 주소 자체가 권한이다.
  expect(fetchMock).toHaveBeenCalledWith(
    "https://cdn.example/1.jpg",
    expect.objectContaining({ credentials: "omit", referrerPolicy: "no-referrer" }),
  );
});

it("파일 공유가 안 되는 브라우저(PC)는 받지 않는다", async () => {
  Reflect.deleteProperty(navigator, "canShare");
  const { result } = renderHook(() => usePreparedPhotoFile("https://cdn.example/1.jpg", "a.jpg"));

  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(result.current).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("앱 안에서는 받지 않는다 — 네이티브가 주소로 받는다", async () => {
  window.__HARUCUT_NATIVE__ = { version: 5, platform: "ios" };
  window.ReactNativeWebView = { postMessage: jest.fn() };
  const { result } = renderHook(() => usePreparedPhotoFile("https://cdn.example/1.jpg", "a.jpg"));

  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(result.current).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("옆 사진으로 넘기면 앞 사진 파일을 내주지 않는다", async () => {
  const { result, rerender } = renderHook(({ url }) => usePreparedPhotoFile(url, "a.jpg"), {
    initialProps: { url: "https://cdn.example/1.jpg" },
  });
  await waitFor(() => expect(result.current).not.toBeNull());

  let release: () => void = () => undefined;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(photoResponse());
      }),
  );
  rerender({ url: "https://cdn.example/2.jpg" });
  expect(result.current).toBeNull();

  release();
  await waitFor(() => expect(result.current).not.toBeNull());
  expect(fetchMock).toHaveBeenLastCalledWith("https://cdn.example/2.jpg", expect.anything());
});

it("저장소가 읽기를 막으면 없이 둔다 — 공유는 링크로 간다", async () => {
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  const { result } = renderHook(() => usePreparedPhotoFile("https://cdn.example/1.jpg", "a.jpg"));

  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(result.current).toBeNull();
});
