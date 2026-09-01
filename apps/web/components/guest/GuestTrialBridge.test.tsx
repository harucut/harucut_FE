/**
 * 비회원 결과 이관의 **후반부** — 로그인 뒤 보관물을 꺼내 서버 합성을 돌리는 쪽.
 *
 * 이쪽은 그동안 테스트가 하나도 없었다. 앞쪽(보관하기)만 덮여 있어서, 꺼내는 조건이나
 * 실패 처리가 잘못돼도 아무도 몰랐다 — 실제로 네 가지가 틀려 있었다.
 *  1. `?resumeSave=1` 주소를 타야만 돌아서, 다른 경로로 로그인하면 영영 저장되지 않았다
 *  2. 영구 실패에도 "새로고침하면 다시 시도해요"라 안내해 무한 재업로드가 됐다
 *  3. **게스트 쿠키가 없다는 것만으로 로그인했다고 보고** 서버 합성을 불렀다(401 거짓 실패)
 *  4. **확인 없이** 계정에 저장해, 공용 기기에서 앞사람 네컷이 뒷사람 기록으로 넘어갔다
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  backgroundColor: "#ffffff",
  savedAt: 0,
};

/** 로그인 여부는 쿠키가 아니라 `/api/auth/session` 응답이 정한다. */
function setSession(authenticated: boolean) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ authenticated }),
  }) as unknown as typeof fetch;
}

/** 확인 안내에서 버튼 하나를 누른다. */
function pressNoticeAction(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

beforeEach(() => {
  jest.clearAllMocks();
  document.cookie = "harucut_guest_trial=; max-age=0";
  mockSearch = new URLSearchParams();
  // hydrated 는 false 에서 시작한다 — 실제 앱과 같다. 컴포넌트가 마운트되며 쿠키를 읽는다.
  useGuestTrialStore.setState({
    accessMode: "member",
    hydrated: false,
    notice: null,
  });
  mockGetPending.mockReturnValue(PENDING);
  setSession(true);
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
  /*
    보관물에는 소유자 표식이 없고 24시간을 산다. 확인 없이 자동 저장하면 공용 기기에서
    앞사람이 만든 네컷이 뒷사람 계정 기록으로 넘어간다. 그래서 묻고 나서 올린다.

    (예전에는 resumeSave 쿼리가 있어야만 돌았다. 그 주소는 우리가 만든 로그인 링크
     하나에서만 나오므로, OAuth 재로그인이나 앱 재실행으로 들어오면 보관물이 방치됐다.
     쿼리 없이도 발견하는 것은 그대로 두고, 저장 여부만 사용자가 정한다.)
  */
  it("resumeSave 쿼리가 없어도 보관물을 발견하고, 저장할지 먼저 묻는다", async () => {
    render(<GuestTrialBridge />);

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "비회원 때 만든 네컷이 남아 있어요",
      );
    });

    // 묻기만 했을 뿐 아직 아무것도 올리지 않았다.
    expect(mockSaveFourcutToServer).not.toHaveBeenCalled();
    expect(mockClearPending).not.toHaveBeenCalled();
    expect(
      useGuestTrialStore.getState().notice?.actions.map((action) => action.id),
    ).toEqual(["save-guest-handoff", "discard-guest-handoff"]);
  });

  it("저장하기를 고르면 그때 서버 합성을 돌린다", async () => {
    render(<GuestTrialBridge />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("이 계정에 저장하기");

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });

    // 보관해 둔 이름을 그대로 쓴다(사용자가 결과 화면에서 고친 이름일 수 있다).
    expect(mockSaveFourcutToServer.mock.calls[0][0].displayName).toBe("내 네컷");
    // 비회원 때 고른 배경색 그대로 다시 그린다 — 빠지면 서버 기본색으로 저장된다.
    expect(mockSaveFourcutToServer.mock.calls[0][0].backgroundColor).toBe(
      "#ffffff",
    );
    expect(mockClearPending).toHaveBeenCalled();
    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "기록에 저장됐어요",
      );
    });
  });

  it("버리기를 고르면 보관물만 지우고 서버는 부르지 않는다", async () => {
    render(<GuestTrialBridge />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "버리기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("버리기");

    expect(mockClearPending).toHaveBeenCalledTimes(1);
    expect(mockSaveFourcutToServer).not.toHaveBeenCalled();
    expect(useGuestTrialStore.getState().notice).toBeNull();
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
    expect(useGuestTrialStore.getState().notice).toBeNull();
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
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("이 계정에 저장하기");

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
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("이 계정에 저장하기");

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

  /*
    올리는 사이에 세션이 끊긴 것은 "저장 실패"가 아니다. 그렇게 안내하면 사용자는
    멀쩡한 결과물을 잃은 줄 알고, 보관물은 남아 있어 안내만 하루 동안 반복된다.
  */
  it("올리는 도중 401 이면 실패가 아니라 로그인 안내를 띄운다", async () => {
    mockSaveFourcutToServer.mockRejectedValueOnce({ status: 401 });

    render(<GuestTrialBridge />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("이 계정에 저장하기");

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "로그인하면 이어서 저장할게요",
      );
    });
    expect(mockClearPending).not.toHaveBeenCalled();
  });
});

/*
  회귀 — 쿠키를 읽기 전에는 회원이라고 단정하지 않는다.

  스토어의 초깃값이 "member" 라, hydrateGuestMode() 가 반영되기 전 첫 렌더에서는 진짜
  비회원도 회원으로 읽힌다. 비회원이 결과를 내려받아 보관물과 게스트 쿠키가 남은 채
  새로고침하면 바로 그 상황인데, 그때 인증 전용 서버 합성을 부르면 401 이 나고
  화면에는 "저장을 완료하지 못했어요" 라는 엉뚱한 안내가 뜬다.
*/
describe("게스트 쿠키가 남아 있을 때", () => {
  it("보관물이 있어도 서버 합성을 부르지 않는다", async () => {
    document.cookie = "harucut_guest_trial=1";

    render(<GuestTrialBridge />);

    // 쿠키를 읽고 나면 guest 로 확정된다.
    await waitFor(() => {
      expect(useGuestTrialStore.getState().accessMode).toBe("guest");
    });
    expect(useGuestTrialStore.getState().hydrated).toBe(true);
    expect(mockSaveFourcutToServer).not.toHaveBeenCalled();
  });
});

/*
  회귀 — **게스트 쿠키가 없다 ≠ 로그인했다.**

  accessMode 는 프론트가 심는 체험 쿠키 하나만 본다. 로그아웃했거나 세션이 끊긴
  방문자도 전부 "member" 로 읽히므로, 그 값으로 인증 전용 서버 합성을 부르면 401 이 나고
  화면에는 "저장을 완료하지 못했어요" 라는 거짓 실패가 뜬다. 보관물은 남으니 하루 동안
  페이지를 열 때마다 같은 안내가 반복된다(한 번이 아니라 루프다).
*/
describe("게스트 쿠키도 없고 로그인도 아닐 때", () => {
  it("보관물이 있어도 묻지도 올리지도 않는다", async () => {
    setSession(false);

    render(<GuestTrialBridge />);

    await waitFor(() => {
      expect(useGuestTrialStore.getState().hydrated).toBe(true);
    });

    expect(mockSaveFourcutToServer).not.toHaveBeenCalled();
    expect(mockClearPending).not.toHaveBeenCalled();
    expect(useGuestTrialStore.getState().notice).toBeNull();
  });
});
