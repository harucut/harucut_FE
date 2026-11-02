import { fireEvent, render, screen } from "@testing-library/react";
import { SocialLoginSection } from "./SocialLoginSection";

let mockGoogleAvailable = true;
const mockStart = jest.fn();
jest.mock("@/lib/nativeBridge", () => ({ supportsGoogleLogin: () => mockGoogleAvailable }));
jest.mock("@/lib/authLogin", () => ({ startSocialLogin: (...args: unknown[]) => mockStart(...args) }));

beforeEach(() => { mockGoogleAvailable = true; mockStart.mockClear(); });

it("일반 웹에서는 구글 로그인을 제공한다", () => {
  render(<SocialLoginSection redirectTo="/shoot" />);
  fireEvent.click(screen.getByRole("button", { name: /Google/ }));
  expect(mockStart).toHaveBeenCalledWith("google", "/shoot");
});

it("구글을 시스템 브라우저로 여는 셸에서는 버튼을 보이고 안내를 띄우지 않는다", () => {
  render(<SocialLoginSection />);
  expect(screen.getByRole("button", { name: /Google/ })).toBeInTheDocument();
  expect(screen.queryByText(/앱을 업데이트하면/)).not.toBeInTheDocument();
});

it("옛 셸은 차단될 구글 WebView 로그인을 시작하지 않고 업데이트를 안내한다", () => {
  mockGoogleAvailable = false;
  render(<SocialLoginSection />);
  expect(screen.queryByRole("button", { name: /Google/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /카카오/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /네이버/ })).toBeInTheDocument();
  expect(screen.getByText(/앱을 업데이트하면/)).toBeInTheDocument();
});
