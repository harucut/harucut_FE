/**
 * 가입 화면의 동의를 로그인까지 들고 있는 보관소.
 *
 * 여기서 조용히 틀리면 사용자는 [필수] 체크박스를 눌러 가입했는데 서버 장부에는
 * 아무 기록도 남지 않는다 — 동의 이력은 "법적 증빙용"이라 나중에 만들어 넣을 수 없다.
 * 반대로 주인을 잃은 보관물이 남으면 고른 적 없는 계정에 기록이 붙고, 그건 지울 수도 없다.
 */
import {
  clearPendingTermsConsent,
  getPendingTermsConsent,
  isSameConsentAccount,
  PENDING_TERMS_CONSENT_TTL_MS,
  setPendingTermsConsent,
} from "@/lib/pendingTermsConsent";

const NOW = 1_700_000_000_000;
const EMAIL = "signup@example.com";

const ITEMS = [
  { code: "tos", agreed: true },
  { code: "privacy", agreed: true },
  { code: "marketing", agreed: false },
];

beforeEach(() => {
  window.localStorage.clear();
  jest.restoreAllMocks();
});

describe("pendingTermsConsent", () => {
  it("가입 이메일과 함께 보관했다가 그대로 돌려준다", () => {
    expect(setPendingTermsConsent(ITEMS, EMAIL, NOW)).toBe(true);
    expect(getPendingTermsConsent(NOW)).toEqual({
      items: ITEMS,
      email: EMAIL,
    });
  });

  it("빈 목록은 보관하지 않는다", () => {
    expect(setPendingTermsConsent([], EMAIL, NOW)).toBe(false);
    expect(getPendingTermsConsent(NOW)).toBeNull();
  });

  // 주인을 모르면 대조할 것이 없어 아무 계정에나 붙는다. 차라리 안 남긴다.
  it("이메일이 없으면 보관하지 않는다", () => {
    expect(setPendingTermsConsent(ITEMS, "", NOW)).toBe(false);
    expect(setPendingTermsConsent(ITEMS, "   ", NOW)).toBe(false);
    expect(getPendingTermsConsent(NOW)).toBeNull();
  });

  // 사파리 사생활 보호 모드 등은 setItem 이 조용히 아무것도 안 한다.
  it("쓰기가 실제로 남지 않으면 실패로 본다", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(setPendingTermsConsent(ITEMS, EMAIL, NOW)).toBe(false);
  });

  // 공용 기기에서 오래 묵은 선택이 그대로 장부에 오르는 것을 막는다.
  it("기한이 지난 보관물은 없는 것으로 보고 지운다", () => {
    setPendingTermsConsent(ITEMS, EMAIL, NOW);

    expect(
      getPendingTermsConsent(NOW + PENDING_TERMS_CONSENT_TTL_MS - 1),
    ).not.toBeNull();
    expect(
      getPendingTermsConsent(NOW + PENDING_TERMS_CONSENT_TTL_MS + 1),
    ).toBeNull();
    // 지웠으므로 시계를 되돌려도 살아나지 않는다.
    expect(getPendingTermsConsent(NOW)).toBeNull();
  });

  it("모양이 깨진 보관물은 버린다", () => {
    window.localStorage.setItem(
      "harucut:pending-terms-consent:v1",
      JSON.stringify({ items: [{ code: "tos" }], email: EMAIL, savedAt: NOW }),
    );
    expect(getPendingTermsConsent(NOW)).toBeNull();
  });

  // 이메일이 빠진 보관물은 주인을 확인할 방법이 없다.
  it("이메일이 빠진 보관물은 버린다", () => {
    window.localStorage.setItem(
      "harucut:pending-terms-consent:v1",
      JSON.stringify({ items: ITEMS, savedAt: NOW }),
    );
    expect(getPendingTermsConsent(NOW)).toBeNull();
    expect(
      window.localStorage.getItem("harucut:pending-terms-consent:v1"),
    ).toBeNull();
  });

  it("지우면 남지 않는다", () => {
    setPendingTermsConsent(ITEMS, EMAIL, NOW);
    clearPendingTermsConsent();
    expect(getPendingTermsConsent(NOW)).toBeNull();
  });
});

describe("isSameConsentAccount", () => {
  // 가입 폼에 친 문자열과 서버가 돌려주는 이메일의 표기가 늘 같지는 않다.
  it("대소문자·앞뒤 공백 차이는 같은 계정으로 본다", () => {
    expect(isSameConsentAccount(" Signup@Example.com ", EMAIL)).toBe(true);
  });

  it("다른 계정은 다른 계정으로 본다", () => {
    expect(isSameConsentAccount("other@example.com", EMAIL)).toBe(false);
  });

  // 빈 값끼리 "같다"고 답하면 주인 없는 보관물이 통과한다.
  it("빈 값은 어느 계정과도 같지 않다", () => {
    expect(isSameConsentAccount("", "")).toBe(false);
    expect(isSameConsentAccount("  ", EMAIL)).toBe(false);
  });
});
