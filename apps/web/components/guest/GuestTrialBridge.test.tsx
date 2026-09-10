/**
 * 비회원 결과 이관의 **후반부** — 로그인 뒤 보관물을 꺼내 서버 합성을 돌리는 쪽.
 *
 * 이쪽은 그동안 테스트가 하나도 없었다. 앞쪽(보관하기)만 덮여 있어서, 꺼내는 조건이나
 * 실패 처리가 잘못돼도 아무도 몰랐다 — 실제로 다섯 가지가 틀려 있었다.
 *  1. `?resumeSave=1` 주소를 타야만 돌아서, 다른 경로로 로그인하면 영영 저장되지 않았다
 *  2. 영구 실패에도 "새로고침하면 다시 시도해요"라 안내해 무한 재업로드가 됐다
 *  3. **게스트 쿠키가 없다는 것만으로 로그인했다고 보고** 서버 합성을 불렀다(401 거짓 실패)
 *  4. **확인 없이** 계정에 저장해, 공용 기기에서 앞사람 네컷이 뒷사람 기록으로 넘어갔다
 *  5. 물어볼 때 읽은 보관물로 **끝까지 갔다** — 확인 안내를 열어 둔 사이 기한(24시간)이
 *     지나거나 다른 탭이 갈아 끼워도 그대로 올리고, 그대로 지웠다(4번의 TTL 우회)
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GuestTrialBridge } from "@/components/guest/GuestTrialBridge";
import { useGuestTrialStore } from "@/lib/guestTrialStore";

const mockReplace = jest.fn();
const mockSaveFourcutToServer = jest.fn();
const mockGetPending = jest.fn();
const mockClearIfUnchanged = jest.fn();
const mockReadForHandoff = jest.fn();
const mockClearPending = jest.fn();
const mockEnsureComposeKey = jest.fn();
const mockDescribeComposeFailure = jest.fn();

let mockSearch = new URLSearchParams();
// 저장이 끝나기 전에 사용자가 화면을 옮기는 시나리오가 있어서 주소를 고정할 수 없다.
let mockPathname = "/home";
// 진짜 `useRouter()` 는 렌더마다 같은 객체를 준다. 여기서 새로 만들면 라우터를 의존성으로
// 둔 effect 가 매 렌더 다시 돌아, 신호 없이도 판정이 되풀이되는 가짜 통과가 생긴다.
const mockRouter = { replace: (...args: unknown[]) => mockReplace(...args) };

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearch,
}));

jest.mock("@/lib/fourcutProcessing", () => ({
  saveFourcutToServer: (...args: unknown[]) => mockSaveFourcutToServer(...args),
}));

jest.mock("@/lib/pendingGuestSave", () => ({
  getPendingGuestSave: (...args: unknown[]) => mockGetPending(...args),
  // 삭제 판단은 보관소가 한다. 브리지는 지문만 넘기고 셋 중 하나를 받는다.
  clearPendingGuestSaveIfUnchanged: (...args: unknown[]) =>
    mockClearIfUnchanged(...args),
  readPendingGuestSave: (...args: unknown[]) => mockReadForHandoff(...args),
  clearPendingGuestSave: (...args: unknown[]) => mockClearPending(...args),
  ensurePendingGuestSaveComposeKey: (...args: unknown[]) =>
    mockEnsureComposeKey(...args),
}));

const mockResolveMembership = jest.fn();

jest.mock("@/lib/authSession", () => ({
  resolveMembership: (...args: unknown[]) => mockResolveMembership(...args),
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

/**
 * 보관물에 심긴 합성 멱등키. 실제 저장소와 같은 수명을 흉내 낸다 —
 * 한 번 심으면 보관물이 지워질 때까지 같은 값이다.
 */
let storedComposeKey: string | null = null;
let mintedKeyCount = 0;

/**
 * 로그인 여부는 쿠키가 아니라 **`resolveMembership()`** 이 정한다.
 *
 * 생 `/api/auth/session` 이 아닌 이유: 그 라우트는 만료된 access 를 재발급해 주지 않고
 * `authenticated: false` 로 감싸므로, access 만 만료되고 refresh 는 멀쩡한 회원이
 * 비회원으로 읽힌다. `resolveMembership` 은 `clientApi` 를 거쳐 재발급까지 해 본다.
 */
function setSession(membership: "member" | "guest" | "unknown") {
  mockResolveMembership.mockResolvedValue(membership);
}

/** 확인 안내에서 버튼 하나를 누른다. */
function pressNoticeAction(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

/**
 * 서버 합성을 **내가 끝낼 때까지** 붙잡아 둔다.
 *
 * 실제로는 원본 업로드와 합성 폴링에 1분이 넘게 걸린다. 그 사이 화면에 무엇이 보이는지,
 * 그동안 화면을 옮기면 어떻게 되는지가 여기서 확인하려는 것이라 자동 resolve 로는 안 된다.
 */
function holdSave() {
  let finish = () => {};
  mockSaveFourcutToServer.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = () => resolve();
      }),
  );
  return () => finish();
}

/** 대기 중인 보관물 조회·세션 조회가 끝날 때까지 흘려보낸다. */
async function flushAsync() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  document.cookie = "harucut_guest_trial=; max-age=0";
  mockSearch = new URLSearchParams();
  // 주소 정리는 **부를 때의** window.location 을 본다. 목만 세우면 실제 주소와 어긋난다.
  mockPathname = "/home";
  window.history.replaceState({}, "", "/home");
  // hydrated 는 false 에서 시작한다 — 실제 앱과 같다. 컴포넌트가 마운트되며 쿠키를 읽는다.
  useGuestTrialStore.setState({
    accessMode: "member",
    hydrated: false,
    notice: null,
  });
  // 보관소는 IndexedDB 라 **전부 비동기**다(lib/pendingGuestSave.ts). 목도 그렇게 둔다 —
  // 동기 목으로 두면 호출부가 await 를 빠뜨려도 테스트가 초록불이다.
  mockGetPending.mockResolvedValue(PENDING);
  // 조건부 삭제는 「없다」와 「모르겠다」를 가려 본다. 기본은 조회와 같은 답을 준다 —
  // 「모르겠다」는 그것을 시험하는 테스트가 직접 세운다.
  // 인계용 읽기는 삭제 경로에서 쓰이면 안 된다 — 불리면 그 자체가 실패 신호다.
  mockReadForHandoff.mockImplementation(async () => {
    throw new Error("삭제 경로가 인계용 읽기를 불렀다");
  });
  // 보관소가 지문을 대조해 셋 중 하나로 답한다. 실제 구현과 같은 규칙으로 흉내 낸다.
  mockClearIfUnchanged.mockImplementation(async (isSame: (e: unknown) => boolean) => {
    const entry = await mockGetPending();
    if (entry && !isSame(entry)) return "changed";
    await mockClearPending();
    return "cleared";
  });
  storedComposeKey = null;
  mintedKeyCount = 0;
  // 보관에 성공한 기기다. 실패한 기기는 `persisted: false` 로 따로 흉내 낸다 —
  // 아래 「키를 못 남긴 기기」 테스트를 본다.
  //
  // 실물처럼 **저장소를 스스로 한 번 읽어** 그 한 벌에 키를 붙이고 그것을 돌려준다.
  // 미리 잡아 둔 상수를 돌려주면, 이 함수가 읽는 사이에 보관물이 갈아 끼워지는 경우를
  // 테스트가 볼 수 없다 — 그 경우가 바로 아래 「다른 한 벌에 붙은 키」 회귀다.
  mockEnsureComposeKey.mockImplementation(async () => {
    const entry = await mockGetPending();
    if (!entry) return null;
    if (!storedComposeKey) {
      mintedKeyCount += 1;
      storedComposeKey = `web-guest-${mintedKeyCount}`;
    }
    return {
      key: storedComposeKey,
      persisted: true,
      entry: { ...entry, composeIdempotencyKey: storedComposeKey },
    };
  });
  mockClearPending.mockImplementation(async () => {
    storedComposeKey = null;
  });
  setSession("member");
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

  /*
    누르고 나서 최대 1분이 넘게 아무 표시도 없던 자리다. GuestTrialOverlay 는 콜백이 붙은
    버튼을 누르면 안내를 먼저 닫으므로, 진행 중 안내를 **누른 그 자리에서 동기적으로**
    갈아 끼우지 않으면 화면이 빈 채로 남는다.
  */
  it("저장하는 동안 옮기고 있다고 알린다", async () => {
    const finishSave = holdSave();

    render(<GuestTrialBridge />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("이 계정에 저장하기");

    // 누른 직후 — 모달이 닫혔다 열리는 것이 아니라 그 자리에서 바뀐다.
    expect(useGuestTrialStore.getState().notice?.title).toBe(
      "기록에 옮기고 있어요",
    );
    expect(screen.getByText("기록에 옮기고 있어요")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });
    finishSave();
    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "기록에 저장됐어요",
      );
    });
  });

  /*
    회귀 — 올린 그 한 벌만 지운다.

    합성은 1분이 넘기도 한다. 그 사이 다른 탭에서 새로 찍으면 보관물이 갈아 끼워지는데,
    끝난 뒤 무조건 지우면 아직 아무도 묻지 않은 인계가 소리 없이 사라진다.
  */
  it("저장이 끝났을 때 보관물이 갈아 끼워져 있으면 지우지 않는다", async () => {
    const finishSave = holdSave();

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

    // 합성을 기다리는 사이 다른 탭이 새로 찍었다.
    mockGetPending.mockResolvedValue({
      ...PENDING,
      savedAt: PENDING.savedAt + 1000,
    });
    finishSave();

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "기록에 저장됐어요",
      );
    });
    expect(mockClearPending).not.toHaveBeenCalled();
  });

  /*
    회귀 — 저장이 끝나는 순간 보던 화면에서 끌어내지 않는다.

    stripResumeParam 이 effect 가 잡아 둔 pathname 으로 replace 하던 시절에는, 저장을
    맡겨 두고 기록 화면으로 옮긴 사람이 수십 초 뒤 /home 으로 끌려갔다. replace 라
    뒤로 가기로 돌아오지도 못한다.
  */
  it("저장 중 화면을 옮기면 옮긴 주소를 그대로 둔다", async () => {
    window.history.replaceState({}, "", "/home?resumeSave=1");
    mockSearch = new URLSearchParams("resumeSave=1");
    const finishSave = holdSave();

    const view = render(<GuestTrialBridge />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("이 계정에 저장하기");
    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });

    // 저장을 맡겨 두고 기록 화면으로 옮겼다.
    mockPathname = "/history";
    mockSearch = new URLSearchParams();
    window.history.replaceState({}, "", "/history");
    view.rerender(<GuestTrialBridge />);
    await flushAsync();

    finishSave();
    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "기록에 저장됐어요",
      );
    });
    // 옮겨 간 주소에는 정리할 파라미터가 없다. /home 으로 되돌리지 않는다.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  /*
    회귀 — 저장이 도는 동안 확인 안내가 되살아나지 않는다.

    화면을 한 번 옮기면 cleanup 이 "이미 물어봤다"를 그대로 두지만, 두 번째 정리에서는
    그 실행이 물어본 적이 없어 되돌린다. 그러면 다음 화면에서 확인 안내가 다시 떠
    진행 중 안내를 덮고, 눌리는 순간 같은 인계가 한 번 더 접수된다.
  */
  it("저장 중에는 화면을 두 번 옮겨도 확인 안내가 되살아나지 않는다", async () => {
    const finishSave = holdSave();

    const view = render(<GuestTrialBridge />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("이 계정에 저장하기");
    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });

    for (const next of ["/history", "/home"]) {
      mockPathname = next;
      window.history.replaceState({}, "", next);
      view.rerender(<GuestTrialBridge />);
      await flushAsync();
    }

    expect(useGuestTrialStore.getState().notice?.title).toBe(
      "기록에 옮기고 있어요",
    );

    finishSave();
    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "기록에 저장됐어요",
      );
    });
    expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
  });

  /*
    회귀 — 확인 안내를 열어 둔 사이 기한이 지난 보관물을 올리지 않는다.

    안내는 사용자가 누를 때까지 열려 있다. 기한(24시간)이 코앞일 때 띄웠다면 누르는 시점에는
    보관물이 이미 사라져 있고(`getPendingGuestSave` 가 읽으면서 지운다), 그런데도 안내를
    띄울 때 캡처해 둔 항목으로 합성을 계속하면 하루 기한을 넘긴 사진이 계정 기록에 들어간다 —
    공용 기기에서 앞사람 것이 넘어가지 않게 한 TTL 이 바로 이 자리에서 우회된다.
  */
  it("누를 때 보관물이 사라졌으면 올리지 않고 알린다", async () => {
    mockGetPending.mockResolvedValueOnce(PENDING).mockResolvedValue(null);

    render(<GuestTrialBridge />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("이 계정에 저장하기");

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "기록에 옮기지 않았어요",
      );
    });
    expect(mockSaveFourcutToServer).not.toHaveBeenCalled();
  });

  /*
    회귀 — 물어본 것과 다른 보관물이면 인계를 접는다.

    보관물은 한 벌이라, 안내를 열어 둔 사이 다른 탭에서 새로 찍으면 통째로 갈아 끼워진다.
    캡처해 둔 항목으로 계속하면 사용자가 확인한 적 없는 네컷을 저장하게 된다. 새로 들어온
    한 벌은 남의 것이 아니라 다음 인계 후보라 지우지 않고, 다시 물어본다.
  */
  it("누를 때 다른 네컷으로 바뀌어 있으면 접고 그 새 보관물을 다시 묻는다", async () => {
    const NEWER = {
      ...PENDING,
      displayName: "방금 찍은 네컷",
      savedAt: PENDING.savedAt + 1000,
    };
    mockGetPending.mockResolvedValueOnce(PENDING).mockResolvedValue(NEWER);

    const view = render(<GuestTrialBridge />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("이 계정에 저장하기");

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "기록에 옮기지 않았어요",
      );
    });
    expect(mockSaveFourcutToServer).not.toHaveBeenCalled();
    expect(mockClearPending).not.toHaveBeenCalled();

    // 화면을 옮기면 새로 들어온 그 한 벌을 다시 묻는다 — 접었으니 "이미 물어봤다"도 접는다.
    mockPathname = "/history";
    window.history.replaceState({}, "", "/history");
    view.rerender(<GuestTrialBridge />);

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "비회원 때 만든 네컷이 남아 있어요",
      );
    });
    expect(useGuestTrialStore.getState().notice?.message).toContain(
      "방금 찍은 네컷",
    );
  });

  /*
    회귀 — **멱등키가 붙은 한 벌과 올리는 한 벌이 갈리면 안 된다.**

    대조와 키 발급이 저장소를 따로따로 읽던 때의 구멍이다. 대조는 A 를 보고 통과했는데
    그 직후 다른 탭이 B 로 갈아 끼우면, 키 K 는 B 에 붙고 요청에는 A 의 원본이 실렸다.
    조건부 삭제가 B 를 지켜 주므로 B 는 남고, 나중에 B 를 인계할 때 K 가 다시 나와 서버가
    A 작업을 재생한다 — 방금 찍은 B 대신 A 가 기록에 저장된다.

    그래서 올릴 한 벌은 **키를 붙인 그 읽기에서** 나와야 하고, 그것이 물어본 것과 다르면
    접어야 한다. 여기서는 키 발급이 갈아 끼워진 뒤를 읽은 상황을 그대로 흉내 낸다.
  */
  it("멱등키가 다른 한 벌에 붙었으면 올리지 않는다", async () => {
    const NEWER = {
      ...PENDING,
      displayName: "방금 찍은 네컷",
      savedAt: PENDING.savedAt + 1000,
    };
    // 안내는 A 로 띄운다. 키 발급이 읽을 때는 이미 B 로 갈아 끼워져 있다.
    mockEnsureComposeKey.mockImplementation(async () => ({
      key: "web-guest-B",
      persisted: true,
      entry: { ...NEWER, composeIdempotencyKey: "web-guest-B" },
    }));

    render(<GuestTrialBridge />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("이 계정에 저장하기");

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "기록에 옮기지 않았어요",
      );
    });
    // 고치기 전에는 여기서 A 의 원본이 B 의 키로 올라갔다.
    expect(mockSaveFourcutToServer).not.toHaveBeenCalled();
    // B 는 아직 아무도 묻지 않은 인계다 — 지우지 않는다.
    expect(mockClearPending).not.toHaveBeenCalled();
  });

  /*
    회귀 — 못 지운 새 한 벌은 **다음 회차에 다시 묻는다.**

    합성이 도는 1분 사이에 다른 탭이 새로 찍으면 보관물이 갈아 끼워진다. 그 한 벌은 지키는
    것이 맞지만, "이미 물어봤다" 표식을 그대로 두면 다음 회차가 통째로 건너뛴다 — 새로고침
    하거나 앱을 다시 열기 전까지 그 한 벌을 계정에 옮길 방법이 없다.
  */
  it("저장 뒤 못 지운 새 보관물은 다음 회차에 다시 묻는다", async () => {
    const NEWER = {
      ...PENDING,
      displayName: "방금 찍은 네컷",
      savedAt: PENDING.savedAt + 1000,
    };
    const release = holdSave();

    const view = render(<GuestTrialBridge />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("이 계정에 저장하기");
    await flushAsync();

    // 합성이 도는 사이 다른 탭이 새로 찍었다.
    mockGetPending.mockResolvedValue(NEWER);
    await act(async () => {
      release();
    });

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe("기록에 저장됐어요");
    });
    // 새 한 벌은 지키고 —
    expect(mockClearPending).not.toHaveBeenCalled();

    // — 화면을 옮기면 그것을 다시 묻는다.
    mockPathname = "/history";
    window.history.replaceState({}, "", "/history");
    view.rerender(<GuestTrialBridge />);

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "비회원 때 만든 네컷이 남아 있어요",
      );
    });
    expect(useGuestTrialStore.getState().notice?.message).toContain(
      "방금 찍은 네컷",
    );
  });

  /*
    회귀 — **못 읽은 것을 「없다」로 읽지 않는다.**

    저장소를 못 열거나 읽다 깨지면 레코드가 멀쩡히 있어도 조회는 빈손으로 돌아온다. 그것을
    「이미 사라졌다」로 보고 지우면, 합성이 도는 사이 다른 탭이 새로 찍어 둔 한 벌 —
    사용자가 확인한 적 없는 것 — 이 통째로 사라진다. 원본 4장은 거기에만 있다.
  */
  it("보관물을 읽지 못했으면 지우지 않는다", async () => {
    const release = holdSave();

    render(<GuestTrialBridge />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("이 계정에 저장하기");
    await flushAsync();

    // 올리는 사이 저장소가 막혔다 — 있는지 없는지 알 수 없다.
    mockClearIfUnchanged.mockResolvedValue("unreadable");
    await act(async () => {
      release();
    });

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe("기록에 저장됐어요");
    });
    // 고치기 전에는 여기서 확인한 적 없는 한 벌까지 지웠다.
    expect(mockClearPending).not.toHaveBeenCalled();
  });

  /*
    회귀 — 조건부 삭제는 **삭제 전용 읽기**를 쓴다.

    인계용 읽기(`readPendingGuestSave`)는 저장소를 못 연 채 읽은 예전 localStorage 한 벌도
    `found` 로 준다 — 그 답을 삭제 근거로 쓰면 IndexedDB 를 한 번도 못 읽은 채 지우게 되고,
    다른 탭이 방금 찍어 둔 원본 4장이 사라진다. 그 판단은 보관소의
    `clearPendingGuestSaveIfUnchanged` 안에 있고, 브리지는 지문만 넘긴다.
  */
  /*
    회귀 — **access 만 만료된 회원에게도 묻는다.**

    생 `/api/auth/session` 은 만료된 access 를 재발급해 주지 않고 `authenticated: false` 로
    감싼다. 그것을 근거로 삼으면 refresh 가 멀쩡한 회원이 비회원으로 읽혀 인계가 묶이고,
    `handoffPromptedRef` 가 이미 서 있어 같은 화면에서는 다시 묻지도 않는다 — 다른 API 가
    곧 토큰을 되살려도 새로고침 전까지 그대로다. `resolveMembership` 은 재발급까지 해 본다.
  */
  it("재발급을 거쳐 회원으로 확인되면 저장할지 묻는다", async () => {
    setSession("member");

    render(<GuestTrialBridge />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
  });

  /*
    회귀 — **못 물어봤으면 「이미 물어봤다」를 되돌린다.**

    서버가 잠깐 흔들린 것뿐인데 표식을 남기면 이번 화면에서 인계가 통째로 사라진다.
    다음 회차(화면 이동)에 다시 물어야 한다.
  */
  it("판정할 수 없으면 다음 회차에 다시 묻는다", async () => {
    setSession("unknown");

    const view = render(<GuestTrialBridge />);
    await flushAsync();
    expect(screen.queryByRole("button", { name: "이 계정에 저장하기" })).toBeNull();

    // 서버가 돌아왔다. 화면을 옮기면 다시 묻는다.
    setSession("member");
    mockPathname = "/history";
    window.history.replaceState({}, "", "/history");
    view.rerender(<GuestTrialBridge />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
  });

  /*
    회귀 — **같은 화면에 머물러도 회선이 돌아오면 다시 묻는다.**

    cleanup 이 표식을 되돌리기는 하지만 그것은 **effect 가 다시 돌 때**(주소가 바뀌거나
    언마운트될 때)뿐이다. 화면을 옮기지 않고 그대로 있으면 서버가 회복돼도 아무 일도
    일어나지 않아, 보관된 네컷의 저장 안내가 이 화면에서는 영영 안 뜬다.
  */
  it("판정에 실패해도 회선이 돌아오면 같은 화면에서 다시 묻는다", async () => {
    setSession("unknown");

    render(<GuestTrialBridge />);
    await flushAsync();
    expect(screen.queryByRole("button", { name: "이 계정에 저장하기" })).toBeNull();

    // 서버가 돌아왔다. 화면을 옮기지 않는다 — 브라우저가 회선 복구를 알려 준다.
    setSession("member");
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
  });

  // 탭으로 돌아오는 것도 같은 신호다 — 백그라운드에서 회선이 돌아온 경우를 덮는다.
  it("판정에 실패해도 탭으로 돌아오면 다시 묻는다", async () => {
    setSession("unknown");

    render(<GuestTrialBridge />);
    await flushAsync();

    setSession("member");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
  });

  /*
    반대쪽 못 — **이미 물어본 화면에서는 그 신호에 다시 묻지 않는다.** 늘 듣게 두면 탭을
    오갈 때마다 판정이 다시 돌아 헛왕복이 붙는다.
  */
  it("이미 물어본 화면에서는 탭을 오가도 다시 묻지 않는다", async () => {
    setSession("member");

    render(<GuestTrialBridge />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    const asked = mockResolveMembership.mock.calls.length;

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("online"));
    });

    expect(mockResolveMembership.mock.calls.length).toBe(asked);
  });

  // 반대쪽 못 — 확정된 비회원에게는 묻지 않고, 다시 묻지도 않는다.
  it("확정된 비회원에게는 묻지 않는다", async () => {
    setSession("guest");

    const view = render(<GuestTrialBridge />);
    await flushAsync();

    mockPathname = "/history";
    window.history.replaceState({}, "", "/history");
    view.rerender(<GuestTrialBridge />);
    await flushAsync();

    expect(screen.queryByRole("button", { name: "이 계정에 저장하기" })).toBeNull();
  });

  /*
    회귀 — **판정이 도는 사이에 온 복구 신호를 놓치지 않는다.**

    판정은 최대 30초까지 걸린다(`STATUS_DEADLINE_MS`). 그 사이에 회선이 돌아오거나 탭으로
    돌아오는 일이 실제로 일어나는데, 신호를 `unknown` **이 온 뒤에야** 듣기 시작하면 그
    신호는 이미 지나간 뒤다. 사용자가 같은 화면에 머무르면 더 올 신호도 없어, 이 수정이
    막으려던 「저장 안내가 영영 안 뜸」이 그대로 재현된다.
  */
  it("판정이 도는 사이에 온 복구 신호로도 다시 묻는다", async () => {
    let answer!: (value: string) => void;
    mockResolveMembership.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    render(<GuestTrialBridge />);
    await flushAsync();

    // 판정이 도는 중에 회선이 돌아온다. 아직 답은 안 왔다.
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    // 그 뒤 도착한 답이 「모르겠다」다 — 신호는 이미 지나갔지만 기록해 뒀어야 한다.
    setSession("member");
    await act(async () => {
      answer("unknown");
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
  });

  /*
    회귀 — **신호가 오지 않아도 한 번은 시간을 재서 다시 묻는다.**

    서버만 아팠다 낫는 경우 `online` 도 `visibilitychange` 도 오지 않는다. 온라인인 채로
    같은 화면에 머무르면 신호가 영영 없어, 저장 안내가 사라진 채로 남는다.
  */
  it("신호가 없어도 한 번은 시간을 재서 다시 묻는다", async () => {
    jest.useFakeTimers();
    try {
      setSession("unknown");

      render(<GuestTrialBridge />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(mockResolveMembership).toHaveBeenCalledTimes(1);

      // 아무 신호도 없다. 그래도 서버는 나았다.
      setSession("member");
      await act(async () => {
        await jest.advanceTimersByTimeAsync(30_000);
      });

      expect(mockResolveMembership).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  /*
    회귀 — **신호가 먼저 오면 재던 시간은 접는다.**

    시간을 재는 것은 신호가 안 올 때를 메우려는 것이다. 신호가 먼저 와서 한 회차가 이미
    돌았는데 타이머까지 터지면, 같은 것을 묻는 왕복이 하나 더 붙는다.
  */
  it("신호로 다시 물었으면 재던 시간은 접는다", async () => {
    jest.useFakeTimers();
    try {
      setSession("unknown");

      render(<GuestTrialBridge />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(mockResolveMembership).toHaveBeenCalledTimes(1);

      // 30초가 되기 전에 회선이 돌아온다 — 그 신호로 한 회차가 돈다.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10_000);
        window.dispatchEvent(new Event("online"));
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(mockResolveMembership).toHaveBeenCalledTimes(2);

      // 처음 재던 30초가 지나도 그 타이머는 터지지 않아야 한다.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60_000);
      });
      expect(mockResolveMembership).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  /*
    회귀 — **시간을 잰 되묻기는 한 번뿐이다.**

    낫지 않는 장애에 간격을 두고 되풀이하면 같은 장애에 요청만 쌓인다. 한 번으로 못 잡은
    것은 화면을 옮기거나 신호가 올 때 잡는다.
  */
  it("시간을 잰 되묻기는 되풀이하지 않는다", async () => {
    jest.useFakeTimers();
    try {
      setSession("unknown");

      render(<GuestTrialBridge />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });

      // 30초 뒤 한 번 더 묻는다. 그것도 「모르겠다」다.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(30_000);
      });
      expect(mockResolveMembership).toHaveBeenCalledTimes(2);

      // 그 뒤로는 아무리 기다려도 스스로 다시 묻지 않는다.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(300_000);
      });
      expect(mockResolveMembership).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  /*
    회귀 — **보관물이 사라졌으면 그만 듣는다.**

    `unknown` 으로 감시가 켜진 뒤, 다른 탭에서 저장·폐기했거나 TTL 로 정리돼 보관물이
    없어질 수 있다. 그때도 계속 듣고 있으면 탭을 오갈 때마다 IndexedDB 를 다시 읽는다 —
    물어볼 것이 없어진 뒤에도 앱이 열려 있는 내내 그렇다.
  */
  it("보관물이 사라지면 신호를 그만 듣는다", async () => {
    setSession("unknown");

    render(<GuestTrialBridge />);
    await flushAsync();
    expect(mockGetPending).toHaveBeenCalledTimes(1);

    // 그 사이 보관물이 없어졌다. 신호가 오면 한 회차는 돌지만, 읽어 보니 남은 것이 없다.
    mockGetPending.mockResolvedValue(null);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flushAsync();
    expect(mockGetPending).toHaveBeenCalledTimes(2);

    // 여기서 멈춰야 한다 — 더 읽을 것이 없다.
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("online"));
    });
    await flushAsync();
    expect(mockGetPending).toHaveBeenCalledTimes(2);
  });

  /*
    회귀 — **늦게 끝난 앞 회차가 뒤 회차의 「도는 중」을 지우지 않는다.**

    화면이 바뀌면 앞 회차는 취소 표시만 되고 요청 자체는 제 상한까지 계속 돈다. 그것이
    끝나면서 「도는 중」을 통째로 내리면, 다음 신호가 아직 도는 회차와 겹치는 세 번째
    왕복을 연다 — 30초짜리 인증 요청이 둘씩 겹친다.
  */
  it("늦게 끝난 앞 회차가 뒤 회차의 판정을 겹치게 하지 않는다", async () => {
    const answers: Array<(value: string) => void> = [];
    mockResolveMembership.mockImplementation(
      () =>
        new Promise((resolve) => {
          answers.push(resolve);
        }),
    );

    const view = render(<GuestTrialBridge />);
    await flushAsync();
    expect(mockResolveMembership).toHaveBeenCalledTimes(1);

    // 답을 기다리는 사이에 화면을 옮긴다 — 앞 회차는 취소되고 뒤 회차가 시작된다.
    mockPathname = "/history";
    window.history.replaceState({}, "", "/history");
    view.rerender(<GuestTrialBridge />);
    await flushAsync();
    expect(mockResolveMembership).toHaveBeenCalledTimes(2);

    // 이제 **앞** 회차가 뒤늦게 끝난다. 뒤 회차는 아직 돌고 있다.
    await act(async () => {
      answers[0]("unknown");
    });

    // 이 신호는 도는 중인 뒤 회차에 기록만 돼야 한다 — 세 번째 왕복을 열면 안 된다.
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await flushAsync();
    expect(mockResolveMembership).toHaveBeenCalledTimes(2);
  });

  /*
    회귀 — **신호 하나는 되묻기 한 번이다.**

    도는 사이에 온 신호는 기록해 뒀다가 그 회차 끝에 쓴다. 쓰고 나서 지우지 않으면
    다음 회차도 같은 기록을 보고 또 되묻는다 — 신호는 한 번인데 왕복이 끝없이 이어진다.
    기록을 지우는 자리는 회차의 시작 하나뿐이므로, 그 자리가 살아 있는지 여기서 잰다.
  */
  it("도는 사이에 온 신호 하나로 되묻기는 한 번만 늘어난다", async () => {
    let answer!: (value: string) => void;
    mockResolveMembership.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    render(<GuestTrialBridge />);
    await flushAsync();

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    // 기록해 둔 신호로 한 회차가 더 돈다. 그 회차도 「모르겠다」다.
    setSession("unknown");
    await act(async () => {
      answer("unknown");
    });
    await waitFor(() => {
      expect(mockResolveMembership).toHaveBeenCalledTimes(2);
    });

    // 신호는 더 오지 않았다 — 여기서 멈춰야 한다.
    await flushAsync();
    await flushAsync();
    expect(mockResolveMembership).toHaveBeenCalledTimes(2);
  });

  /*
    회귀 — **신호가 몰아쳐도 왕복은 한 번에 하나만 돈다.**

    회선이 오르내리면 `online` 은 연달아 온다. 그때마다 새 회차를 시작하면 앞 회차의 요청은
    버려지지 않고 제 30초를 다 쓴다 — 장애 중인 서버에 요청만 쌓인다. 도는 중에 온 신호는
    기록만 하고, 그 회차가 끝난 뒤에 한 번만 쓴다.
  */
  it("복구 신호가 몰아쳐도 판정은 한 번에 하나만 돈다", async () => {
    let answer!: (value: string) => void;
    mockResolveMembership.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    render(<GuestTrialBridge />);
    await flushAsync();
    expect(mockResolveMembership).toHaveBeenCalledTimes(1);

    // 답을 기다리는 사이에 신호가 세 번 온다.
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(mockResolveMembership).toHaveBeenCalledTimes(1);

    // 답이 「모르겠다」로 끝나면 그제야 한 회차가 더 돈다 — 세 번이 아니라 한 번이다.
    setSession("member");
    await act(async () => {
      answer("unknown");
    });
    await waitFor(() => {
      expect(mockResolveMembership).toHaveBeenCalledTimes(2);
    });
  });

  /*
    회귀 — **첫 회차가 `unknown` 이어도 뒤에 `guest` 로 확정되면 신호를 그만 듣는다.**

    안 끄면 앞 회차의 리스너가 남아, 답이 정해진 사람에게 탭을 오갈 때마다 왕복이 붙는다.
  */
  it("unknown 뒤에 게스트로 확정되면 신호를 그만 듣는다", async () => {
    setSession("unknown");

    const view = render(<GuestTrialBridge />);
    await flushAsync();

    // 화면을 옮기면 한 회차가 더 돌고, 이번에는 확정된 비회원이다.
    setSession("guest");
    mockPathname = "/history";
    window.history.replaceState({}, "", "/history");
    view.rerender(<GuestTrialBridge />);
    await flushAsync();

    const asked = mockResolveMembership.mock.calls.length;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flushAsync();

    expect(mockResolveMembership.mock.calls.length).toBe(asked);
  });

  /*
    반대쪽 못 — **확정된 비회원에게는 재시도 신호도 듣지 않는다.**

    신호를 늘 듣게 두면 탭을 오갈 때마다 판정이 다시 돌아, 답이 이미 정해진 사람에게
    인증 왕복이 계속 붙는다. 듣는 것은 `unknown` 으로 끝난 회차가 있을 때뿐이어야 한다.
  */
  it("확정된 비회원에게는 탭을 오가도 다시 묻지 않는다", async () => {
    setSession("guest");

    render(<GuestTrialBridge />);
    await flushAsync();
    const asked = mockResolveMembership.mock.calls.length;

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("online"));
    });
    await flushAsync();

    expect(mockResolveMembership.mock.calls.length).toBe(asked);
  });

  it("보관물을 지울 때는 보관소의 조건부 삭제에 맡긴다", async () => {
    render(<GuestTrialBridge />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "버리기" })).toBeInTheDocument();
    });
    pressNoticeAction("버리기");

    await waitFor(() => {
      expect(mockClearPending).toHaveBeenCalled();
    });
    expect(mockClearIfUnchanged).toHaveBeenCalled();
    // 인계용 읽기를 불렀다면 위 목이 던져 여기까지 오지 못한다. 명시적으로도 못 박는다.
    expect(mockReadForHandoff).not.toHaveBeenCalled();
  });

  it("버리기를 고르면 보관물만 지우고 서버는 부르지 않는다", async () => {
    render(<GuestTrialBridge />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "버리기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("버리기");

    // 지우기 전에 보관물을 되읽으므로 한 박자 뒤에 지워진다.
    await waitFor(() => {
      expect(mockClearPending).toHaveBeenCalledTimes(1);
    });
    expect(mockSaveFourcutToServer).not.toHaveBeenCalled();
    expect(useGuestTrialStore.getState().notice).toBeNull();
  });

  /*
    회귀 — 버리기도 **확인한 그 한 벌만** 지운다.

    저장 쪽과 같은 창이다. 안내를 열어 둔 사이 다른 탭에서 새로 찍으면 보관물이 갈아
    끼워지는데, 그대로 지우면 아직 아무도 묻지 않은 인계가 사라진다 — 원본 4장은 이
    보관물에만 있어 되돌릴 방법이 없다.
  */
  it("버리기를 눌렀을 때 다른 네컷으로 바뀌어 있으면 지우지 않는다", async () => {
    mockGetPending
      .mockResolvedValueOnce(PENDING)
      .mockResolvedValue({ ...PENDING, savedAt: PENDING.savedAt + 1000 });

    render(<GuestTrialBridge />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "버리기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("버리기");

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "버리지 않았어요",
      );
    });
    expect(mockClearPending).not.toHaveBeenCalled();
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
    mockGetPending.mockResolvedValue(null);
    mockSearch = new URLSearchParams("resumeSave=1");
    window.history.replaceState({}, "", "/home?resumeSave=1");

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
    회귀 — 멱등키를 **못 남긴** 기기에는 다른 안내를 준다.

    IndexedDB 를 못 열거나 트랜잭션이 깨지면 키는 이번 합성에만 쓰이고 사라진다. 그 상태로
    "새로고침하면 다시 시도해요"라고만 하면, 시키는 대로 한 사람에게 같은 네컷이 두 벌
    남는다 — 서버가 재생할 키가 없어 처음부터 다시 그리기 때문이다. 재시도를 막지는 않되,
    무엇이 달라지는지는 먼저 말해야 한다.
  */
  it("멱등키를 못 남긴 기기에는 중복 저장 가능성을 알린다", async () => {
    mockEnsureComposeKey.mockImplementation(async () => ({
      key: "web-guest-ephemeral",
      persisted: false,
      entry: PENDING,
    }));
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
    // 보관물은 그대로 둔다 — 재시도 자체는 여전히 할 수 있어야 한다.
    expect(mockClearPending).not.toHaveBeenCalled();
    expect(useGuestTrialStore.getState().notice?.message).toContain(
      "두 벌 저장될 수 있어요",
    );
  });

  /*
    회귀 — 재시도가 같은 네컷을 한 벌 더 만들지 않는다.

    서버 합성이 **성공한 뒤에도** 이 인계는 실패할 수 있다(폴링 시간 초과, 이름 바꾸기 뒤의
    URL 조회). 그런 실패에는 보관물을 남겨 재시도를 안내하는데, 그때 멱등키까지 새로 만들면
    서버가 예전 작업을 재생하지 못하고 처음부터 다시 그린다 — 기록에 똑같은 네컷이 두 벌
    남는다. 키는 보관물과 함께 살아 있어야 하고, 새로고침(= 다시 마운트)해도 같아야 한다.
  */
  it("재시도해도 처음 잡은 멱등키를 그대로 쓴다", async () => {
    mockSaveFourcutToServer.mockRejectedValueOnce(new Error("timeout"));

    const first = render(<GuestTrialBridge />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("이 계정에 저장하기");

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });
    // 보관물이 남아 있어야 재시도가 성립한다.
    expect(mockClearPending).not.toHaveBeenCalled();

    // 새로고침. 컴포넌트는 새로 마운트되고, 이어받을 것은 보관물뿐이다.
    first.unmount();
    useGuestTrialStore.setState({ hydrated: false, notice: null });

    render(<GuestTrialBridge />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "이 계정에 저장하기" }),
      ).toBeInTheDocument();
    });
    pressNoticeAction("이 계정에 저장하기");

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(2);
    });

    const [firstCall, secondCall] = mockSaveFourcutToServer.mock.calls;
    expect(typeof firstCall[0].idempotencyKey).toBe("string");
    expect(secondCall[0].idempotencyKey).toBe(firstCall[0].idempotencyKey);
  });

  /*
    올리는 사이에 세션이 끊긴 것은 "저장 실패"가 아니다. 그렇게 안내하면 사용자는
    멀쩡한 결과물을 잃은 줄 알고, 보관물은 남아 있어 안내만 하루 동안 반복된다.
  */
  /*
    회귀 — 401 로 멈춘 자리에도 **중복 경고**를 붙인다.

    서버 합성이 끝난 뒤 이름·URL 조회에서 401 이 날 수 있다. 그때 「다시 로그인하면 이어서
    저장할게요」라고만 하면, 멱등키를 못 남긴 기기에서는 다음 로그인의 재시도가 새 키로
    접수돼 같은 네컷이 두 벌 남는다 — 아래 재시도 안내와 정확히 같은 상황이다.
  */
  it("멱등키를 못 남긴 기기의 401 안내에도 중복 가능성을 알린다", async () => {
    mockEnsureComposeKey.mockImplementation(async () => ({
      key: "web-guest-ephemeral",
      persisted: false,
      entry: PENDING,
    }));
    mockSaveFourcutToServer.mockRejectedValueOnce(
      Object.assign(new Error("unauthorized"), { status: 401 }),
    );

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
    expect(useGuestTrialStore.getState().notice?.message).toContain(
      "두 벌 저장될 수 있어요",
    );
    // 보관물은 그대로 둔다 — 다시 로그인하면 이어 가야 한다.
    expect(mockClearPending).not.toHaveBeenCalled();
  });

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
    setSession("guest");

    render(<GuestTrialBridge />);

    await waitFor(() => {
      expect(useGuestTrialStore.getState().hydrated).toBe(true);
    });

    expect(mockSaveFourcutToServer).not.toHaveBeenCalled();
    expect(mockClearPending).not.toHaveBeenCalled();
    expect(useGuestTrialStore.getState().notice).toBeNull();
  });
});
