/**
 * 비회원 결과 이관의 **후반부** — 로그인 뒤 보관물을 꺼내 서버 합성을 돌리는 쪽.
 *
 * 이쪽은 그동안 테스트가 하나도 없었다. 앞쪽(보관하기)만 덮여 있어서, 꺼내는 조건이나
 * 실패 처리가 잘못돼도 아무도 몰랐다 — 실제로 두 가지가 틀려 있었다.
 *  1. `?resumeSave=1` 주소를 타야만 돌아서, 다른 경로로 로그인하면 영영 저장되지 않았다
 *  2. 영구 실패에도 "새로고침하면 다시 시도해요"라 안내해 무한 재업로드가 됐다
 */
import { render, waitFor } from "@testing-library/react";
import { GuestTrialBridge } from "@/components/guest/GuestTrialBridge";
import { useGuestTrialStore } from "@/lib/guestTrialStore";

const mockReplace = jest.fn();
const mockSaveFourcutToServer = jest.fn();
const mockGetPending = jest.fn();
const mockClearPending = jest.fn();
const mockDescribeComposeFailure = jest.fn();

let mockSearch = new URLSearchParams();

jest.mock("next/navigation", () => ({
  usePathname: () => "/home",
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearch,
}));

jest.mock("@/components/guest/GuestTrialOverlay", () => ({
  GuestTrialOverlay: () => <div data-testid="guest-overlay" />,
}));

jest.mock("@/lib/fourcutProcessing", () => ({
  saveFourcutToServer: (...args: unknown[]) => mockSaveFourcutToServer(...args),
}));

jest.mock("@/lib/pendingGuestSave", () => ({
  getPendingGuestSave: (...args: unknown[]) => mockGetPending(...args),
  clearPendingGuestSave: (...args: unknown[]) => mockClearPending(...args),
}));

jest.mock("@/lib/fourcutCompose", () => ({
  describeComposeFailure: (...args: unknown[]) =>
    mockDescribeComposeFailure(...args),
}));

const PENDING = {
  sources: ["a", "b", "c", "d"],
  frameId: "classic-4",
  remoteFrameId: null,
  outputFilter: "NONE",
  displayName: "내 네컷",
  savedAt: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  document.cookie = "harucut_guest_trial=; max-age=0";
  mockSearch = new URLSearchParams();
  useGuestTrialStore.setState({ accessMode: "member", notice: null });
  mockGetPending.mockReturnValue(PENDING);
  mockSaveFourcutToServer.mockResolvedValue({
    mediaId: 1,
    objectUrl: "https://example.com/a.png",
    downloadUrl: "https://example.com/a.png",
    displayName: "내 네컷",
  });
  mockDescribeComposeFailure.mockReturnValue({
    message: "이미지를 준비하지 못했어요.",
    retryable: true,
  });
});

describe("GuestTrialBridge 비회원 결과 이관", () => {
  // 예전에는 resumeSave 쿼리가 있어야만 돌았다. 그 주소는 우리가 만든 로그인 링크
  // 하나에서만 나오므로, OAuth 재로그인이나 앱 재실행으로 들어오면 보관물이 방치됐다.
  it("resumeSave 쿼리가 없어도 회원이 되면 보관물을 저장한다", async () => {
    render(<GuestTrialBridge />);

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });

    // 보관해 둔 이름을 그대로 쓴다(사용자가 결과 화면에서 고친 이름일 수 있다).
    expect(mockSaveFourcutToServer.mock.calls[0][0].displayName).toBe("내 네컷");
    expect(mockClearPending).toHaveBeenCalled();
  });

  it("비회원 상태에서는 아무것도 하지 않는다", async () => {
    // 이 컴포넌트는 마운트할 때 쿠키로 접근 모드를 다시 확정한다(hydrateGuestMode).
    // 스토어만 바꿔 두면 그 자리에서 member 로 덮인다.
    document.cookie = "harucut_guest_trial=1";
    useGuestTrialStore.setState({ accessMode: "guest" });

    render(<GuestTrialBridge />);

    await waitFor(() => {
      expect(mockSaveFourcutToServer).not.toHaveBeenCalled();
    });
  });

  it("보관물이 없으면 resumeSave 파라미터만 걷어낸다", async () => {
    mockGetPending.mockReturnValue(null);
    mockSearch = new URLSearchParams("resumeSave=1");

    render(<GuestTrialBridge />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/home");
    });
    expect(mockSaveFourcutToServer).not.toHaveBeenCalled();
  });

  // 새로고침할 때마다 원본 4장을 S3 에 다시 올리고 또 실패하는 루프를 막는다.
  it("다시 해도 소용없는 실패면 보관물을 버린다", async () => {
    mockSaveFourcutToServer.mockRejectedValueOnce(new Error("nope"));
    mockDescribeComposeFailure.mockReturnValue({
      message: "고른 프레임을 찾을 수 없어요.",
      retryable: false,
    });

    render(<GuestTrialBridge />);

    await waitFor(() => {
      expect(mockClearPending).toHaveBeenCalled();
    });
    expect(useGuestTrialStore.getState().notice?.message).toContain(
      "고른 프레임을 찾을 수 없어요.",
    );
  });

  it("다시 해 볼 만한 실패면 보관물을 남기고 재시도를 안내한다", async () => {
    mockSaveFourcutToServer.mockRejectedValueOnce(new Error("timeout"));
    mockDescribeComposeFailure.mockReturnValue({
      message: "합성이 예상보다 오래 걸려요.",
      retryable: true,
    });

    render(<GuestTrialBridge />);

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "저장을 완료하지 못했어요",
      );
    });
    expect(mockClearPending).not.toHaveBeenCalled();
    expect(useGuestTrialStore.getState().notice?.message).toContain(
      "새로고침하면 다시 시도",
    );
  });
});
