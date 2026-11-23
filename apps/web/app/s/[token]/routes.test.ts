/**
 * @jest-environment node
 *
 * 받는 사람 페이지의 그림·내려받기 주소(2026-11-16). 부를 때마다 백엔드에 다시 묻고 새 서명 주소로 보낸다. 닫힌 링크는 404,
 * 못 닿았으면 503 이다. 리퍼러를 보내지 않고 캐시하지 않는다.
 */
import { GET as getImage } from "@/app/s/[token]/image/route";
import { GET as getDownload } from "@/app/s/[token]/download/route";

const mockFetchSharedPhoto = jest.fn();
jest.mock("@/lib/server/mediaShareServer", () => ({
  fetchSharedPhoto: (...args: unknown[]) => mockFetchSharedPhoto(...args),
}));

const TOKEN = "tok_0123456789abcdef";
const params = { params: Promise.resolve({ token: TOKEN }) };
const request = new Request(`https://www.harucut.com/s/${TOKEN}/image`);

beforeEach(() => mockFetchSharedPhoto.mockReset());

it("그림은 새 보기 주소로, 내려받기는 새 첨부 주소로 보낸다", async () => {
  mockFetchSharedPhoto.mockResolvedValue({
    status: "ok",
    photo: { displayName: "우리 넷", createdAt: null, imageUrl: "https://s3.example/i?sig=1", downloadUrl: "https://s3.example/d?sig=2" },
  });

  const image = await getImage(request, params);
  expect(image.status).toBe(302);
  expect(image.headers.get("location")).toBe("https://s3.example/i?sig=1");
  expect(image.headers.get("cache-control")).toBe("no-store");
  expect(image.headers.get("referrer-policy")).toBe("no-referrer");

  const download = await getDownload(request, params);
  expect(download.status).toBe(302);
  expect(download.headers.get("location")).toBe("https://s3.example/d?sig=2");
  expect(mockFetchSharedPhoto).toHaveBeenCalledWith(TOKEN);
});

it("닫힌 링크는 404, 못 닿았으면 503", async () => {
  mockFetchSharedPhoto.mockResolvedValueOnce({ status: "closed" });
  expect((await getImage(request, params)).status).toBe(404);
  mockFetchSharedPhoto.mockResolvedValueOnce({ status: "unavailable" });
  expect((await getDownload(request, params)).status).toBe(503);
});
