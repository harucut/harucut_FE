/**
 * 보관함 API 어댑터.
 *
 * 목록은 **페이지 래퍼**({content,totalPages,number})로 오지만 배열로 올 수도 있어
 * 양쪽을 방어한다. 삭제는 되돌릴 수 없어서 호출 경로가 정확해야 한다.
 */
import { deleteMedia, getMediaDownloadUrl } from "@/lib/userMediaApi";
import { EmptyResponseError } from "@/lib/apiEnvelope";

const mockGet = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/lib/clientApi", () => ({
  clientApi: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("deleteMedia", () => {
  it("mediaId 로 DELETE 를 부른다", async () => {
    mockDelete.mockResolvedValue({ data: { code: "GEN-000", status: 200 } });

    await deleteMedia(42);

    expect(mockDelete).toHaveBeenCalledWith("/api/client/user/media/42");
  });

  it("본문이 없는 200 이어도 성공이다 — 삭제는 돌려줄 값이 없다", async () => {
    mockDelete.mockResolvedValue({ data: { code: "GEN-000", status: 200 } });

    await expect(deleteMedia(1)).resolves.toBeUndefined();
  });
});

describe("getMediaDownloadUrl", () => {
  it("주소를 꺼낸다", async () => {
    mockGet.mockResolvedValue({
      data: { code: "GEN-000", status: 200, data: "https://example.com/a.png" },
    });

    await expect(getMediaDownloadUrl(7)).resolves.toBe("https://example.com/a.png");
  });

  it("200 인데 주소가 비면 터뜨린다 — 빈 링크를 내려주지 않는다", async () => {
    mockGet.mockResolvedValue({ data: { code: "GEN-000", status: 200 } });

    await expect(getMediaDownloadUrl(7)).rejects.toBeInstanceOf(EmptyResponseError);
  });
});
