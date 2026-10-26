import { render, screen, waitFor } from "@testing-library/react";
import AppLoginCallbackPage from "@/app/oauth2/app-callback/page";
import { ApiRequestError } from "@/lib/clientApi";

const mockPost = jest.fn();
jest.mock("@/lib/clientApi", () => ({
  ...jest.requireActual("@/lib/clientApi"),
  clientApi: { post: (...a: unknown[]) => mockPost(...a) },
}));
// 교환 함수는 실제 것을 쓴다 — 경로·본문까지 확인한다.

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, "", "/oauth2/app-callback");
});

/*
  앱 로그인(P4) 코드 교환. 이동(location.replace)은 jsdom 에서 갈아 끼울 수 없어 확인하지 않는다
  (app/oauth2/callback/page.test.tsx 머리말과 같다). 교환 본문과 주소 정리, 실패 안내를 본다.
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

it("코드가 없으면 교환하지 않고 다시 로그인하게 한다", async () => {
  render(<AppLoginCallbackPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("로그인을 마치지 못했어요.");
  expect(mockPost).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "로그인으로 돌아가기" })).toHaveAttribute("href", "/login");
});

it("코드가 만료됐으면(AUTH-041) 그 문구를 보인다", async () => {
  mockPost.mockRejectedValue(new ApiRequestError({ status: 400, code: "AUTH-041", apiMessage: "x" }));
  window.history.replaceState(null, "", "/oauth2/app-callback#code=c1&verifier=v1");
  render(<AppLoginCallbackPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("로그인 시간이 지났어요. 다시 로그인해 주세요.");
});
