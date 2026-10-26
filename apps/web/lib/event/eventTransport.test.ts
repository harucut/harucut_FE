/** @jest-environment node */

import { getApiErrorMessageByCode } from "@harucut/shared";
import { registerSessionExpiredHandler, registerTermsConsentRequiredHandler } from "@/lib/clientApi";
import { sendEventRequest } from "@/lib/event/eventTransport";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("sendEventRequest — 행사 화면 전송", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    registerSessionExpiredHandler(null);
    registerTermsConsentRequiredHandler(null);
    jest.restoreAllMocks();
  });

  it("쿠키를 보내지 않고 참가자 자격 헤더 하나만 보낸다", async () => {
    const fetchMock = jest.fn(async () => json(200, { code: "GEN-000", data: { ok: 1 } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const data = await sendEventRequest("GET", "/api/client/participant/session", {
      credential: { kind: "participant", token: "p-token" },
      what: "참가 세션",
    });

    expect(data).toEqual({ ok: 1 });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.credentials).toBe("omit");
    const headers = init.headers as Headers;
    expect(headers.get("X-Participant-Token")).toBe("p-token");
    expect(headers.get("Authorization")).toBeNull();
  });

  it("결과 토큰은 Authorization Bearer 로 보낸다", async () => {
    const fetchMock = jest.fn(async () => json(200, { code: "GEN-000", data: {} }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendEventRequest("GET", "/api/client/public/results", {
      credential: { kind: "result", token: "r-token" },
    });

    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer r-token");
  });

  // F48 — 참가자 세션 만료가 회원 refresh·전역 「로그인이 만료됐어요」로 이어지면 안 된다.
  it("401 에 회원 재발급·세션 만료·약관 처리를 부르지 않고 오류만 던진다", async () => {
    const onExpired = jest.fn();
    const onTerms = jest.fn();
    registerSessionExpiredHandler(onExpired);
    registerTermsConsentRequiredHandler(onTerms);
    const fetchMock = jest.fn(async () => json(401, { code: "PART-001", status: 401, message: "x" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      sendEventRequest("GET", "/api/client/participant/session", {
        credential: { kind: "participant", token: "expired" },
      }),
    ).rejects.toMatchObject({ status: 401, code: "PART-001" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onExpired).not.toHaveBeenCalled();
    expect(onTerms).not.toHaveBeenCalled();
  });

  it("403 GEN-021 에 탈퇴요청 확인(/api/auth/status)을 하지 않는다", async () => {
    const fetchMock = jest.fn(async () => json(403, { code: "GEN-021", status: 403 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(sendEventRequest("POST", "/api/client/booth/participant-sessions", {
      credential: { kind: "booth", token: "b" },
    })).rejects.toMatchObject({ code: "GEN-021" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("응답 없이 끊기면 CLIENT-004 로 바꾸고, 그 코드에 문구가 있다", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    await expect(sendEventRequest("GET", "/api/client/public/events/abc")).rejects.toMatchObject({
      code: "CLIENT-004",
    });
    expect(getApiErrorMessageByCode("CLIENT-004")).toBeTruthy();
  });

  it("취소는 그대로 던진다", async () => {
    global.fetch = jest.fn(async () => {
      throw new DOMException("Aborted", "AbortError");
    }) as unknown as typeof fetch;

    await expect(sendEventRequest("GET", "/api/client/public/events/abc")).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
