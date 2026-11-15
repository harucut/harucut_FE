/**
 * @jest-environment node
 *
 * 받는 사람 페이지의 서버 조회(2026-11-16). 토큰은 경로가 아니라 Authorization 으로 넘기고(백엔드 접근 기록에 남지 않게),
 * 닫힌 링크와 못 닿은 것을 가른다 — 앞은 「열 수 없는 링크」, 뒤는 다시 시도다.
 */
import { fetchSharedPhoto } from "@/lib/server/mediaShareServer";

jest.mock("next/headers", () => ({ headers: async () => new Headers() }));

const TOKEN = "tok_0123456789abcdef";
const fetchMock = jest.fn();

beforeEach(() => {
  process.env.NEXT_PUBLIC_BASE_URL = "https://api.example.test";
  delete process.env.BFF_SHARED_SECRET;
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const ok = (data: unknown) => new Response(JSON.stringify({ code: "GEN-000", status: 200, data }), { status: 200 });

it("열린 링크는 사진을 돌려주고, 토큰은 Authorization 으로 넘긴다", async () => {
  fetchMock.mockResolvedValue(
    ok({ displayName: "우리 넷.jpg", createdAt: "2026-11-15T14:30:00", imageUrl: "https://s3/i", downloadUrl: "https://s3/d" }),
  );

  await expect(fetchSharedPhoto(TOKEN)).resolves.toEqual({
    status: "ok",
    photo: { displayName: "우리 넷.jpg", createdAt: "2026-11-15T14:30:00", imageUrl: "https://s3/i", downloadUrl: "https://s3/d" },
  });
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
  expect(url).toBe("https://api.example.test/api/public/media-shares");
  expect(url).not.toContain(TOKEN);
  expect(init.headers.authorization).toBe(`Bearer ${TOKEN}`);
  expect(init.cache).toBe("no-store");
});

it("백엔드가 거절하면(없는 토큰·삭제·보관 기간 지남 404, 틀린 토큰 과다 시도 429) 닫힌 링크다", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: "MEDIA-002", status: 404 }), { status: 404 }));
  await expect(fetchSharedPhoto(TOKEN)).resolves.toEqual({ status: "closed" });
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: "GEN-061", status: 429 }), { status: 429 }));
  await expect(fetchSharedPhoto(TOKEN)).resolves.toEqual({ status: "closed" });
});

it("주소가 빠진 답도 닫힌 링크로 본다 — 깨진 그림을 띄우지 않는다", async () => {
  fetchMock.mockResolvedValue(ok({ displayName: "우리 넷", imageUrl: "https://s3/i" }));
  await expect(fetchSharedPhoto(TOKEN)).resolves.toEqual({ status: "closed" });
});

it("서버 오류와 끊김은 닫혔다고 하지 않는다", async () => {
  fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
  await expect(fetchSharedPhoto(TOKEN)).resolves.toEqual({ status: "unavailable" });
  fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
  await expect(fetchSharedPhoto(TOKEN)).resolves.toEqual({ status: "unavailable" });
});

it("토큰 모양이 아니면 백엔드에 묻지 않는다", async () => {
  await expect(fetchSharedPhoto("../../admin")).resolves.toEqual({ status: "closed" });
  await expect(fetchSharedPhoto("short")).resolves.toEqual({ status: "closed" });
  expect(fetchMock).not.toHaveBeenCalled();
});
