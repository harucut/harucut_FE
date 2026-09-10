import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShootPage from "@/app/shoot/page";
import { GUEST_TRIAL_COOKIE } from "@/lib/guestTrialShared";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { useShootSession } from "@/lib/shootSessionStore";
import type { FrameId } from "@/constants/frames";

const mockPush = jest.fn();
let mockQuery = "";
let mockChosenFrameId: FrameId = "grid-4";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(mockQuery),
}));

const mockResolveMembership = jest.fn();

// 회원 여부 판정만 갈아 끼운다 — 스토어와 쿠키는 실제 구현을 그대로 태운다.
jest.mock("@/lib/authSession", () => ({
  resolveMembership: (...args: unknown[]) => mockResolveMembership(...args),
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
  }: {
    onConfirm: (choice: { frameId: FrameId; remoteFrameId: number | null }) => void;
    children?: React.ReactNode;
  }) => (
    <div>
      {children}
      <button
        type="button"
        onClick={() => onConfirm({ frameId: mockChosenFrameId, remoteFrameId: null })}
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

  it("촬영본은 슬롯 비율이 달라지면 비우고 다시 촬영으로 보낸다", () => {
    renderWithKeptShots("camera");
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

const EVENT_NAME = "여름 팬미팅";

/** 한 SPA 세션 안에서 `/shoot` 에 다시 서는 것 — 스토어는 모듈 수준이라 그대로 남는다. */
function enterShoot(query: string) {
  mockQuery = query;
  return render(<ShootPage />);
}

describe("행사 이름", () => {
  beforeEach(() => {
    mockPush.mockClear();
    useShootSession.getState().reset();
  });

  it("행사 쿼리로 들어오면 배너에 행사 이름이 뜬다", () => {
    enterShoot(`frame=classic-4&event=${encodeURIComponent(EVENT_NAME)}`);
    expect(useShootSession.getState().eventName).toBe(EVENT_NAME);
    expect(screen.getByText(EVENT_NAME)).toBeInTheDocument();
  });

  /*
    결과 화면이 "다른 프레임으로" 로 돌려보내는 길에는 행사 쿼리가 없다(result/page.tsx).
    같은 촬영을 이어 가는 것이므로 행사 맥락은 남아야 한다.
  */
  it("keepShots=1 로 이어 가면 행사 이름을 물려받는다", () => {
    enterShoot(`frame=classic-4&event=${encodeURIComponent(EVENT_NAME)}`).unmount();

    enterShoot("keepShots=1");

    expect(useShootSession.getState().eventName).toBe(EVENT_NAME);
    expect(screen.getByText(EVENT_NAME)).toBeInTheDocument();
  });

  /*
    행사 촬영을 마친 브라우저로 일반 `/shoot` 에 다시 들어오는 경우. 이어 가겠다는 표시가
    없으므로 새 촬영이고, 지난 행사의 배너가 따라붙으면 안 된다.
  */
  it("쿼리 없는 새 진입은 이전 행사 이름을 지운다", () => {
    enterShoot(`frame=classic-4&event=${encodeURIComponent(EVENT_NAME)}`).unmount();

    enterShoot("");

    expect(useShootSession.getState().eventName).toBeNull();
    expect(screen.queryByText(EVENT_NAME)).not.toBeInTheDocument();
  });
});

/*
  ── 갤러리 불러오기로 보낼 때는 행사 상태를 주소에 싣는다 ──

  그 경로는 회원 전용이라 게스트 쿠키가 이미 있으면 **화면이 마운트되기 전에** 프록시가
  막는다. 프록시는 세션을 못 보므로, 되돌릴 주소에 넣을 것이 요청에 실려 있지 않으면
  행사 배너와 QR 이 지정한 프레임이 그대로 사라진다 — `/shoot` 은 쿼리 없는 진입을
  새 촬영으로 보고 세션을 비운다.

  업로드 화면 자체는 이 쿼리를 읽지 않는다(세션에서 같은 값을 꺼낸다). 싣는 이유는
  **프록시가 되돌릴 때 잃지 않기 위해서**다.
*/
describe("갤러리 불러오기로 보내는 주소", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useShootSession.setState({ shots: [], shotsFrameId: null });
  });

  it("행사 진입이면 프레임과 행사 이름을 실어 보낸다", () => {
    mockQuery = "source=upload&event=hongdae-2026";
    mockChosenFrameId = "grid-4";

    render(<ShootPage />);
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(mockPush).toHaveBeenCalledWith(
      "/shoot/upload?frame=grid-4&event=hongdae-2026",
    );
  });

  // 행사가 아니어도 프레임은 싣는다 — 되돌아갈 때 고른 프레임을 잃지 않는다.
  it("행사가 아니면 프레임만 실어 보낸다", () => {
    mockQuery = "source=upload";
    mockChosenFrameId = "classic-4";

    render(<ShootPage />);
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(mockPush).toHaveBeenCalledWith("/shoot/upload?frame=classic-4");
  });

  // 반대쪽 못 — 촬영 경로는 예전 주소 그대로다(프록시가 막는 경로가 아니다).
  it("촬영으로 갈 때는 주소를 건드리지 않는다", () => {
    mockQuery = "event=hongdae-2026";
    mockChosenFrameId = "grid-4";

    render(<ShootPage />);
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(mockPush).toHaveBeenCalledWith("/shoot/capture");
  });
});

/*
  ── 행사 QR 진입: 게스트 전환은 **여기서** 판정한다 ──

  프록시는 쿠키가 아예 없는 방문자에게만 체험 쿠키를 심는다. 쿠키가 남아 있는 브라우저는
  그냥 통과해 이 화면까지 오고, 그 쿠키가 살아 있는지는 미들웨어가 알 수 없다.
  한때 미들웨어가 「살아 있는 access 가 아니면 심는다」로 점쳤는데, access 만 자연 만료되고
  refresh 는 멀쩡한 회원(흔하다)이 7일짜리 체험 쿠키를 받아 기록·커스텀 프레임을 잃었다.

  `isUsableMember()` 는 `clientApi` 로 물어 401 이면 재발급까지 해 본다. 그러니 여기서
  **정말 회원이 아닌 것이 확인된 뒤에만** 체험을 시작한다.
*/
describe("행사 QR 진입의 게스트 전환", () => {
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
    mockQuery = "frame=classic-4&event=hongdae-2026";
    mockResolveMembership.mockResolvedValue("guest");

    render(<ShootPage />);

    await waitFor(() => {
      expect(useGuestTrialStore.getState().accessMode).toBe("guest");
    });
  });

  /*
    반대쪽 못 — **회원이면 덮지 않는다.** 이 못이 없으면 "행사 진입이면 무조건 게스트"로
    고쳐도 위 테스트가 통과하고, 그러면 미들웨어에서 옮겨 온 그 결함이 화면 쪽에서 되살아난다.
  */
  it("회원으로 확인되면 아무것도 심지 않는다", async () => {
    mockQuery = "frame=classic-4&event=hongdae-2026";
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
    인증 쿠키를 든 행사 참가자가 게스트 자격 없이 촬영을 계속하다 인증 API 에서 막힌다 —
    다음 경로도 남은 쿠키로 프록시를 통과하므로 아무도 그것을 잡지 못한다.
  */
  it("판정 중에 화면을 떠나도 체험 전환은 끝까지 간다", async () => {
    mockQuery = "frame=classic-4&event=hongdae-2026";
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
    mockQuery = "frame=classic-4&event=hongdae-2026";
    mockResolveMembership.mockResolvedValue("unknown");

    render(<ShootPage />);

    await act(async () => {});
    expect(useGuestTrialStore.getState().accessMode).toBe("member");
    expect(document.cookie).not.toContain(`${GUEST_TRIAL_COOKIE}=1`);
  });

  // 행사 진입이 아니면 묻지도 않는다 — 촬영 화면을 열 때마다 인증 왕복이 붙으면 안 된다.
  it("행사 진입이 아니면 회원 여부를 묻지 않는다", async () => {
    mockQuery = "frame=classic-4";
    mockResolveMembership.mockResolvedValue("guest");

    render(<ShootPage />);

    await act(async () => {});
    expect(mockResolveMembership).not.toHaveBeenCalled();
    expect(useGuestTrialStore.getState().accessMode).toBe("member");
  });

  // 이미 게스트면 답이 정해져 있다 — 쿠키가 없어 프록시가 심어 준 경우다.
  it("이미 체험 중이면 다시 묻지 않는다", async () => {
    mockQuery = "frame=classic-4&event=hongdae-2026";
    useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });

    render(<ShootPage />);

    await act(async () => {});
    expect(mockResolveMembership).not.toHaveBeenCalled();
  });
});
