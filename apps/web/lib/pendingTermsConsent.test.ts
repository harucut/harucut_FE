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
  /*
    `savedAt` 이 성한 숫자가 아니면 기한을 셀 수 없다. 숫자일 때만 검사하면 이 값들이
    기한 검사를 통째로 건너뛰고 정상으로 돌아온다 — 여기 값은 **법적 동의 이력**으로
    서버에 올라가므로(`TermsConsentBridge`), 하루가 한참 지난 선택 약관이 다음 사람의
    동의로 제출될 수 있다. 미래 시각은 나이가 늘 음수라 영영 안 지워진다.
  */
  it.each([
    ["없는", { items: ITEMS, email: EMAIL }],
    ["NaN 인", { items: ITEMS, email: EMAIL, savedAt: Number.NaN }],
    ["문자열인", { items: ITEMS, email: EMAIL, savedAt: String(NOW) }],
    ["한참 미래인", { items: ITEMS, email: EMAIL, savedAt: NOW + 60 * 60 * 1000 }],
  ])("savedAt 이 %s 보관물은 없는 것으로 보고 지운다", (_case, stored) => {
    window.localStorage.setItem(
      "harucut:pending-terms-consent:v1",
      JSON.stringify(stored),
    );

    expect(getPendingTermsConsent(NOW)).toBeNull();
    expect(
      window.localStorage.getItem("harucut:pending-terms-consent:v1"),
    ).toBeNull();
  });

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
