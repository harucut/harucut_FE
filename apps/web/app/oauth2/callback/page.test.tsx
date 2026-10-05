/**
 * 소셜 로그인 콜백이 **어떤 실패에서 방금 받은 세션을 지우는가**.
 *
 * 예전엔 상태 조회의 모든 실패가 한 갈래였다 — 네트워크가 잠깐 끊기거나 서버가 5xx 를
 * 줘도 쿠키를 지우고 /login 으로 보냈다. 특히 `CLIENT-001`(503)은 `lib/clientApi.ts` 가
 * "세션 만료가 아니다"라고 일부러 만들어 던지는 값인데, 이 화면에서만 만료처럼 다뤄졌다.
 * 화면은 그동안에도 "확인하는 중"이라고 말해 사용자는 이유조차 알 수 없었다.
 *
 * 이동(`window.location.href` 대입)은 여기서 확인하지 않는다 — jsdom 의 `location` 은
 * 갈아 끼울 수 없어(configurable:false) 목적지를 읽을 방법이 없다. 대신 세션을 지웠는지,
 * 돌아갈 곳을 몇 번 꺼냈는지로 같은 회귀를 잡는다.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { COMPANY, CLIENT_REISSUE_UNAVAILABLE_CODE } from "@harucut/shared";
import OAuthCallbackPage from "@/app/oauth2/callback/page";
import { ApiRequestError } from "@/lib/clientApi";

const mockGet = jest.fn();
const mockDelete = jest.fn();
const mockConsumeSocialLoginRedirect = jest.fn();
const mockReactivateAccount = jest.fn();
const mockStartSocialLogin = jest.fn();

// 실제 모듈을 그대로 두고 호출부만 바꾼다 — 페이지가 `instanceof ApiRequestError` 로
// 실패를 가르므로, 테스트와 페이지가 **같은 클래스**를 봐야 한다.
jest.mock("@/lib/clientApi", () => ({
  ...jest.requireActual("@/lib/clientApi"),
  clientApi: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

jest.mock("@/lib/socialLoginRedirect", () => ({
  ...jest.requireActual("@/lib/socialLoginRedirect"),
  consumeSocialLoginRedirect: () => mockConsumeSocialLoginRedirect(),
}));

jest.mock("@/lib/auth/authApi", () => ({
  reactivateAccount: () => mockReactivateAccount(),
}));

// 인가를 다시 태우는 것은 문서 이동이라 jsdom 에서 볼 수 없다 — 부른 인자로 본다.
jest.mock("@/lib/authLogin", () => ({
  ...jest.requireActual("@/lib/authLogin"),
  startSocialLogin: (...args: unknown[]) => mockStartSocialLogin(...args),
}));

/** `clientApi.get` 이 돌려주는 모양 그대로 — `data` 가 서버 봉투 전체다. */
function statusOf(userStatus: string) {
  return { data: { code: "GEN-000", status: 200, data: { userStatus } } };
}

const ACTIVE_STATUS = statusOf("ACTIVE");

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
  mockDelete.mockResolvedValue(undefined);
  // 진짜 저장소와 같은 규칙 — 꺼내면 사라진다.
  mockConsumeSocialLoginRedirect.mockReturnValue(null);

  jest.spyOn(window, "alert").mockImplementation(() => {});
  // 페이지는 실패를 console.error 로 남기고, jsdom 은 이동을 "not implemented" 로 흘린다.
  // 둘 다 테스트 출력의 잡음이라 막는다.
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function reissueUnavailable() {
  return new ApiRequestError({
    status: 503,
    code: CLIENT_REISSUE_UNAVAILABLE_CODE,
    apiMessage: null,
  });
}

it("일시적인 실패에서는 세션을 지우지 않고 사유와 다시 시도를 보여준다", async () => {
  mockGet.mockRejectedValue(reissueUnavailable());

  render(<OAuthCallbackPage />);

  expect(
    await screen.findByText(
      "일시적인 문제로 로그인 상태를 갱신하지 못했어요. 잠시 후 다시 시도해 주세요.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();

  // 여기서 로그아웃하면 멀쩡할 수도 있는 세션이 사라진다.
  expect(mockDelete).not.toHaveBeenCalled();
});

it("다시 시도는 처음 꺼내 둔 목적지를 다시 꺼내지 않는다", async () => {
  // 돌아갈 곳은 세션 저장소에서 한 번만 꺼낼 수 있다. 첫 시도가 이미 비웠으므로,
  // 붙잡아 두지 않으면 다시 시도는 기본 경로(/home)로 떨어진다.
  mockConsumeSocialLoginRedirect.mockReturnValueOnce("/history");
  mockGet
    .mockRejectedValueOnce(reissueUnavailable())
    .mockResolvedValueOnce(ACTIVE_STATUS);

  render(<OAuthCallbackPage />);

  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));

  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  expect(mockConsumeSocialLoginRedirect).toHaveBeenCalledTimes(1);
  expect(mockDelete).not.toHaveBeenCalled();
});

it("서버가 자격증명을 거부하면(401) 세션을 정리한다", async () => {
  mockGet.mockRejectedValue(
    new ApiRequestError({ status: 401, code: "AUTH-010" }),
  );

  render(<OAuthCallbackPage />);

  await waitFor(() =>
    expect(mockDelete).toHaveBeenCalledWith("/api/client/logout"),
  );
  expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
});

/*
  제공자 화면에서 취소하거나 인가가 실패해도 백엔드는 이 콜백으로 보낸다 — `?error=oauth2` 만
  붙여서. 새 세션이 없는데 상태를 물으면 세션 없는 401 이 재발급 실패를 거쳐 「일시적인 문제」+
  「다시 시도」로 보였고, 눌러도 같은 자리를 돌았다.
*/
describe("제공자가 실패로 돌려보낸 경우(?error=)", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/oauth2/callback?error=oauth2");
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("아무것도 묻거나 지우지 않고 실패를 알린 뒤 로그인으로 돌려보낸다", async () => {
    mockConsumeSocialLoginRedirect.mockReturnValueOnce("/history");
    window.sessionStorage.setItem("social-login-provider", "kakao");

    render(<OAuthCallbackPage />);

    expect(
      await screen.findByText("로그인을 마치지 못했어요. 다시 시도해 주세요."),
    ).toBeInTheDocument();
    // 제목이 「처리 중」으로 남으면 본문과 반대 말을 한다.
    expect(
      screen.getByRole("heading", { name: "로그인하지 못했어요" }),
    ).toBeInTheDocument();
    // 원래 가려던 곳을 잃지 않는다. 로그인 화면도 같은 이유를 폼 위에 남긴다(socialError).
    expect(
      screen.getByRole("link", { name: "로그인으로 돌아가기" }),
    ).toHaveAttribute("href", "/login?socialError=1&redirectTo=%2Fhistory");
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    // 다음 소셜 로그인이 이번 실패의 제공자 기록을 물려받지 않는다.
    expect(window.sessionStorage.getItem("social-login-provider")).toBeNull();
  });
});

// 상태 조회는 차단·탈퇴 계정에도 200 이다. 그대로 들여보내면 일반 API 가 전부 막힌 홈에 갇힌다.
it.each(["BLOCKED", "DELETED"])(
  "%s 계정은 들여보내지 않고 세션을 지운 뒤 문의처를 보여 준다",
  async (userStatus) => {
    mockGet.mockResolvedValue(statusOf(userStatus));

    render(<OAuthCallbackPage />);

    expect(
      await screen.findByText("이용이 제한된 계정이에요. 고객센터로 문의해 주세요."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "로그인하지 못했어요" }),
    ).toBeInTheDocument();
    expect(mockDelete).toHaveBeenCalledWith("/api/client/logout");
    expect(screen.getByRole("link", { name: COMPANY.email })).toHaveAttribute(
      "href",
      `mailto:${COMPANY.email}`,
    );
    expect(
      screen.getByRole("link", { name: "로그인으로 돌아가기" }),
    ).toHaveAttribute("href", "/login");
  },
);

/*
  상태는 서버 봉투 전체에서 읽는다(lib/authUserStatus.ts 의 readUserStatus). 예전엔 이 화면만
  봉투 안쪽을 따로 읽었다 — 읽는 자리가 갈라지면 한쪽만 고쳐져 복구 분기가 조용히 빠진다.
*/
it("탈퇴요청 계정은 복구한 뒤 같은 제공자로 인가를 한 번 더 탄다", async () => {
  mockConsumeSocialLoginRedirect.mockReturnValueOnce("/history");
  window.sessionStorage.setItem("social-login-provider", "kakao");
  mockGet.mockResolvedValue(statusOf("DELETED_REQUESTED"));
  mockReactivateAccount.mockResolvedValue(undefined);
  jest.spyOn(window, "confirm").mockReturnValue(true);

  render(<OAuthCallbackPage />);

  await waitFor(() =>
    expect(mockStartSocialLogin).toHaveBeenCalledWith("kakao", "/history"),
  );
  expect(mockReactivateAccount).toHaveBeenCalledTimes(1);
  expect(mockDelete).not.toHaveBeenCalled();
});
