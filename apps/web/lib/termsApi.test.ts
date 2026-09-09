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

/**
 * 정적 약관 화면은 서버 본문의 **대역이 아니다.**
 *
 * 여기가 주소를 돌려주는 순간 동의 화면 셋이 전부 서버가 준 `content` 를 버리고
 * (가입·재동의·설정 모두 `href` 가 있으면 본문을 안 그린다) 번들에 굳은 글을 대신
 * 보여 준다. 관리자가 개정하면 그 글은 옛 버전이라, 사용자는 **읽은 글과 다른 버전에
 * 동의**하게 된다 — 동의 이력은 수정·삭제되지 않는다.
 *
 * 대역이 성립하려면 그 화면이 지금 동의받는 버전임을 증명할 수 있어야 하는데, 번들과
 * 서버 버전을 잇는 표시가 없다. 그래서 어떤 코드에도 주소를 주지 않는다.
 */
describe("termsContentHref", () => {
  it("정적 화면이 있는 코드에도 대역을 주지 않는다", () => {
    // 예전에 `/terms`·`/privacy` 로 보내던 넷. 여기가 다시 열리면 회귀다.
    for (const code of ["tos", "terms", "privacy", "marketing"]) {
      expect(termsContentHref(code)).toBeNull();
    }
  });

  it("관리자가 새로 만든 약관도 마찬가지다", () => {
    expect(termsContentHref("refund-policy")).toBeNull();
  });
});
