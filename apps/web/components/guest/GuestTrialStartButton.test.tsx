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
const mockFetch = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// 인증 쿠키는 httpOnly 라 클라이언트가 읽지 못한다 — 판정은 `/api/auth/session` 왕복
// 하나뿐이라 그 왕복만 대신한다(스토어·오버레이·훅은 실제 구현을 그대로 태운다).
//
// `/api/auth/status` 가 아니다. 그쪽은 탈퇴요청·탈퇴·차단 계정에도 200 을 주므로, 앱을
// 못 쓰는 사람을 회원으로 읽어 `/shoot` 으로 보낸다 — 거기서는 일반 API 가 전부 403 이라
// 촬영도 체험도 못 한다. `authenticated` 판정이 그 셋을 이미 걸러 준다.
//
// **`clientApi` 는 목으로 갈아 끼우지 않는다.** 401 재발급·재시도가 이 훅이 기대는 동작의
// 일부라(만료된 액세스 토큰을 든 회원), 목으로 덮으면 그 경로가 통째로 테스트 밖으로
// 나간다. 대신 그 아래의 `fetch` 만 갈아 끼워 진짜 `clientApi` 를 태운다.
//
// 갈아 끼우는 자리는 `beforeEach` 다 — 모듈 최상단이 아니다. jest.setup 의
// `server.listen()` 이 `beforeAll` 에서 `globalThis.fetch` 를 msw 인터셉터로 덮으므로,
// 모듈 최상단에서 넣어 두면 그 뒤에 통째로 밀린다.

/** `/api/auth/status` 응답 한 벌. `userStatus` 를 주면 본문에 실어 보낸다. */
function statusResponse(userStatus?: string) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () =>
      JSON.stringify(userStatus ? { data: { userStatus } } : { data: {} }),
  };
}

/** 액세스 토큰이 만료된 응답. `clientApi` 가 여기서 재발급을 시도한다. */
function unauthorizedResponse() {
  return {
    ok: false,
    status: 401,
    headers: new Headers(),
    text: async () => JSON.stringify({ code: "AUTH-001" }),
  };
}

/** 경로별로 답을 정해 준다. 재발급은 기본적으로 성공시킨다. */
function routeFetch(handlers: {
  status: Array<ReturnType<typeof statusResponse> | ReturnType<typeof unauthorizedResponse>>;
  reissueOk?: boolean;
}) {
  const status = [...handlers.status];
  mockFetch.mockImplementation(async (url: string) => {
    if (url === "/api/client/reissue") {
      return handlers.reissueOk === false
        ? unauthorizedResponse()
        : { ok: true, status: 200, headers: new Headers(), text: async () => "" };
    }
    return status.length > 1 ? status.shift() : status[0];
  });
}

function hasGuestCookie() {
  return document.cookie
    .split(";")
    .map((chunk) => chunk.trim())
    .includes(`${GUEST_TRIAL_COOKIE}=1`);
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = ((...args: unknown[]) =>
    mockFetch(...args)) as unknown as typeof fetch;
  useGuestTrialStore.setState({
    accessMode: "member",
    hydrated: false,
    notice: null,
  });
  document.cookie = `${GUEST_TRIAL_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
});

/** 게스트 쿠키를 심어 둔다 — 앞 배포에서 이 버튼을 눌러 버린 회원의 상태다. */
function plantGuestCookie() {
  useGuestTrialStore.getState().enterGuestMode();
  expect(hasGuestCookie()).toBe(true);
}

describe("GuestTrialStartButton", () => {
  it("로그인 회원이 누르면 체험 안내도 게스트 쿠키도 없이 /shoot 로 간다", async () => {
    routeFetch({ status: [statusResponse()] });

    render(
      <>
        <GuestTrialStartButton />
        <GuestTrialOverlay />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: GUEST_TRIAL_CTA_LABEL }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/shoot"));
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/status",
      expect.objectContaining({ cache: "no-store", credentials: "include" }),
    );
    // 회원 상태를 덮어쓰지 않았다는 증거 둘 — 안내가 안 떴고 쿠키가 안 붙었다.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(hasGuestCookie()).toBe(false);
  });

  it("비회원이 누르면 체험 안내를 거쳐 게스트 쿠키가 붙는다", async () => {
    // 401 이고 재발급도 안 된다 = 진짜 비회원.
    routeFetch({ status: [unauthorizedResponse()], reissueOk: false });

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

  /*
    회귀 — 앱을 **못 쓰는** 계정은 회원 촬영으로 보내지 않는다.

    `/api/auth/status` 는 탈퇴요청·탈퇴·차단 계정에도 200 을 준다(복구 안내로 갈 수 있게
    서버가 열어 둔 예외다). 그 200 을 회원으로 읽으면 이 사람은 `/shoot` 으로 가는데,
    거기서는 일반 API 가 전부 403(GEN-021)이라 촬영도 저장도 못 하고 체험으로 돌아올
    길도 없다 — 이 버튼이 로그인 화면에도 붙어 있어서 특히 그렇다.
    `/api/auth/session` 이 그 셋을 걸러 `authenticated: false` 로 준다.
  */
  it("탈퇴요청 계정은 회원 촬영이 아니라 체험 안내로 간다", async () => {
    routeFetch({ status: [statusResponse("DELETED_REQUESTED")] });

    render(
      <>
        <GuestTrialStartButton />
        <GuestTrialOverlay />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: GUEST_TRIAL_CTA_LABEL }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  /*
    회귀 — 회원이면 **남아 있던 게스트 쿠키를 걷어낸다.**

    이 판정이 붙기 전 배포에서 회원이 이 버튼을 눌렀다면 유효한 세션과 7일짜리 게스트
    쿠키가 함께 남아 있다. 그 쿠키는 이 화면을 고쳐도 저절로 없어지지 않고, 그동안
    `hydrateGuestMode()` 가 매번 다시 읽어 저장 프레임을 감춘다. 서버가 방금 확인해 준
    회원이라는 사실이 그 쿠키보다 새로우므로 여기서 정리한다.
  */
  it("회원이면 남아 있던 게스트 쿠키를 걷어내고 간다", async () => {
    plantGuestCookie();
    routeFetch({ status: [statusResponse()] });

    render(
      <>
        <GuestTrialStartButton />
        <GuestTrialOverlay />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: GUEST_TRIAL_CTA_LABEL }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/shoot"));
    expect(hasGuestCookie()).toBe(false);
    expect(useGuestTrialStore.getState().accessMode).toBe("member");
  });

  /*
    회귀 — **액세스 토큰만 만료된 회원**을 비회원으로 읽지 않는다.

    액세스 JWT 는 짧고 refresh 쿠키는 길어서, 오랜만에 들어온 회원은 첫 요청이 401 이다.
    백엔드는 refresh 를 access 로 받아 주지 않으므로(docs/backend-contract.md) 재발급을
    거쳐야 하는데, 판정을 생 `fetch` 로 하면 그 401 을 그대로 「비회원」으로 읽는다.
    그러면 이 사람에게 체험 안내가 뜨고, 확인 한 번에 7일짜리 게스트 쿠키가 심겨 회원
    촬영을 잃는다 — 이 훅이 애초에 막으려던 사고가 다른 문으로 들어오는 셈이다.
  */
  it("액세스 토큰만 만료된 회원은 재발급 뒤 회원으로 본다", async () => {
    // 첫 조회는 401, 재발급 성공, 다시 조회하면 200.
    routeFetch({ status: [unauthorizedResponse(), statusResponse()] });

    render(
      <>
        <GuestTrialStartButton />
        <GuestTrialOverlay />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: GUEST_TRIAL_CTA_LABEL }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/shoot"));
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/client/reissue",
      expect.objectContaining({ method: "POST" }),
    );
    // 고치기 전에는 여기서 체험 안내가 떴다.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(hasGuestCookie()).toBe(false);
  });

  /*
    회귀 — **판정할 수 없을 때 이 버튼은 체험 안내로 간다.**

    행사 진입(app/shoot/page.tsx)과 갈리는 자리다. 거기서는 `unknown` 에 아무것도 하지
    않는다 — 그 판정이 곧바로 7일짜리 쿠키를 심기 때문이다. 여기서는 안내가 뜰 뿐이고
    쿠키는 사용자가 확인을 누를 때 심기므로, 서버가 잠깐 못 답했다고 비회원이 촬영 자체를
    못 하게 되는 쪽을 막는다.
  */
  it("상태 조회가 실패하면 체험 안내로 간다", async () => {
    // 5xx. clientApi 는 이것을 예외로 던지고, 판정은 unknown 이 된다.
    routeFetch({
      status: [
        {
          ok: false,
          status: 503,
          headers: new Headers(),
          text: async () => JSON.stringify({ code: "GEN-999" }),
        },
      ],
    });

    render(
      <>
        <GuestTrialStartButton />
        <GuestTrialOverlay />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: GUEST_TRIAL_CTA_LABEL }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
