import { render, screen, waitFor } from "@testing-library/react";
import AppLoginCallbackPage from "@/app/oauth2/app-callback/page";
import { ApiRequestError } from "@/lib/clientApi";

const mockPost = jest.fn();
jest.mock("@/lib/clientApi", () => ({
  ...jest.requireActual("@/lib/clientApi"),
  clientApi: { post: (...a: unknown[]) => mockPost(...a) },
}));
// 교환 함수는 실제 것을 쓴다 — 경로·본문까지 확인한다.

// 문서 이동은 jsdom 에서 볼 수 없어 목적지만 받는다(lib/redirect 의 replaceLocation).
const mockReplaceLocation = jest.fn();
jest.mock("@/lib/redirect", () => ({
  ...jest.requireActual("@/lib/redirect"),
  replaceLocation: (href: string) => mockReplaceLocation(href),
}));

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, "", "/oauth2/app-callback");
});

/*
  앱 로그인(P4) 코드 교환. 교환 본문과 주소 정리, 그리고 어디로 보내는지를 본다.
  실패하면 이 화면에서 말하지 않고 로그인 화면(socialError=1)이 폼 위 한 줄로 말한다.
*/
it("fragment 의 코드와 verifier 로 한 번만 교환하고, 주소에서 코드를 지운다", async () => {
  mockPost.mockReturnValue(new Promise(() => {}));
  window.history.replaceState(null, "", "/oauth2/app-callback#code=c1&verifier=v1");
  render(<AppLoginCallbackPage />);

  await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
  expect(mockPost).toHaveBeenCalledWith("/api/client/auth/oauth2/exchange", { code: "c1", codeVerifier: "v1" });
  expect(window.location.hash).toBe("");
  expect(screen.getByRole("status")).toHaveTextContent("로그인을 마치는 중이에요.");
});

it("교환에 성공하면 소셜 로그인 콜백으로 넘긴다", async () => {
  mockPost.mockResolvedValue({ data: null });
  window.history.replaceState(null, "", "/oauth2/app-callback#code=c1&verifier=v1");
  render(<AppLoginCallbackPage />);
  await waitFor(() => expect(mockReplaceLocation).toHaveBeenCalledWith("/oauth2/callback"));
});

it("코드가 없으면 교환하지 않고 로그인 화면으로 돌려보낸다", async () => {
  render(<AppLoginCallbackPage />);
  await waitFor(() => expect(mockReplaceLocation).toHaveBeenCalledWith("/login?socialError=1"));
  expect(mockPost).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("교환에 실패하면(AUTH-041 등) 로그인 화면으로 돌려보낸다", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockPost.mockRejectedValue(new ApiRequestError({ status: 400, code: "AUTH-041", apiMessage: "x" }));
  window.history.replaceState(null, "", "/oauth2/app-callback#code=c1&verifier=v1");
  render(<AppLoginCallbackPage />);
  await waitFor(() => expect(mockReplaceLocation).toHaveBeenCalledWith("/login?socialError=1"));
  expect(screen.queryByRole("alert")).toBeNull();
});
