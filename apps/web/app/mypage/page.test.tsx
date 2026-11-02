/**
 * 마이페이지가 요금제를 어떻게 부르는가.
 *
 * 못 박는 것 하나 — **모르는 등급을 "무료"라고 부르지 않는다.** `getPlanDisplayName` 은
 * 프런트가 모르는 등급에 일부러 null 을 준다(constants/plans.ts, packages/shared/src/plans.ts).
 * 그 null 을 "무료"로 메우면 쿠폰으로 새 유료 등급을 받은 사용자에게 무료라고 말한다.
 * 등급이 아예 안 온 것("아직 모른다")과 이름만 모르는 것("서버는 줬는데 우리가 모른다")은
 * 다른 상태라 문구도 갈라야 한다.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MyPage from "@/app/mypage/page";
import type { UserInfo } from "@/lib/api-types";

const mockGetMyUserInfo = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/mypage",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/lib/userApi", () => ({
  getMyUserInfo: () => mockGetMyUserInfo(),
  getMySubscription: jest.fn(async () => null),
  getSubscriptionUsage: jest.fn(async () => null),
}));

jest.mock("@/lib/userMediaApi", () => ({ listMyMedia: jest.fn(async () => []) }));
jest.mock("@/lib/remoteFrameApi", () => ({ listMyFrames: jest.fn(async () => []) }));
jest.mock("@/lib/couponApi", () => ({
  listMyCoupons: jest.fn(async () => []),
  redeemCoupon: jest.fn(),
}));

// 화면 껍데기와 곁다리 패널은 이 테스트가 보는 것과 무관하고, 각자 자기 조회를 돈다.
jest.mock("@/components/layout/AppNav", () => ({ AppNav: () => null }));
jest.mock("@/components/layout/MobileTabBar", () => ({ MobileTabBar: () => null }));
jest.mock("@/components/terms/TermsConsentPanel", () => ({
  TermsConsentPanel: () => null,
}));
jest.mock("@/components/theme/ColorThemePreferencePanel", () => ({
  ColorThemePreferencePanel: () => null,
}));
jest.mock("@/components/mobile/NativeNotificationSetting", () => ({
  NativeNotificationSetting: () => null,
}));

const BASE_USER = {
  id: "Opwxk27uADEJ",
  email: "me@harucut.test",
  username: "하루",
  profileUrl: null,
  loginPlatform: "HARUCUT",
} as const;

/**
 * 접힌 줄의 부제. 요금제 이름이 화면에 나가는 자리 둘 중 하나이고, id 가 붙어 있어
 * 클래스나 위치가 아니라 구조로 집을 수 있다(page.tsx 의 `${bodyId}-sub`).
 */
async function renderWithPlanTier(planTier: unknown) {
  mockGetMyUserInfo.mockResolvedValue({
    ...BASE_USER,
    planTier,
  } as unknown as UserInfo);

  render(<MyPage />);
  await act(async () => {});

  const sub = document.getElementById("mypage-section-plan-sub");
  const body = document.getElementById("mypage-section-plan");
  if (!sub || !body) throw new Error("요금제 섹션을 찾지 못했다");
  return { sub, body };
}

afterEach(() => {
  mockGetMyUserInfo.mockReset();
});

describe("마이페이지 요금제 표시", () => {
  it("아는 등급은 사람이 읽는 이름으로 부른다", async () => {
    const { sub, body } = await renderWithPlanTier("PRO");

    expect(sub.textContent).toBe("프로");
    expect(body.textContent).toContain("프로");
  });

  it("BASIC 일 때만 무료라고 말한다", async () => {
    const { sub } = await renderWithPlanTier("BASIC");

    expect(sub.textContent).toBe("무료");
  });

  it("프런트가 모르는 등급을 무료로 표시하지 않는다", async () => {
    const { sub, body } = await renderWithPlanTier("STUDIO");

    expect(sub.textContent).not.toContain("무료");
    // 서버가 준 등급을 그대로 적는다 — 쿠폰 안내(handleRedeemCoupon)와 같은 처리다.
    expect(sub.textContent).toBe("STUDIO");
    expect(body.textContent).toContain("STUDIO");
  });

  it("등급이 아예 안 오면 모르는 등급과 다르게, 그러나 무료가 아니게 말한다", async () => {
    const { sub } = await renderWithPlanTier(undefined);

    expect(sub.textContent).not.toContain("무료");
    expect(sub.textContent).not.toBe("STUDIO");
    expect(sub.textContent?.trim()).not.toBe("");
  });
});

describe("등급 이름을 못 읽어도 화면은 뜬다", () => {
  it("회원 탈퇴는 취소할 수 있는 확인창을 먼저 연다", async () => {
    await renderWithPlanTier("BASIC");
    const trigger = screen.getByRole("button", { name: "회원 탈퇴" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "회원 탈퇴를 신청할까요?" });
    expect(dialog).toHaveTextContent("7일이 지나면 사진과 프레임이 모두 삭제돼요.");
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("모르는 등급이어도 화면이 오류로 떨어지지 않는다", async () => {
    await renderWithPlanTier("STUDIO");

    expect(screen.getByRole("heading", { name: "마이페이지" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "요금제 보기" })).toBeInTheDocument();
  });
});

// 정지 계정은 쓰지는 못하고 계정을 확인한 뒤 로그아웃하거나 탈퇴만 한다.
describe("정지 계정", () => {
  const originalFetch = global.fetch;

  async function renderBlocked() {
    mockGetMyUserInfo.mockResolvedValue({ ...BASE_USER, userStatus: "BLOCKED" } as unknown as UserInfo);
    render(<MyPage />);
    await screen.findByRole("heading", { name: "이용이 제한된 계정이에요" });
  }

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("안내와 문의처, 로그아웃과 탈퇴만 보여 준다", async () => {
    await renderBlocked();
    expect(screen.getByText(BASE_USER.username)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "회원 탈퇴" })).toBeInTheDocument();
    expect(document.getElementById("mypage-section-plan")).toBeNull();
    expect(screen.queryByText("비밀번호")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /닉네임/ })).not.toBeInTheDocument();
  });

  it("탈퇴 확인창이 복구해도 제한이 남는다고 말한다", async () => {
    await renderBlocked();
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    expect(screen.getByRole("dialog", { name: "회원 탈퇴를 신청할까요?" })).toHaveTextContent("복구해도 이용 제한은 그대로예요.");
  });

  // 평소에는 소유자를 넘기면 되지만 정지 계정은 Studio 에 들어가지 못해 넘길 수 없다.
  it("공간의 마지막 소유자면 문의하라고 말한다", async () => {
    await renderBlocked();
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ code: "MEMBER-004", status: 409, message: "x" }),
    })) as unknown as typeof fetch;
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "탈퇴 신청" }));
    expect(await screen.findByText(/마지막 소유자라 바로 탈퇴할 수 없어요/)).toBeInTheDocument();
  });

  // 프록시는 토큰의 상태만 본다. 풀린 뒤에도 옛 토큰이면 access 가 끝날 때까지 여기로 돌려보낸다.
  it("돌려보내졌는데 이미 풀려 있으면 새 토큰을 받는다", async () => {
    window.history.replaceState(null, "", "/mypage?restricted=1");
    const fetchMock = jest.fn<Promise<unknown>, [RequestInfo | URL]>(async () => ({ ok: true, status: 200, text: async () => "{}" }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await renderWithPlanTier("BASIC");
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/client/reissue")).toBe(true),
    );
    window.history.replaceState(null, "", "/mypage");
  });

  it("돌려보내졌고 아직 정지면 토큰을 다시 받지 않는다", async () => {
    window.history.replaceState(null, "", "/mypage?restricted=1");
    const fetchMock = jest.fn<Promise<unknown>, [RequestInfo | URL]>(async () => ({ ok: true, status: 200, text: async () => "{}" }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await renderBlocked();
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/client/reissue")).toBe(false);
    window.history.replaceState(null, "", "/mypage");
  });

  it("정지 계정이 아니면 이 안내가 없다", async () => {
    await renderWithPlanTier("BASIC");
    expect(screen.queryByRole("heading", { name: "이용이 제한된 계정이에요" })).not.toBeInTheDocument();
  });
});
