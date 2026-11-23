/**
 * 프레임 꾸미기(/theme) — 저장한 프레임을 고르면 주 버튼이 「수정하기」가 된다(2026-11-15 「프레임 꾸미기 이미 있던 거
 * 골랐으면 수정하기 같은 걸로 뜨게」). 예전에는 카드를 누르면 바로 편집기로 갔다(그 전에는 체크만 붙고 주 버튼은 늘
 * 「새 프레임 만들기」라 빈 새 프레임이 열렸다). 보관함이 가득해도 고치는 것은 된다.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ThemePage from "@/app/theme/page";
import { useThemeSession } from "@/lib/themeSessionStore";
import type { RemoteFrame, SubscriptionUsage } from "@/lib/api-types";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

const SAVED: RemoteFrame = {
  frameId: 7,
  title: "크리스마스 4컷",
  frameType: "GRID",
  background: { type: "COLOR", value: "f6d6dc" },
  components: [],
} as unknown as RemoteFrame;

jest.mock("@/hooks/useMyFrames", () => ({
  useMyFrames: () => ({ frames: [SAVED], isLoading: false, error: null, refresh: jest.fn() }),
}));

let mockUsage: SubscriptionUsage = {
  planTier: "PLUS",
  frameRetentionLimit: 3,
  frameRetentionUsedCount: 1,
  frameRetentionRemainingCount: 2,
  frameRetentionUnlimited: false,
} as SubscriptionUsage;
jest.mock("@/lib/userApi", () => ({
  getMyUserInfo: () => Promise.resolve({ planTier: "PLUS" }),
  getSubscriptionUsage: () => Promise.resolve(mockUsage),
}));

beforeEach(() => {
  mockPush.mockClear();
  useThemeSession.setState({ frameId: null, remoteFrameId: null });
});

async function renderPage() {
  render(<ThemePage />);
  await act(async () => {});
}

it("저장한 프레임을 고르면 주 버튼이 「수정하기」가 되고, 누르면 그 프레임을 연다", async () => {
  await renderPage();
  expect(screen.getByRole("button", { name: "새 프레임 만들기" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /크리스마스 4컷/ }));
  const edit = screen.getByRole("button", { name: "수정하기" });
  fireEvent.click(edit);

  expect(useThemeSession.getState().remoteFrameId).toBe(7);
  expect(useThemeSession.getState().frameId).toBe("grid-4");
  expect(mockPush).toHaveBeenCalledWith("/theme/sticker");
});

it("위에서 컷 구성을 누르면 풀리고 「새 프레임 만들기」로 돌아간다", async () => {
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: /크리스마스 4컷/ }));
  expect(screen.getByRole("button", { name: "수정하기" })).toBeInTheDocument();

  fireEvent.click(screen.getAllByRole("button", { name: /세로 4컷/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: "새 프레임 만들기" }));
  expect(useThemeSession.getState().remoteFrameId).toBeNull();
  expect(mockPush).toHaveBeenCalledWith("/theme/sticker");
});

it("보관함이 가득해도 저장한 프레임은 고칠 수 있다", async () => {
  mockUsage = { ...mockUsage, frameRetentionUsedCount: 3, frameRetentionRemainingCount: 0 } as SubscriptionUsage;
  await renderPage();
  await waitFor(() => expect(screen.getByRole("button", { name: "저장 공간을 확인해 주세요" })).toBeDisabled());

  fireEvent.click(screen.getByRole("button", { name: /크리스마스 4컷/ }));
  const edit = screen.getByRole("button", { name: "수정하기" });
  expect(edit).toBeEnabled();
  fireEvent.click(edit);
  expect(useThemeSession.getState().remoteFrameId).toBe(7);
});
