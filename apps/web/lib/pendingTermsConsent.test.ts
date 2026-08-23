/**
 * 가입 화면의 동의를 로그인까지 들고 있는 보관소.
 *
 * 여기서 조용히 틀리면 사용자는 [필수] 체크박스를 눌러 가입했는데 서버 장부에는
 * 아무 기록도 남지 않는다 — 동의 이력은 "법적 증빙용"이라 나중에 만들어 넣을 수 없다.
 */
import {
  clearPendingTermsConsent,
  getPendingTermsConsent,
  PENDING_TERMS_CONSENT_TTL_MS,
  setPendingTermsConsent,
} from "@/lib/pendingTermsConsent";

const NOW = 1_700_000_000_000;

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
  it("보관했다가 그대로 돌려준다", () => {
    expect(setPendingTermsConsent(ITEMS, NOW)).toBe(true);
    expect(getPendingTermsConsent(NOW)).toEqual(ITEMS);
  });

  it("빈 목록은 보관하지 않는다", () => {
    expect(setPendingTermsConsent([], NOW)).toBe(false);
    expect(getPendingTermsConsent(NOW)).toBeNull();
  });

  // 사파리 사생활 보호 모드 등은 setItem 이 조용히 아무것도 안 한다.
  it("쓰기가 실제로 남지 않으면 실패로 본다", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(setPendingTermsConsent(ITEMS, NOW)).toBe(false);
  });

  // 공용 기기에서 남의 선택이 내 계정에 붙는 것을 막는다.
  it("기한이 지난 보관물은 없는 것으로 보고 지운다", () => {
    setPendingTermsConsent(ITEMS, NOW);

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
      JSON.stringify({ items: [{ code: "tos" }], savedAt: NOW }),
    );
    expect(getPendingTermsConsent(NOW)).toBeNull();
  });

  it("지우면 남지 않는다", () => {
    setPendingTermsConsent(ITEMS, NOW);
    clearPendingTermsConsent();
    expect(getPendingTermsConsent(NOW)).toBeNull();
  });
});
