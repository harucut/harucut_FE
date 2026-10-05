import { fetchServerAssetFile } from "./serverAssetFile";
import { decodeImageFile } from "./imageDecode";
jest.mock("./imageDecode", () => ({ decodeImageFile: jest.fn() }));
const url =
  "https://harucuts3.s3.ap-northeast-2.amazonaws.com/uploads/users/1/components/heart.png";
const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      headers: new Headers(),
      blob: async () => new Blob(["pixels"], { type: "image/png" }),
    });
  jest
    .mocked(decodeImageFile)
    .mockResolvedValue({ source: {} as CanvasImageSource, width: 512, height: 512 });
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});
test("검증한 파일 한 번만 내려받고 같은 파일의 크기를 확인한다", async () => {
  const file = await fetchServerAssetFile(url);
  expect(file.name).toBe("heart.png");
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith(
    url,
    expect.objectContaining({ credentials: "omit" }),
  );
  expect(decodeImageFile).toHaveBeenCalledWith(file);
});
test("임의 호스트에는 요청하지 않는다", async () => {
  await expect(fetchServerAssetFile("https://evil.test/heart.png")).rejects.toThrow();
  expect(global.fetch).not.toHaveBeenCalled();
});
test("화소 제한을 넘는 이미지는 적용하지 않는다", async () => {
  jest
    .mocked(decodeImageFile)
    .mockResolvedValue({ source: {} as CanvasImageSource, width: 8000, height: 8000 });
  await expect(fetchServerAssetFile(url)).rejects.toThrow("크기가 너무 크거나");
});
test("서명 만료 응답은 이미지로 적용하지 않는다", async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);
  await expect(fetchServerAssetFile(url)).rejects.toThrow("다시 선택");
});
