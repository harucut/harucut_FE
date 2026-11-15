import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShootPage from "@/app/shoot/page";
import { GUEST_TRIAL_COOKIE } from "@/lib/guestTrialShared";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { useShootSession } from "@/lib/shootSessionStore";
import type { FrameId } from "@/constants/frames";

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockQuery = "";
let mockChosenFrameId: FrameId = "grid-4";
let mockChosenRemoteFrameId: number | null = null;
const mockCheckSavedFrame = jest.fn();

jest.mock("@/lib/savedFrameCheck", () => ({
  checkSavedFrame: (...args: unknown[]) => mockCheckSavedFrame(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(mockQuery),
}));

const mockResolveMembership = jest.fn();
const mockMarkUploadEntryChecked = jest.fn();

// 회원 여부 판정만 갈아 끼운다 — 스토어와 쿠키는 실제 구현을 그대로 태운다.
jest.mock("@/lib/authSession", () => ({
  resolveMembership: (...args: unknown[]) => mockResolveMembership(...args),
  markUploadEntryChecked: () => mockMarkUploadEntryChecked(),
}));

jest.mock("@/hooks/useMyFrames", () => ({
  useMyFrames: () => ({ frames: [], isLoading: false, error: null, refresh: jest.fn() }),
}));

// 고르는 UI 는 FrameChooser 의 몫이라 확인 버튼만 남긴다. children 은 그대로 그린다 —
// 행사 배너가 거기로 들어가므로, 걷어내면 배너를 볼 수 없다.
jest.mock("@/components/frame/FrameChooser", () => ({
  FrameChooser: ({
    onConfirm,
    children,
    confirmNotice,
    confirmBusy,
    onSelectionChange,
  }: {
    onConfirm: (choice: { frameId: FrameId; remoteFrameId: number | null }) => void;
    children?: React.ReactNode;
    confirmNotice?: string | null;
    confirmBusy?: boolean;
    onSelectionChange?: () => void;
  }) => (
    <div>
      {children}
      {confirmNotice ? <p role="alert">{confirmNotice}</p> : null}
      <button type="button" onClick={() => onSelectionChange?.()}>
        다른 프레임
      </button>
      <button
        type="button"
        disabled={confirmBusy}
        onClick={() => onConfirm({ frameId: mockChosenFrameId, remoteFrameId: mockChosenRemoteFrameId })}
      >
        확인
      </button>
    </div>
  ),
}));

const SHOTS = ["data:1", "data:2", "data:3", "data:4"];

/** 결과 화면이 `keepShots=1` 로 돌려보낸 상태 — 사진을 들고 프레임 화면에 선다. */
function renderWithKeptShots(source: "camera" | "upload") {
  mockQuery = source === "upload" ? "source=upload&keepShots=1" : "keepShots=1";
  useShootSession.setState({
    shots: SHOTS,
    shotsFrameId: "classic-4",
    source,
  });
  render(<ShootPage />);
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
}

describe("프레임을 다시 고를 때 들고 온 사진", () => {
  beforeEach(() => {
    mockPush.mockClear();
    // 기본은 비율이 크게 다른 짝(classic-4 1.42 → grid-4 0.71).
    mockChosenFrameId = "grid-4";
    useShootSession.getState().reset();
  });

  /*
    갤러리 사진은 원본 비율 그대로 담긴다(lib/photoImport.ts). 자르기는 미리보기·합성이
    새 프레임 기준으로 하므로 비율이 달라도 그대로 쓸 수 있다 — 예전에는 여기서
    비율만 보고 지워, 28장을 고른 사람이 다시 고르러 가야 했다.
  */
  it("업로드 사진은 슬롯 비율이 달라져도 남는다", () => {
    renderWithKeptShots("upload");
    expect(useShootSession.getState().shots).toEqual(SHOTS);
    expect(mockPush).toHaveBeenCalledWith("/shoot/select");
  });

  it("사진 비율이 바뀌어도 확인 전에는 촬영본을 지우지 않는다", () => {
    renderWithKeptShots("camera");
    expect(useShootSession.getState().shots).toEqual(SHOTS);
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "사진 지우고 다시 찍기" }));
    expect(useShootSession.getState().shots).toEqual([]);
    expect(mockPush).toHaveBeenCalledWith("/shoot/capture");
  });

  it("촬영본도 슬롯 비율이 같으면 그대로 쓴다", () => {
    // classic-4(1.42) → wide-4(1.41).
    mockChosenFrameId = "wide-4";
    renderWithKeptShots("camera");
    expect(useShootSession.getState().shots).toEqual(SHOTS);
    expect(mockPush).toHaveBeenCalledWith("/shoot/select");
  });
});

/** 한 SPA 세션 안에서 `/shoot` 에 다시 서는 것 — 스토어는 모듈 수준이라 그대로 남는다. */
function enterShoot(query: string) {
  mockQuery = query;
  return render(<ShootPage />);
}

/*
  옛 행사 QR 주소(`/shoot?event=…`)는 걷어냈다. 행사는 `/e/{slug}` 로 옮겼고, 배포한 QR 이
  없어서 호환하지 않는다(기획 R3·R4 검수 D01). 남은 주소로 와도 평범한 새 촬영이다.
*/
describe("옛 행사 쿼리", () => {
  beforeEach(() => {
    mockPush.mockClear();
    useShootSession.getState().reset();
  });

  it("event 쿼리가 있어도 행사 배너를 띄우지 않는다", () => {
    enterShoot(`frame=classic-4&event=${encodeURIComponent("여름 팬미팅")}`);
    expect(screen.queryByText("여름 팬미팅")).not.toBeInTheDocument();
  });
});

/*
  ── 갤러리 불러오기로 보낼 때는 고른 프레임을 주소에 싣는다 ──

  그 경로는 회원 전용이라 게스트 쿠키가 이미 있으면 **화면이 마운트되기 전에** 프록시가
  막는다. 프록시는 세션을 못 보므로, 되돌릴 주소에 넣을 것이 요청에 실려 있지 않으면
  고른 프레임이 사라진다 — `/shoot` 은 쿼리 없는 진입을 새 촬영으로 보고 세션을 비운다.

  업로드 화면 자체는 이 쿼리를 읽지 않는다(세션에서 같은 값을 꺼낸다). 싣는 이유는
  **프록시가 되돌릴 때 잃지 않기 위해서**다.
*/
describe("갤러리 불러오기로 보내는 주소", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useShootSession.setState({ shots: [], shotsFrameId: null });
    useGuestTrialStore.setState({ accessMode: "member", hydrated: true });
    mockResolveMembership.mockResolvedValue("member");
  });

  // 옛 event 쿼리가 남아 있어도 옮기지 않는다 — 되돌아갈 때 고른 프레임만 지킨다.
  it("프레임만 실어 보낸다", async () => {
    mockQuery = "source=upload&event=hongdae-2026";
    mockChosenFrameId = "classic-4";

    render(<ShootPage />);
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/shoot/upload?frame=classic-4"));
  });

  // 반대쪽 못 — 촬영 경로는 예전 주소 그대로다(프록시가 막는 경로가 아니다). 회원인지 묻지도 않는다.
  it("촬영으로 갈 때는 주소를 건드리지 않는다", async () => {
    mockQuery = "";
    mockChosenFrameId = "grid-4";

    render(<ShootPage />);
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/shoot/capture"));
    expect(mockResolveMembership).not.toHaveBeenCalled();
  });
});

/*
  ── 사진 불러오기는 들어가기 **전에** 막는다(2026-11-15) ──

  「회원인지 확인을 못 했으면 업로드 페이지에 들여보내는 게 아니라 모달로 안내를 하든 해야지? 로그인이 된 상태면
  그러면 안 되는 거고」 「들어오기 전에 막는 게 맞는 거 같은데」. 예전에는 불러오기 화면에 먼저 들여보내고 그 안에서
  물었다. 지금은 「사진 고르러 가기」를 누를 때 묻고, 회원이 아니면 이 화면에서 회원 전용 안내 창을 띄운다.
*/
describe("사진 불러오기에 들어가기 전 회원 확인", () => {
  const RESTRICTED = "/shoot?guestNotice=restricted&frame=classic-4";

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = "source=upload";
    mockChosenFrameId = "classic-4";
    useShootSession.getState().reset();
    useGuestTrialStore.setState({ accessMode: "member", hydrated: true });
    document.cookie = `${GUEST_TRIAL_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  });
  // 들고 온 사진·체험 상태를 다음 describe 로 넘기지 않는다.
  afterEach(() => {
    useShootSession.getState().reset();
    useGuestTrialStore.setState({ accessMode: "member", hydrated: true });
    mockQuery = "";
  });

  function pressConfirm() {
    render(<ShootPage />);
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
  }

  it("회원이면 들여보내고, 불러오기 화면이 다시 묻지 않게 적어 둔다", async () => {
    mockResolveMembership.mockResolvedValue("member");
    pressConfirm();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/shoot/upload?frame=classic-4"));
    expect(mockMarkUploadEntryChecked).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("확인하는 동안은 단추가 잠긴다", async () => {
    let answer!: (value: string) => void;
    mockResolveMembership.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    pressConfirm();

    expect(screen.getByRole("button", { name: "확인" })).toBeDisabled();
    await act(async () => answer("member"));
    expect(mockPush).toHaveBeenCalledWith("/shoot/upload?frame=classic-4");
  });

  // 세션이 끊긴 회원 — 들여보내지 않고 이 자리에서 안내 창. 카메라 쪽 프레임 고르기로 바꾸고 고른 프레임은 둔다.
  it("비회원으로 확인되면 들여보내지 않고 체험으로 돌려 안내 창을 띄운다", async () => {
    mockResolveMembership.mockResolvedValue("guest");
    pressConfirm();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(RESTRICTED));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useGuestTrialStore.getState().accessMode).toBe("guest");
    expect(mockMarkUploadEntryChecked).not.toHaveBeenCalled();
  });

  // 서버가 못 답해도 로그인해 있으면 막지 않는다 — 「확인하지 못했어요」는 로그인한 사람에게 할 말이 아니다.
  it("판정할 수 없어도 로그인해 있으면 들여보낸다", async () => {
    mockResolveMembership.mockResolvedValue("unknown");
    pressConfirm();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/shoot/upload?frame=classic-4"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(useGuestTrialStore.getState().accessMode).toBe("member");
  });

  it("판정할 수 없고 체험 중이면 안내 창이다", async () => {
    useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });
    mockResolveMembership.mockResolvedValue("unknown");
    pressConfirm();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(RESTRICTED));
    expect(mockPush).not.toHaveBeenCalled();
  });

  // 체험 쿠키는 남았는데 세션은 멀쩡한 회원 — 쿠키만 보고 막으면 쿠키가 만료될 때까지 회원 기능을 잃는다.
  it("낡은 체험 쿠키를 든 회원은 쿠키를 걷고 들여보낸다", async () => {
    useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });
    mockResolveMembership.mockResolvedValue("member");
    pressConfirm();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/shoot/upload?frame=classic-4"));
    expect(useGuestTrialStore.getState().accessMode).toBe("member");
  });

  // 들고 온 갤러리 사진이 있으면 불러오기 화면을 지나지 않는다 — 묻지 않고 고르기로 간다.
  it("들고 온 사진이 있으면 묻지 않는다", () => {
    renderWithKeptShots("upload");

    expect(mockPush).toHaveBeenCalledWith("/shoot/select");
    expect(mockResolveMembership).not.toHaveBeenCalled();
  });
});

/*
  ── 회원 후보 진입(`checkSession=1`): 게스트 전환은 **여기서** 판정한다 ──

  랜딩의 「가입 없이 체험하기」(`/shoot/start`)는 인증 쿠키가 남은 방문자를 체험 쿠키 없이
  `/shoot?checkSession=1` 로 보낸다. 그 쿠키가 살아 있는지는 미들웨어가 알 수 없다.
  한때 미들웨어가 「살아 있는 access 가 아니면 심는다」로 점쳤는데, access 만 자연 만료되고
  refresh 는 멀쩡한 회원(흔하다)이 7일짜리 체험 쿠키를 받아 기록·커스텀 프레임을 잃었다.

  `isUsableMember()` 는 `clientApi` 로 물어 401 이면 재발급까지 해 본다. 그러니 여기서
  **정말 회원이 아닌 것이 확인된 뒤에만** 체험을 시작한다.
*/
describe("회원 후보 진입의 게스트 전환", () => {
  function resetGuest() {
    document.cookie = `${GUEST_TRIAL_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    useGuestTrialStore.setState({
      accessMode: "member",
      hydrated: true,
      notice: null,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    resetGuest();
  });

  afterEach(() => {
    resetGuest();
  });

  it("회원이 아닌 것이 확인되면 체험을 시작한다", async () => {
    mockQuery = "frame=classic-4&checkSession=1";
    mockResolveMembership.mockResolvedValue("guest");

    render(<ShootPage />);

    await waitFor(() => {
      expect(useGuestTrialStore.getState().accessMode).toBe("guest");
    });
  });

  /*
    반대쪽 못 — **회원이면 덮지 않는다.** 이 못이 없으면 "이 진입이면 무조건 게스트"로
    고쳐도 위 테스트가 통과하고, 그러면 미들웨어에서 옮겨 온 그 결함이 화면 쪽에서 되살아난다.
  */
  it("회원으로 확인되면 아무것도 심지 않는다", async () => {
    mockQuery = "frame=classic-4&checkSession=1";
    mockResolveMembership.mockResolvedValue("member");

    render(<ShootPage />);

    await act(async () => {});
    expect(useGuestTrialStore.getState().accessMode).toBe("member");
    expect(document.cookie).not.toContain(`${GUEST_TRIAL_COOKIE}=1`);
  });

  /*
    회귀 — **판정 중에 화면을 떠나도 전환은 끝까지 간다.**

    판정은 왕복 하나만큼 걸리고, 그 사이 사용자는 기본 프레임으로 「확인」을 눌러 다음
    화면으로 갈 수 있다. 한때 cleanup 의 `cancelled` 가 그때 전환을 버렸는데, 그러면 죽은
    인증 쿠키를 든 방문자가 게스트 자격 없이 촬영을 계속하다 인증 API 에서 막힌다 —
    다음 경로도 남은 쿠키로 프록시를 통과하므로 아무도 그것을 잡지 못한다.
  */
  it("판정 중에 화면을 떠나도 체험 전환은 끝까지 간다", async () => {
    mockQuery = "frame=classic-4&checkSession=1";
    let answer: (value: string) => void = () => {};
    mockResolveMembership.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    const view = render(<ShootPage />);
    // 아직 답이 오기 전에 확인을 눌러 다음 화면으로 간다.
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    view.unmount();

    await act(async () => {
      answer("guest");
    });

    // 고치기 전에는 여기서 member 인 채 남아, 다음 화면이 게스트 자격 없이 돌았다.
    expect(useGuestTrialStore.getState().accessMode).toBe("guest");
  });

  /*
    회귀 — **못 물어본 것은 비회원이 아니다.**

    `/api/auth/status` 가 잠깐 5xx 이거나 재발급 서버만 못 답하면 판정이 `unknown` 으로 온다.
    그때 게스트로 전환하면 멀쩡한 회원이 7일 동안 기록과 저장 프레임을 잃는다 — 서버가
    잠깐 못 답했다는 이유로 그렇게 되면 안 된다. 그 사람은 회원 화면 그대로 남고, 서버가
    돌아오면 다음 진입에서 판정된다.
  */
  it("판정할 수 없으면 게스트로 전환하지 않는다", async () => {
    mockQuery = "frame=classic-4&checkSession=1";
    mockResolveMembership.mockResolvedValue("unknown");

    render(<ShootPage />);

    await act(async () => {});
    expect(useGuestTrialStore.getState().accessMode).toBe("member");
    expect(document.cookie).not.toContain(`${GUEST_TRIAL_COOKIE}=1`);
  });

  // 이 진입이 아니면 묻지도 않는다 — 촬영 화면을 열 때마다 인증 왕복이 붙으면 안 된다.
  // 옛 event 쿼리도 더는 묻는 이유가 아니다.
  it.each(["frame=classic-4", "frame=classic-4&event=hongdae-2026"])("%s 로 열면 회원 여부를 묻지 않는다", async (query) => {
    mockQuery = query;
    mockResolveMembership.mockResolvedValue("guest");

    render(<ShootPage />);

    await act(async () => {});
    expect(mockResolveMembership).not.toHaveBeenCalled();
    expect(useGuestTrialStore.getState().accessMode).toBe("member");
  });

  it("이미 체험 중이면 이 진입에서도 인증 API를 부르지 않는다", async () => {
    mockQuery = "frame=classic-4&checkSession=1";
    useGuestTrialStore.getState().enterGuestMode();
    render(<ShootPage />);
    await act(async () => {});
    expect(mockResolveMembership).not.toHaveBeenCalled();
    expect(useGuestTrialStore.getState().accessMode).toBe("guest");
    expect(document.cookie).toContain(`${GUEST_TRIAL_COOKIE}=1`);
  });
});

describe("기존 촬영 복구", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockQuery = "";
    useShootSession.getState().reset();
    useShootSession.setState({ frameId: "classic-4", shotsFrameId: "classic-4", shots: SHOTS });
  });
  it("다시 들어오면 사진을 지우지 않고 이어 만들기를 안내한다", () => {
    render(<ShootPage />);
    expect(useShootSession.getState().shots).toEqual(SHOTS);
    fireEvent.click(screen.getByRole("button", { name: "이어서 만들기" }));
    expect(mockPush).toHaveBeenCalledWith("/shoot/select");
  });
  // 완성본이 나온 촬영은 끝났다(2026-11-15) — 이어 만들면 같은 사진을 다시 고르게 된다.
  it("기록에 남은 완성 사진은 이어 만들지 않고 새 촬영으로 시작한다", () => {
    useShootSession.setState({ completed: "account" });
    render(<ShootPage />);
    expect(screen.queryByRole("button", { name: "이어서 만들기" })).toBeNull();
    expect(useShootSession.getState().shots).toEqual([]);
    expect(useShootSession.getState().completed).toBeNull();
  });
  it("기록에 남은 완성 사진은 keepShots 로 와도 사진을 들고 가지 않는다", () => {
    mockQuery = "keepShots=1";
    useShootSession.setState({ completed: "account" });
    render(<ShootPage />);
    expect(useShootSession.getState().shots).toEqual([]);
  });
  // 「비회원은 … 로컬에서만 돌리는거니깐 로컬에 저장되도록」(2026-11-15). 이 기기에만 있는 사진은 지우면 사라진다.
  it("이 기기에만 있는 완성 사진은 남겨 두고 그 완성 화면을 다시 연다", () => {
    useShootSession.setState({ completed: "device" });
    render(<ShootPage />);
    expect(screen.getByRole("heading", { name: "완성한 사진이 있어요" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이어서 만들기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "사진 보기" }));
    expect(mockPush).toHaveBeenCalledWith("/shoot/result");
    expect(useShootSession.getState().shots).toEqual(SHOTS);
  });
  it("이 기기에만 있는 완성 사진도 지우겠다고 확인하면 새 촬영으로 시작한다", () => {
    mockQuery = "keepShots=1";
    useShootSession.setState({ completed: "device" });
    render(<ShootPage />);
    fireEvent.click(screen.getByRole("button", { name: "새로 시작하기" }));
    expect(screen.getByText("완성한 사진이 이 기기에서 지워져요.")).toBeInTheDocument();
    expect(useShootSession.getState().shots).toEqual(SHOTS);
    fireEvent.click(screen.getByRole("button", { name: "사진 지우고 시작" }));
    expect(useShootSession.getState().shots).toEqual([]);
    expect(useShootSession.getState().completed).toBeNull();
  });
  it("새 촬영은 삭제를 확인한 뒤에만 사진을 비운다", () => {
    render(<ShootPage />);
    fireEvent.click(screen.getByRole("button", { name: "새로 시작하기" }));
    expect(useShootSession.getState().shots).toEqual(SHOTS);
    fireEvent.click(screen.getByRole("button", { name: "사진 지우고 시작" }));
    expect(useShootSession.getState().shots).toEqual([]);
  });
});

/*
  저장한 프레임은 찍기 전에 쓸 수 있는지 본다(2026-11-15 「프레임에 문제가 있던 거면 촬영 전에부터 말해주는 게
  맞지 않을까?」). 문제가 있으면 이 화면에 두고 까닭을 말한다 — 다 찍고 나서 알게 하지 않는다.
*/
describe("저장한 프레임의 촬영 전 확인", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockCheckSavedFrame.mockReset();
    mockQuery = "";
    mockChosenFrameId = "classic-4";
    mockChosenRemoteFrameId = 7;
    useShootSession.getState().reset();
  });
  afterAll(() => {
    mockChosenRemoteFrameId = null;
  });

  it("문제가 있으면 찍으러 가지 않고 까닭을 말한다", async () => {
    mockCheckSavedFrame.mockResolvedValue("프레임 그림을 불러오지 못했어요. 다시 누르거나 다른 프레임을 골라 주세요.");
    render(<ShootPage />);
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("프레임 그림을 불러오지 못했어요.");
    expect(mockCheckSavedFrame).toHaveBeenCalledWith(7);
    expect(mockPush).not.toHaveBeenCalled();

    // 다른 프레임을 고르면 안내를 거둔다.
    fireEvent.click(screen.getByRole("button", { name: "다른 프레임" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("문제가 없으면 그대로 찍으러 간다", async () => {
    mockCheckSavedFrame.mockResolvedValue(null);
    render(<ShootPage />);
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/shoot/capture"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("기본 레이아웃은 확인하지 않는다", async () => {
    mockChosenRemoteFrameId = null;
    render(<ShootPage />);
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/shoot/capture"));
    expect(mockCheckSavedFrame).not.toHaveBeenCalled();
  });
});
