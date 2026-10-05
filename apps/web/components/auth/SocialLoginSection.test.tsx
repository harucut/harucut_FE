import { fireEvent, render, screen } from "@testing-library/react";
import { SocialLoginSection } from "./SocialLoginSection";

let mockInShell = false;
const mockStart = jest.fn();
jest.mock("@/lib/nativeBridge", () => ({ isNativeShell: () => mockInShell }));
jest.mock("@/lib/authLogin", () => ({ startSocialLogin: (...args: unknown[]) => mockStart(...args) }));

beforeEach(() => { mockInShell = false; mockStart.mockClear(); });

it("일반 웹에서는 구글 로그인을 제공한다", () => {
  render(<SocialLoginSection redirectTo="/shoot" />);
  fireEvent.click(screen.getByRole("button", { name: /Google/ }));
  expect(mockStart).toHaveBeenCalledWith("google", "/shoot");
});

it("앱은 차단될 구글 WebView 로그인을 시작하지 않고 대안을 안내한다", () => {
  mockInShell = true;
  render(<SocialLoginSection />);
  expect(screen.queryByRole("button", { name: /Google/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /카카오/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /네이버/ })).toBeInTheDocument();
  expect(screen.getByText(/구글 계정은 웹 브라우저/)).toBeInTheDocument();
});
