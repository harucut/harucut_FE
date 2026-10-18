/**
 * 보관함 API 어댑터.
 *
 * 목록은 **페이지 래퍼**({content,totalPages,number})로 오지만 배열로 올 수도 있어
 * 양쪽을 방어한다. 삭제는 되돌릴 수 없어서 호출 경로가 정확해야 한다.
 */
import { deleteMedia, getMediaDownloadUrl, listRecentMedia, listMyMedia, findMyMedia } from "@/lib/userMediaApi";
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

    // 종료 상한(AbortSignal)을 함께 넘긴다 — 응답 없이 멈추면 확인 다이얼로그가 감옥이
    // 된다(lib/userMediaApi.ts 의 DELETE_DEADLINE_MS). signal 이 빠지면 fetch 를 끊을 길이
    // 없으므로 여기서도 못을 박는다.
    expect(mockDelete).toHaveBeenCalledWith(
      "/api/client/user/media/42",
      expect.objectContaining({ signal: expect.anything() }),
    );
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


describe("운영 미디어 날짜", () => {
  const local = { mediaId: 1, s3Key: "a.jpg", createdAt: "2026-10-18T23:24:59.641949" };
  it("홈·기록·단건 조회 모두 시간대 없는 운영 시각을 KST로 보정한다", async () => {
    mockGet.mockResolvedValue({ data: { data: { content: [local], totalPages: 1, number: 0 } } });
    for (const items of [await listRecentMedia(), await listMyMedia(), [await findMyMedia(1)]]) {
      expect(items[0]?.createdAt).toBe("2026-10-18T23:24:59.641949+09:00");
      expect(new Date(items[0]!.createdAt!).toISOString()).toBe("2026-10-18T14:24:59.641Z");
    }
  });
  it("명시된 UTC·오프셋과 날짜 누락은 그대로 둔다", async () => {
    const content = [
      { ...local, createdAt: "2026-10-18T14:24:59Z" },
      { ...local, createdAt: "2026-10-18T23:24:59+09:00" },
      { ...local, createdAt: undefined },
    ];
    mockGet.mockResolvedValue({ data: { data: content } });
    expect(await listMyMedia()).toEqual(content);
  });
});
