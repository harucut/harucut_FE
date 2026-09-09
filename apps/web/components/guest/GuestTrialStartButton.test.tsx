/**
 * "가입 없이 체험하기" CTA — **누른 사람이 이미 회원인지 먼저 본다.**
 *
 * 이 버튼은 공개 랜딩(`LandingView`)의 주 CTA 이기도 해서, 로그인한 사람이 `/` 로 오면
 * 그대로 눌린다. 예전에는 인증 여부를 보지 않고 곧장 체험 안내를 띄웠고, 확인을 누르면
 * `enterGuestMode()` 가 7일짜리 게스트 쿠키를 심었다. 그 순간부터 `/shoot` 은 저장 프레임을
 * 감추고 결과를 서버 기록 대신 브라우저에서만 합성하며, `/login` 은 유효 세션을 보고 `/home`
 * 으로 되돌려 보내 로그아웃 전까지 회원 기능으로 못 돌아온다.
 *
 * 그래서 두 갈래를 다 고정한다 — 회원은 안내도 쿠키도 없이 `/shoot`, 비회원은 예전 그대로.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GUEST_TRIAL_CTA_LABEL, GUEST_TRIAL_NOTICE } from "@harucut/shared";
import { GuestTrialOverlay } from "@/components/guest/GuestTrialOverlay";
import { GuestTrialStartButton } from "@/components/guest/GuestTrialStartButton";
import { GUEST_TRIAL_COOKIE } from "@/lib/guestTrialShared";
import { useGuestTrialStore } from "@/lib/guestTrialStore";

const mockPush = jest.fn();
const mockGet = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// 인증 쿠키는 httpOnly 라 클라이언트가 읽지 못한다 — 판정은 /api/auth/status 왕복 하나뿐이라
// 그 왕복만 대신한다(스토어·오버레이·훅은 실제 구현을 그대로 태운다).
jest.mock("@/lib/clientApi", () => ({
  clientApi: { get: (...args: unknown[]) => mockGet(...args) },
}));

function hasGuestCookie() {
  return document.cookie
    .split(";")
    .map((chunk) => chunk.trim())
    .includes(`${GUEST_TRIAL_COOKIE}=1`);
}

beforeEach(() => {
  jest.clearAllMocks();
  useGuestTrialStore.setState({
    accessMode: "member",
    hydrated: false,
    notice: null,
  });
  document.cookie = `${GUEST_TRIAL_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
});

describe("GuestTrialStartButton", () => {
  it("로그인 회원이 누르면 체험 안내도 게스트 쿠키도 없이 /shoot 로 간다", async () => {
    mockGet.mockResolvedValue({ ok: true, status: 200 });

    render(
      <>
        <GuestTrialStartButton />
        <GuestTrialOverlay />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: GUEST_TRIAL_CTA_LABEL }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/shoot"));
    expect(mockGet).toHaveBeenCalledWith("/api/auth/status", {
      cache: "no-store",
    });
    // 회원 상태를 덮어쓰지 않았다는 증거 둘 — 안내가 안 떴고 쿠키가 안 붙었다.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(hasGuestCookie()).toBe(false);
  });

  it("비회원이 누르면 체험 안내를 거쳐 게스트 쿠키가 붙는다", async () => {
    // 401 등 비인증. clientApi 는 실패를 예외로 던진다.
    mockGet.mockRejectedValue(new Error("unauthorized"));

    render(
      <>
        <GuestTrialStartButton />
        <GuestTrialOverlay />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: GUEST_TRIAL_CTA_LABEL }));

    // CTA 와 확인 버튼이 같은 문구라(의도된 것이다) 다이얼로그 안으로 범위를 좁힌다.
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: GUEST_TRIAL_NOTICE.confirmLabel,
      }),
    );

    expect(hasGuestCookie()).toBe(true);
    expect(mockPush).toHaveBeenCalledWith("/shoot");
  });
});
