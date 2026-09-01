/**
 * 약관 동의 API 어댑터.
 *
 * 서버 계약의 함정이 두 개라 여기서 못 지키면 통째로 실패한다(실측 2026-08-23):
 *  - 본문 **최상위가 배열**이다. 객체로 감싸면 GEN-006.
 *  - 검증 실패는 GEN-002 하나로만 온다 — **어느 항목이 왜 틀렸는지 알려주지 않는다.**
 *    그래서 보내기 전에 여기서 걸러야 한다.
 */
import {
  pendingRequiredConsents,
  submitTermsConsents,
  termsContentHref,
  type MyTermsConsent,
} from "@/lib/termsApi";

const mockPost = jest.fn();

jest.mock("@/lib/clientApi", () => ({
  clientApi: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({ data: { code: "GEN-000", status: 200 } });
});

function consent(over: Partial<MyTermsConsent>): MyTermsConsent {
  return {
    code: "tos",
    title: "이용약관",
    required: true,
    status: "AGREED",
    latestVersion: 1,
    ...over,
  };
}

describe("submitTermsConsents", () => {
  it("본문 최상위를 배열로 보낸다", async () => {
    await submitTermsConsents([
      { code: "tos", agreed: true },
      { code: "marketing", agreed: false },
    ]);

    const [path, body] = mockPost.mock.calls[0];
    expect(path).toBe("/api/client/auth/terms/consents");
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([
      { code: "tos", agreed: true },
      { code: "marketing", agreed: false },
    ]);
  });

  it("빈 코드는 보내기 전에 거른다", async () => {
    await submitTermsConsents([
      { code: "  ", agreed: true },
      { code: "tos", agreed: true },
    ]);

    expect(mockPost.mock.calls[0][1]).toEqual([{ code: "tos", agreed: true }]);
  });

  // 전부 걸러져 빈 배열이 되면 보낼 이유가 없다 — 서버는 GEN-002 로 돌려준다.
  it("보낼 것이 하나도 없으면 요청하지 않는다", async () => {
    await submitTermsConsents([{ code: "", agreed: true }]);
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe("pendingRequiredConsents", () => {
  it("필수인데 동의가 유효하지 않은 것만 고른다", () => {
    const result = pendingRequiredConsents([
      consent({ code: "tos", status: "NEEDS_RECONSENT" }),
      consent({ code: "privacy", status: "AGREED" }),
      // 선택 약관은 동의하지 않아도 붙잡지 않는다.
      consent({ code: "marketing", required: false, status: "NOT_AGREED" }),
      consent({ code: "extra", status: "NOT_AGREED" }),
    ]);

    expect(result.map((item) => item.code)).toEqual(["tos", "extra"]);
  });
});

describe("termsContentHref", () => {
  it("우리 화면이 있는 코드만 주소를 준다", () => {
    expect(termsContentHref("tos")).toBe("/terms");
    expect(termsContentHref("privacy")).toBe("/privacy");
    // 관리자가 새로 만든 약관은 우리 화면이 없다 — 서버 본문을 그 자리에서 보여 줘야 한다.
    expect(termsContentHref("refund-policy")).toBeNull();
  });
});
