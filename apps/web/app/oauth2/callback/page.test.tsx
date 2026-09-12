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
import { CLIENT_REISSUE_UNAVAILABLE_CODE } from "@harucut/shared";
import OAuthCallbackPage from "@/app/oauth2/callback/page";
import { ApiRequestError } from "@/lib/clientApi";

const mockGet = jest.fn();
const mockDelete = jest.fn();
const mockConsumeSocialLoginRedirect = jest.fn();

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

const ACTIVE_STATUS = { data: { data: { userStatus: "ACTIVE" } } };

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
