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
const mockClearPending = jest.fn();
const mockEnsureComposeKey = jest.fn();
const mockDescribeComposeFailure = jest.fn();

let mockSearch = new URLSearchParams();
// 저장이 끝나기 전에 사용자가 화면을 옮기는 시나리오가 있어서 주소를 고정할 수 없다.
let mockPathname = "/home";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearch,
}));

jest.mock("@/lib/fourcutProcessing", () => ({
  saveFourcutToServer: (...args: unknown[]) => mockSaveFourcutToServer(...args),
}));

jest.mock("@/lib/pendingGuestSave", () => ({
  getPendingGuestSave: (...args: unknown[]) => mockGetPending(...args),
  clearPendingGuestSave: (...args: unknown[]) => mockClearPending(...args),
  ensurePendingGuestSaveComposeKey: (...args: unknown[]) =>
    mockEnsureComposeKey(...args),
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
