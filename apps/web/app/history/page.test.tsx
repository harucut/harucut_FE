/**
 * 기록 화면이 실패를 어떻게 말하는가.
 *
 * 다운로드·공유·삭제 실패는 `alert()` 였다. 브라우저 모달은 이 디자인의 것이 아닌 데다
 * 확인을 누르기 전까지 방금 바뀐 화면을 가려서, 마이페이지가 같은 이유로 걷어냈다
 * (app/mypage/page.tsx). 지금은 화면 맨 위 배너가 성공과 실패를 함께 맡는다.
 *
 * 못 박는 것은 두 가지다.
 *  - alert 를 걷어내면서 **실패까지 같이 걷어내지 않았는가.** 실패는 화면 안 문구로 남아야
 *    하고, 삭제 확인 창은 닫혀서 그 문구를 가리지 않아야 한다.
 *  - 실패가 성공처럼 2.4초 만에 지워지지는 않는가. 성공은 결과가 화면에 이미 보이지만,
 *    실패는 읽을 시간이 필요하고 대개 다시 시도해야 한다.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import HistoryPage from "@/app/history/page";

const mockListMyMedia = jest.fn();
const mockDeleteMedia = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/history",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/lib/userMediaApi", () => ({
  listMyMedia: (...args: unknown[]) => mockListMyMedia(...args),
  deleteMedia: (...args: unknown[]) => mockDeleteMedia(...args),
  getMediaDownloadUrl: jest.fn(),
  updateMediaDisplayName: jest.fn(),
}));

jest.mock("@/lib/userApi", () => ({
  getMyUserInfo: jest.fn(async () => ({ planTier: "BASIC" })),
}));

jest.mock("@/lib/presignedUploadApi", () => ({
  getImageUrlByKey: jest.fn(async () => null),
}));

// 화면 껍데기는 이 테스트가 보는 것과 무관하고, 각자 라우팅·세션을 따로 건드린다.
jest.mock("@/components/layout/AppNav", () => ({ AppNav: () => null }));
jest.mock("@/components/layout/MobileTabBar", () => ({
  MobileTabBar: () => null,
}));

const ITEM = {
  mediaId: 7,
  s3Key: "media/7.png",
  displayName: "바다에서",
  createdAt: "2026-08-14T18:00:00",
};

/** 배너 자동 소멸 시간(page.tsx)보다 넉넉히 넘긴다. */
const PAST_AUTO_DISMISS_MS = 4000;

/** 목록이 그려질 때까지 기다린다. 조회는 타이머가 아니라 프라미스로 끝난다. */
async function renderHistory() {
  render(<HistoryPage />);
  await act(async () => {});
  return screen.getByRole("button", { name: "삭제: 바다에서" });
}

/** 삭제 버튼 → 확인 창 → "지우기" 까지. */
async function confirmDelete() {
  const deleteButton = await renderHistory();
  fireEvent.click(deleteButton);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockListMyMedia.mockResolvedValue([ITEM]);
  // 실패 경로는 console.error 로 원인을 남긴다. 테스트 출력까지 더럽힐 이유는 없다.
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("기록 화면의 실패 알림", () => {
  it("삭제에 실패하면 확인 창을 닫고 사유를 화면에 남긴다", async () => {
    mockDeleteMedia.mockRejectedValue(new Error("boom"));

    await confirmDelete();

    // 확인 창이 남아 있으면 배너를 가린다.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("사진을 지우지 못했어요.")).toBeInTheDocument();
    // 지우지 못했으니 목록에도 그대로 있어야 한다.
    expect(
      screen.getByRole("button", { name: "삭제: 바다에서" }),
    ).toBeInTheDocument();
  });

  it("실패 문구는 시간이 지나도 지워지지 않는다", async () => {
    mockDeleteMedia.mockRejectedValue(new Error("boom"));

    await confirmDelete();

    await act(async () => {
      jest.advanceTimersByTime(PAST_AUTO_DISMISS_MS);
    });

    expect(screen.getByText("사진을 지우지 못했어요.")).toBeInTheDocument();
  });

  it("성공 문구는 잠깐 떴다 사라진다", async () => {
    mockDeleteMedia.mockResolvedValue(undefined);

    await confirmDelete();
    expect(screen.getByText("사진을 지웠어요.")).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(PAST_AUTO_DISMISS_MS);
    });

    expect(screen.queryByText("사진을 지웠어요.")).not.toBeInTheDocument();
  });
});
