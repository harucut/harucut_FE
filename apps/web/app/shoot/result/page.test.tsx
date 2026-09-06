import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { create } from "zustand";
import ShootResultPage from "@/app/shoot/result/page";
import { newIdempotencyKey } from "@/lib/composeApi";
import type { GeneratedFourcutAsset } from "@/lib/fourcutOutput";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { NativeSaveError } from "@/lib/nativeBridge";
// 목이 아니라 진짜다 — 아래 jest.mock 이 requireActual 로 펼쳐 둔 것을 가져온다.
import { CopyFailedError } from "@/lib/share";
// 목이 아니라 진짜다 — 아래 jest.mock 이 requireActual 을 펼쳐 두었다.
import { buildFrameContentKey } from "@/lib/shootSessionStore";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockComposeFramePng = jest.fn();
const mockSaveFourcutToServer = jest.fn();
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();
const mockSetPendingGuestSave = jest.fn();
const mockDescribeComposeFailure = jest.fn();
const mockDownloadFromUrl = jest.fn();

type MockShootSessionState = {
  frameId: string | null;
  remoteFrameId: number | null;
  shots: string[];
  selectedIndexes: Array<number | null>;
  borderColor: string;
  outputFilter: "NONE";
  imageResult: GeneratedFourcutAsset | null;
  // 멱등키는 컴포넌트가 아니라 **세션**이 들고 있다(lib/shootSessionStore.ts).
  // 목도 그렇게 맞춰야 "페이지를 다시 열면 새 키가 잡힌다"는 결함을 관측할 수 있다.
  composeIdempotency: {
    generationKey: string;
    frameContentKey: string | null;
    idempotencyKey: string;
  } | null;
  setImageResult: (imageResult: GeneratedFourcutAsset | null) => void;
  ensureComposeIdempotencyKey: (
    generationKey: string,
    frameTheme?: ThemeExportJson | null,
  ) => string;
  clearResults: () => void;
};

const mockUseShootSession = create<MockShootSessionState>((set, get) => ({
  frameId: "classic-4" as string | null,
  remoteFrameId: null as number | null,
  shots: ["/shot-1.png", "/shot-2.png", "/shot-3.png", "/shot-4.png"],
  selectedIndexes: [0, 1, 2, 3] as Array<number | null>,
  borderColor: "#111827",
  outputFilter: "NONE",
  imageResult: null,
  composeIdempotency: null,
  setImageResult: (imageResult) => set({ imageResult }),
  // 진짜 구현과 같은 규칙이다(lib/shootSessionStore.ts). 지문을 모르는 동안은 키를
  // 흔들지 않고, 알고 나서 달라졌을 때만 새 키를 잡으며 수정 전 결과를 버린다.
  ensureComposeIdempotencyKey: (generationKey, frameTheme = null) => {
    const frameContentKey = buildFrameContentKey(frameTheme);
    const current = get().composeIdempotency;

    if (current?.generationKey === generationKey) {
      if (frameContentKey == null) return current.idempotencyKey;

      if (current.frameContentKey == null) {
        set({ composeIdempotency: { ...current, frameContentKey } });
        return current.idempotencyKey;
      }

      if (current.frameContentKey === frameContentKey) return current.idempotencyKey;
    }

    const idempotencyKey = newIdempotencyKey();
    set({
      composeIdempotency: { generationKey, frameContentKey, idempotencyKey },
      imageResult: null,
    });
    return idempotencyKey;
  },
  clearResults: jest.fn(() => set({ imageResult: null })),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock("@/components/layout/PageHeader", () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

jest.mock("@/components/frame/FramePreview", () => ({
  FramePreview: () => <div data-testid="frame-preview" />,
}));

// 공유 버튼은 `onShare` 가 있을 때만 그린다 — 진짜 카드와 같다
// (components/frame/GeneratedAssetDownloadCard.tsx). 비회원은 이 값을 넘기지 않으므로,
// 항상 그려 두면 게스트에게 공유가 열린 것처럼 보이는 회귀를 놀친다.
jest.mock("@/components/frame/GeneratedAssetDownloadCard", () => ({
  GeneratedAssetDownloadCard: ({
    onDownload,
    onShare,
  }: {
    onDownload: () => void;
    onShare?: () => void;
  }) => (
    <div data-testid="generated-asset-card">
      <button type="button" onClick={onDownload}>
        이미지 다운로드
      </button>
      {onShare ? (
        <button type="button" onClick={onShare}>
          공유 링크 만들기
        </button>
      ) : null}
    </div>
  ),
}));

/*
  꾸민 프레임 한 벌. `buildFrameContentKey` 가 실제로 읽는 필드를 갖춰 둔다 —
  `renderUrl` 은 조회할 때마다 달라지는 서명 URL 이라 지문에 들어가면 안 된다.
*/
const DECORATED_THEME: ThemeExportJson = {
  frameId: "classic-4",
  background: { type: "COLOR", value: "#ffffff" },
  cellCutouts: [false, false, false, false],
  components: [
    {
      id: "sticker-1",
      type: "STICKER",
      source: "uploads/users/1/heart.png",
      renderUrl: "https://s3.example.com/heart.png?sig=first",
      x: 10,
      y: 20,
      width: 100,
      height: 100,
      scale: 1,
      rotation: 0,
      zIndex: 1,
      styleJson: {},
    },
  ],
};

/** 사용자가 배경색을 고친 같은 프레임. id 는 그대로다(수정은 같은 id 로 가는 PUT 이다). */
const EDITED_THEME: ThemeExportJson = {
  ...DECORATED_THEME,
  background: { type: "COLOR", value: "#1ed760" },
};

/** 내용은 그대로인데 조회 서명만 새로 받은 같은 프레임. */
const RESIGNED_THEME: ThemeExportJson = {
  ...DECORATED_THEME,
  components: DECORATED_THEME.components.map((component) => ({
    ...component,
    renderUrl: "https://s3.example.com/heart.png?sig=second",
  })),
};

// 꾸민 프레임의 테마는 네트워크를 세 번 타고 **늦게** 도착한다. 그 순간을 재현하려고
// 값을 바꿀 수 있게 둔다.
let mockThemeData: unknown = null;
jest.mock("@/hooks/useRemoteFrameTheme", () => ({
  useRemoteFrameTheme: () => mockThemeData,
}));

jest.mock("@/lib/themeBackground", () => ({
  resolveFrameBackgroundColor: (_theme: unknown, borderColor: string) =>
    borderColor,
  // 화면은 안 쓰지만 진짜 세션 스토어가 초깃값으로 읽는다(아래 스토어 테스트).
  DEFAULT_FRAME_BACKGROUND_COLOR: "#111827",
}));

jest.mock("@/lib/guards", () => ({
  isNotNull: (value: unknown) => value != null,
}));

// 세션 상태만 목으로 갈아 끼우고 **지문 계산은 진짜를 쓴다.** 지문까지 목으로 덮으면
// "렌더 전용 서명 URL 은 지문에 안 들어간다" 같은 판정이 통째로 사라진다.
jest.mock("@/lib/shootSessionStore", () => ({
  ...jest.requireActual("@/lib/shootSessionStore"),
  useShootSession: () => mockUseShootSession(),
}));

jest.mock("@/lib/canvas/composeFrame", () => ({
  composeFramePng: (...args: unknown[]) => mockComposeFramePng(...args),
  downloadBlob: jest.fn(),
  downloadFromUrl: (...args: unknown[]) => mockDownloadFromUrl(...args),
}));

jest.mock("@/lib/pendingGuestSave", () => ({
  setPendingGuestSave: (...args: unknown[]) => mockSetPendingGuestSave(...args),
}));

jest.mock("@/lib/fourcutProcessing", () => ({
  saveFourcutToServer: (...args: unknown[]) => mockSaveFourcutToServer(...args),
}));

// 멱등키가 **언제 새로 잡히는지**를 보려면 상수여서는 안 된다. 상수 목으로는
// "재시도가 새 키를 만든다"는 결함을 원리상 관측할 수 없다.
// (jest.mock 은 호이스팅되므로 변수명이 mock 으로 시작해야 참조할 수 있다.)
let mockIdempotencyKeySeq = 0;
jest.mock("@/lib/composeApi", () => ({
  newIdempotencyKey: () => `web-key-${++mockIdempotencyKeySeq}`,
}));

jest.mock("@/lib/fourcutCompose", () => ({
  describeComposeFailure: (...args: unknown[]) => mockDescribeComposeFailure(...args),
}));

const mockGetMediaDownloadUrl = jest.fn();

jest.mock("@/lib/userMediaApi", () => ({
  updateMediaDisplayName: jest.fn(),
  getMediaDownloadUrl: (...args: unknown[]) => mockGetMediaDownloadUrl(...args),
}));

const mockShareOrCopyLink = jest.fn();

// 공유 동작만 목으로 갈아 끼우고 실패 판정(isCopyFailedError)은 진짜를 쓴다 — 판정까지
// 목으로 덮으면 아래 회귀 테스트가 자기 목만 확인하게 된다.
jest.mock("@/lib/share", () => ({
  ...jest.requireActual("@/lib/share"),
  shareOrCopyLink: (...args: unknown[]) => mockShareOrCopyLink(...args),
}));

const mockNativeNotify = jest.fn();

// nativeNotify 만 갈아 끼우고 나머지는 진짜를 쓴다. getNativeSaveErrorMessage 를 목으로
// 덮으면 "네이티브 사유를 믿을지 말지" 판정이 통째로 사라져, 아래 회귀 테스트가
// 자기 목만 확인하게 된다.
jest.mock("@/lib/nativeBridge", () => ({
  ...jest.requireActual("@/lib/nativeBridge"),
  nativeNotify: (...args: unknown[]) => mockNativeNotify(...args),
}));

/** `document.visibilityState` 를 갈아 끼운다(jsdom 은 항상 "visible" 이다). */
function stubVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

describe("ShootResultPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIdempotencyKeySeq = 0;
    stubVisibility("visible");
    mockCreateObjectURL.mockReturnValue("blob:generated-image");
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;
    // 보관은 IndexedDB 라 비동기다(lib/pendingGuestSave.ts). 동기 목으로 두면 호출부가
    // await 를 빠뜨려도(= 언제나 truthy 인 Promise 를 성공으로 읽어도) 테스트가 통과한다.
    mockSetPendingGuestSave.mockResolvedValue(true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["image"], { type: "image/png" }),
    }) as unknown as typeof fetch;
    // 쿠키를 읽기 전에는 이 화면이 어느 쪽으로도 그리지 않는다(아래 회귀 테스트 참고).
    // 실제 앱에서는 GuestTrialBridge 가 마운트하며 hydrateGuestMode() 로 이 값을 세운다.
    useGuestTrialStore.setState({
      accessMode: "member",
      hydrated: true,
      notice: null,
    });

    mockThemeData = null;
    mockUseShootSession.setState({
      frameId: "classic-4",
      remoteFrameId: null,
      shots: ["/shot-1.png", "/shot-2.png", "/shot-3.png", "/shot-4.png"],
      selectedIndexes: [0, 1, 2, 3],
      borderColor: "#111827",
      outputFilter: "NONE",
      imageResult: null,
      composeIdempotency: null,
    });

    mockComposeFramePng.mockResolvedValue(
      new Blob(["image"], { type: "image/png" }),
    );
    mockDescribeComposeFailure.mockReturnValue({
      message: "이미지를 준비하지 못했어요. 다시 시도해 주세요.",
      retryable: true,
    });
    mockSaveFourcutToServer.mockImplementation(
      async ({ displayName }: { file: File; displayName: string }) => ({
        mediaId: 1,
        objectUrl: "https://example.com/image",
        downloadUrl: "https://example.com/image",
        displayName,
      }),
    );
  });

  it("회원은 서버에만 합성을 맡기고 브라우저 합성은 돌리지 않는다", async () => {
    render(<ShootResultPage />);

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });

    // 회원 결과물은 서버가 그리고 미리보기는 DOM(FramePreview)이 그린다.
    // 여기서 캔버스 합성을 또 돌리면 최대 16MP 작업이 헛돌 뿐 아니라,
    // 그게 실패하면 멀쩡한 서버 저장까지 취소된다.
    expect(mockComposeFramePng).not.toHaveBeenCalled();

    // 서버 합성에는 완성본이 아니라 **원본 4장**과 프레임 정보를 넘긴다.
    const call = mockSaveFourcutToServer.mock.calls[0][0];
    expect(call.displayName).toMatch(/^harucut_\d{8}_\d{6}$/);
    expect(call.sources).toEqual([
      "/shot-1.png",
      "/shot-2.png",
      "/shot-3.png",
      "/shot-4.png",
    ]);
    expect(call.layout.slots).toHaveLength(4);
    // 재시도가 같은 작업을 가리키도록 멱등키를 함께 보낸다.
    expect(call.idempotencyKey).toBe("web-key-1");
  });

  it("비회원은 브라우저가 그린 그림이 결과물이라 고른 순서 그대로 합성한다", async () => {
    useGuestTrialStore.setState({ accessMode: "guest" });

    render(<ShootResultPage />);

    await waitFor(() => {
      expect(mockComposeFramePng).toHaveBeenCalledTimes(1);
    });

    expect(mockComposeFramePng.mock.calls[0][0].sources).toEqual([
      { src: "/shot-1.png" },
      { src: "/shot-2.png" },
      { src: "/shot-3.png" },
      { src: "/shot-4.png" },
    ]);
    expect(mockSaveFourcutToServer).not.toHaveBeenCalled();
  });

  /*
    ── 화면에 뜬 그림과 저장된 그림은 같아야 한다 ──

    FramePreview 는 고른 원본 4장을 겹쳐 그리는 **구도 미리보기**다. 회원 경로는 누끼(배경
    제거)를 올리기 전에 픽셀에 굽고(lib/fourcutCompose.ts) 프레임 장식은 서버가 그리므로,
    저장본에는 있는 것이 이 미리보기에는 없다. 그대로 두면 사용자는 배경이 남은 그림을 본 뒤
    확인한 적 없는 배경 제거 결과를 내려받는다.
  */
  it("합성이 끝나면 원본 미리보기 대신 저장된 결과를 보여준다", async () => {
    render(<ShootResultPage />);

    const output = await screen.findByAltText("완성된 네컷 결과");
    expect(output).toHaveAttribute("src", "https://example.com/image");
    // 둘을 같이 두면 어느 쪽이 저장본인지 화면이 말해 주지 않는다.
    expect(screen.queryByTestId("frame-preview")).not.toBeInTheDocument();
  });

  it("비회원도 브라우저가 그린 그 그림을 그대로 보여준다", async () => {
    useGuestTrialStore.setState({ accessMode: "guest" });

    render(<ShootResultPage />);

    const output = await screen.findByAltText("완성된 네컷 결과");
    // 비회원 결과물은 이 blob 이 전부다 — 내려받는 것도 화면에 뜨는 것도 같은 그림이어야 한다.
    expect(output).toHaveAttribute("src", "blob:generated-image");
  });

  // 회원 완성본 주소는 만료되는 조회 URL 이고, 비회원 것은 새로고침에 죽는 blob 이다.
  // 빈 사각형을 남기느니 구도 미리보기라도 세운다.
  it("완성본을 못 불러오면 미리보기로 되돌아간다", async () => {
    render(<ShootResultPage />);

    fireEvent.error(await screen.findByAltText("완성된 네컷 결과"));

    expect(await screen.findByTestId("frame-preview")).toBeInTheDocument();
  });

  it("합성이 실패하면 사유를 보여주고, 다시 준비하기가 실제로 다시 시도한다", async () => {
    mockSaveFourcutToServer.mockRejectedValueOnce(new Error("boom"));

    render(<ShootResultPage />);

    await waitFor(() => {
      expect(
        screen.getByText("이미지를 준비하지 못했어요. 다시 시도해 주세요."),
      ).toBeInTheDocument();
    });

    // 실패했을 때 imageResult 는 이미 null 이라, 재시도가 상태를 비우는 것만으로는
    // effect 의존성이 하나도 안 바뀐다. 그래서 예전에는 눌러도 아무 일이 없었다.
    fireEvent.click(screen.getByRole("button", { name: "다시 준비하기" }));

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(2);
    });
  });

  /*
    ── 회귀: 재시도는 같은 멱등키로 간다 ──

    합성은 이미 끝났는데 그 뒤(다운로드 주소 조회, 폴링 시간 초과) 실패하면 화면은
    재시도 가능한 오류가 된다. 이때 새 멱등키로 다시 보내면 서버가 기존 작업을 재생하지
    못하고 새로 그려서, 같은 네컷이 보관함에 두 벌 남는다.
    재실행용 nonce 는 effect 를 다시 돌리는 데만 쓰고 멱등키에는 닿지 않아야 한다.
  */
  it("재시도해도 멱등키는 그대로다", async () => {
    mockSaveFourcutToServer.mockRejectedValueOnce(new Error("download url failed"));

    render(<ShootResultPage />);

    await waitFor(() => {
      expect(
        screen.getByText("이미지를 준비하지 못했어요. 다시 시도해 주세요."),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "다시 준비하기" }));

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(2);
    });
    expect(mockSaveFourcutToServer.mock.calls[1][0].idempotencyKey).toBe(
      mockSaveFourcutToServer.mock.calls[0][0].idempotencyKey,
    );
  });

  /*
    ── 회귀: 페이지를 다시 열어도 멱등키는 그대로다 ──

    결과를 기다리는 중에 '사진 다시 고르기'나 브라우저 뒤로가기로 화면을 떠나면, effect 의
    cleanup 은 `cancelled` 만 세울 뿐 이미 나간 합성을 되돌리지 못한다 — 서버는 계속 그려
    보관함에 결과를 남긴다. 게다가 그 결과는 `cancelled` 때문에 세션에도 안 남는다.
    그 상태로 다시 들어왔을 때 새 멱등키를 잡으면 같은 네컷이 한 벌 더 접수돼 두 벌 남는다.
    재시도 버튼은 컴포넌트가 살아 있어 키가 유지되지만, 재진입은 새 마운트라 유지되지 않는다.
  */
  it("페이지를 나갔다 다시 들어와도 멱등키는 그대로다", async () => {
    // 결과가 세션에 박히기 전에 떠나는 상황이다 — 첫 합성은 끝내지 않고 붙잡아 둔다.
    mockSaveFourcutToServer.mockImplementation(() => new Promise(() => {}));

    const view = render(<ShootResultPage />);
    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });

    // 화면을 떠난다. 서버 쪽 합성은 이 시점에도 계속 돌고 있다.
    view.unmount();

    // 같은 사진·같은 프레임으로 결과 화면에 다시 들어온다.
    render(<ShootResultPage />);
    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(2);
    });

    expect(mockSaveFourcutToServer.mock.calls[1][0].idempotencyKey).toBe(
      mockSaveFourcutToServer.mock.calls[0][0].idempotencyKey,
    );
  });

  it("다시 해도 소용없는 실패에서는 재시도 대신 프레임을 다시 고르게 한다", async () => {
    mockSaveFourcutToServer.mockRejectedValueOnce(new Error("nope"));
    mockDescribeComposeFailure.mockReturnValue({
      message: "고른 프레임을 찾을 수 없어요. 프레임을 다시 골라 주세요.",
      retryable: false,
    });

    render(<ShootResultPage />);

    await waitFor(() => {
      expect(
        screen.getByText("고른 프레임을 찾을 수 없어요. 프레임을 다시 골라 주세요."),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: "다시 준비하기" }),
    ).not.toBeInTheDocument();

    /*
      **사진을 두고** 프레임 화면으로 간다. 예전에는 `/shoot` 이 세션을 통째로 reset() 해서
      찍은 8장까지 지웠고(app/shoot/page.tsx), 화면 문구("다른 프레임을 골라 주세요")는
      사진이 남는다고 읽혀서 어긋났다. 이제 `keepShots=1` 로 보내고, 사진을 쓸 수 있는지
      (슬롯 비율이 같은지)는 /shoot 이 판단한다 — 그래서 여기서는 경고할 것이 없다.
    */
    fireEvent.click(screen.getByRole("button", { name: "프레임 다시 고르기" }));

    expect(mockPush).toHaveBeenCalledWith("/shoot?keepShots=1");
    // 잃는 것이 없으므로 확인 안내도 뜨지 않는다.
    expect(useGuestTrialStore.getState().notice).toBeNull();
  });

  it("게스트가 로그인으로 이동하면 결과물을 보관하고 resumeSave 경로로 넘긴다", async () => {
    useGuestTrialStore.setState({ accessMode: "guest" });

    render(<ShootResultPage />);

    // 게스트 결과물은 메모리 blob으로만 만들어진다. 생성이 끝난 뒤에 눌러야 한다.
    await waitFor(() => {
      expect(mockUseShootSession.getState().imageResult).not.toBeNull();
    });

    const loginButton = await screen.findByRole("button", {
      name: "로그인하고 저장하기",
    });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(mockSetPendingGuestSave).toHaveBeenCalledTimes(1);
    });

    // 비회원은 이 시점에 서버를 부르지 않는다 — 로그인 후 GuestTrialBridge 가 합성한다.
    expect(mockSaveFourcutToServer).not.toHaveBeenCalled();

    // 보관하는 것은 완성본이 아니라 **원본 4장과 만드는 방법**이다.
    expect(mockSetPendingGuestSave.mock.calls[0][0]).toMatchObject({
      sources: ["/shot-1.png", "/shot-2.png", "/shot-3.png", "/shot-4.png"],
      frameId: "classic-4",
      outputFilter: "NONE",
      // 고른 색까지 넘겨야 로그인 후 재합성이 같은 색으로 그린다.
      // 빠지면 서버가 프레임 기본 배경으로 그려, 방금 내려받은 그림과 색이 갈린다.
      backgroundColor: "#111827",
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        "/login?redirectTo=%2Fhome%3FresumeSave%3D1",
      );
    });
  });

  it("게스트 보관에 실패하면 로그인으로 넘기지 않고 안내한다", async () => {
    useGuestTrialStore.setState({ accessMode: "guest" });
    mockSetPendingGuestSave.mockResolvedValue(false);

    render(<ShootResultPage />);

    // 게스트 결과물은 메모리 blob으로만 만들어진다. 생성이 끝난 뒤에 눌러야 한다.
    await waitFor(() => {
      expect(mockUseShootSession.getState().imageResult).not.toBeNull();
    });

    const loginButton = await screen.findByRole("button", {
      name: "로그인하고 저장하기",
    });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "결과를 보관하지 못했어요",
      );
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  /*
    보관하는 것은 완성본이 아니라 **원본 4장과 만드는 방법**이다(lib/pendingGuestSave.ts).
    그래서 완성본이 아직 없어도 만들어진다 — 예전에는 완성본이 없으면 보관을 건너뛰고
    로그인으로 보내서, 결과를 기다리다 누른 사람은 로그인 뒤에 이어받을 것이 없었다.
  */
  it("게스트가 합성이 끝나기 전에 눌러도 원본 4장을 보관한다", async () => {
    useGuestTrialStore.setState({ accessMode: "guest" });
    // 아직 그리는 중인 순간을 붙잡아 둔다.
    mockComposeFramePng.mockReturnValue(new Promise(() => {}));

    render(<ShootResultPage />);

    const loginButton = await screen.findByRole("button", {
      name: "로그인하고 저장하기",
    });
    expect(mockUseShootSession.getState().imageResult).toBeNull();

    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(mockSetPendingGuestSave).toHaveBeenCalledTimes(1);
    });
    expect(mockSetPendingGuestSave.mock.calls[0][0]).toMatchObject({
      sources: ["/shot-1.png", "/shot-2.png", "/shot-3.png", "/shot-4.png"],
      frameId: "classic-4",
      backgroundColor: "#111827",
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        "/login?redirectTo=%2Fhome%3FresumeSave%3D1",
      );
    });
  });

  // 합성이 실패해도 재료는 그대로다. 여기서 보관을 건너뛰면 실패 화면에서 로그인한
  // 사람만 사진을 통째로 잃는다.
  it("게스트 합성이 실패한 뒤에 눌러도 원본 4장을 보관한다", async () => {
    useGuestTrialStore.setState({ accessMode: "guest" });
    mockComposeFramePng.mockRejectedValue(new Error("compose failed"));

    render(<ShootResultPage />);

    await waitFor(() => {
      expect(
        screen.getByText("이미지를 준비하지 못했어요. 다시 시도해 주세요."),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "로그인하고 저장하기" }),
    );

    await waitFor(() => {
      expect(mockSetPendingGuestSave).toHaveBeenCalledTimes(1);
    });
    expect(mockSetPendingGuestSave.mock.calls[0][0]).toMatchObject({
      sources: ["/shot-1.png", "/shot-2.png", "/shot-3.png", "/shot-4.png"],
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        "/login?redirectTo=%2Fhome%3FresumeSave%3D1",
      );
    });
  });

  /*
    촬영본은 메모리에만 있다. 결과가 보관함에 남기 전에 새로고침하면 회원도 원본을
    통째로 잃는데, 예전에는 비회원에게만 경고가 걸려 있었다.
  */
  it("회원도 결과가 보관함에 남기 전에는 이탈을 경고한다", async () => {
    mockSaveFourcutToServer.mockReturnValue(new Promise(() => {}));

    render(<ShootResultPage />);
    await screen.findByText("결과 준비 중");

    const pending = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(pending);
    expect(pending.defaultPrevented).toBe(true);
  });

  it("회원 결과가 보관함에 남은 뒤에는 이탈을 막지 않는다", async () => {
    render(<ShootResultPage />);
    await waitFor(() => {
      expect(mockUseShootSession.getState().imageResult).not.toBeNull();
    });

    const settled = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(settled);
    expect(settled.defaultPrevented).toBe(false);
  });

  // 이 케이스는 원래 업로드 결과 화면 테스트에만 있었다. 그 화면을 지우면서 함께 사라지면
  // "실패를 alert 로 띄우지 않는다"는 방어가 통째로 없어져서 촬영 쪽으로 옮겨 왔다.
  it("다운로드에 실패하면 alert 대신 전역 안내를 띄운다", async () => {
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    mockGetMediaDownloadUrl.mockRejectedValue(new Error("download failed"));

    render(<ShootResultPage />);

    // 합성이 끝나야 다운로드 카드가 뜬다.
    await waitFor(() => {
      expect(mockUseShootSession.getState().imageResult).not.toBeNull();
    });

    const downloadButton = await screen.findByRole("button", {
      name: "이미지 다운로드",
    });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "이미지를 다운로드하지 못했어요",
      );
    });
    expect(alertSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  /*
    앱에서 사진첩 권한이 막힌 저장은 재시도로 풀리지 않는다.

    폴백(`잠시 후 다시 시도해 주세요.`)만 띄우면 사용자는 설정을 열어야 한다는 것을 알 방법이
    없다. 네이티브가 code 를 붙여 보낸 실패만 그 사유를 그대로 띄운다
    (lib/nativeBridge.ts 의 NativeSaveError).
  */
  it("사진첩 권한이 막히면 네이티브 안내를 그대로 띄운다", async () => {
    // jest.clearAllMocks() 는 호출 기록만 지우고 구현은 남긴다 — 앞 테스트가 걸어 둔
    // 거절이 살아 있으면 downloadFromUrl 까지 가지도 못한 채 폴백 문구로 통과한다.
    mockGetMediaDownloadUrl.mockResolvedValue("https://example.com/download.png");
    mockDownloadFromUrl.mockRejectedValue(
      new NativeSaveError({
        reason: "설정에서 사진 접근을 허용해 주세요.",
        code: "photo-permission-blocked",
      }),
    );

    render(<ShootResultPage />);
    await waitFor(() => {
      expect(mockUseShootSession.getState().imageResult).not.toBeNull();
    });

    fireEvent.click(await screen.findByRole("button", { name: "이미지 다운로드" }));

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.message).toBe(
        "설정에서 사진 접근을 허용해 주세요.",
      );
    });
    expect(useGuestTrialStore.getState().notice?.title).toBe(
      "이미지를 다운로드하지 못했어요",
    );
    expect(mockDownloadFromUrl).toHaveBeenCalled();
  });

  // code 가 없는 실패는 네이티브 원문(영문·기기별 문구)일 수 있다. 화면에 새지 않는다.
  it("믿을 수 없는 저장 실패는 폴백 문구로 덮는다", async () => {
    mockGetMediaDownloadUrl.mockResolvedValue("https://example.com/download.png");
    mockDownloadFromUrl.mockRejectedValue(
      new NativeSaveError({ reason: "MediaLibrary is not available on this device" }),
    );

    render(<ShootResultPage />);
    await waitFor(() => {
      expect(mockUseShootSession.getState().imageResult).not.toBeNull();
    });

    fireEvent.click(await screen.findByRole("button", { name: "이미지 다운로드" }));

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "이미지를 다운로드하지 못했어요",
      );
    });
    expect(useGuestTrialStore.getState().notice?.message).toBe(
      "잠시 후 다시 시도해 주세요.",
    );
    expect(mockDownloadFromUrl).toHaveBeenCalled();
  });

  /*
    공유 실패는 두 갈래고, 사용자가 할 일이 다르다.

    링크를 못 만든 것은 잠시 뒤 다시 누르면 되지만, 링크는 만들어 놓고 브라우저가 복사를
    막은 것은(lib/share.ts 의 CopyFailedError) 복사를 허용하기 전에는 몇 번을 눌러도 같은
    자리에서 막힌다. 하나로 묶으면 그 사람은 기다렸다 다시 누르는 헛수고를 반복한다.
  */
  it("복사만 막힌 실패는 링크가 만들어졌다고 말한다", async () => {
    mockGetMediaDownloadUrl.mockResolvedValue("https://example.com/download.png");
    mockShareOrCopyLink.mockRejectedValue(new CopyFailedError());

    render(<ShootResultPage />);
    await waitFor(() => {
      expect(mockUseShootSession.getState().imageResult).not.toBeNull();
    });

    fireEvent.click(await screen.findByRole("button", { name: "공유 링크 만들기" }));

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "링크를 복사하지 못했어요",
      );
    });
    expect(useGuestTrialStore.getState().notice?.message).toBe(
      "링크는 만들었지만 브라우저가 복사를 막았어요. 브라우저에서 복사를 허용한 뒤 다시 눌러 주세요.",
    );
  });

  it("링크 주소를 못 받은 실패는 준비 실패로 말한다", async () => {
    mockGetMediaDownloadUrl.mockRejectedValue(new Error("presign failed"));

    render(<ShootResultPage />);
    await waitFor(() => {
      expect(mockUseShootSession.getState().imageResult).not.toBeNull();
    });

    fireEvent.click(await screen.findByRole("button", { name: "공유 링크 만들기" }));

    await waitFor(() => {
      expect(useGuestTrialStore.getState().notice?.title).toBe(
        "이미지 링크를 준비하지 못했어요",
      );
    });
    expect(useGuestTrialStore.getState().notice?.message).toBe(
      "잠시 후 다시 시도해 주세요.",
    );
    // 주소를 못 받았으면 공유까지 가지도 않는다 — 복사 안내가 뜨면 그것이 거짓말이다.
    expect(mockShareOrCopyLink).not.toHaveBeenCalled();
  });

  /*
    고른 배경색은 합성 요청에 실려 가야 한다(`ComposeRequest.backgroundColor`).
    보내지 않으면 서버가 프레임에 저장된 배경으로 그려서, 화면에서 고른 색과
    내려받는 파일의 색이 서로 다른 그림이 된다.
  */
  it("회원 저장에 고른 배경색을 실어 보낸다", async () => {
    mockSaveFourcutToServer.mockResolvedValue({
      mediaId: 7,
      objectUrl: "https://example.com/a.png",
      downloadUrl: "https://example.com/a.png",
      displayName: "harucut",
    });

    render(<ShootResultPage />);

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });
    expect(mockSaveFourcutToServer).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundColor: "#111827" }),
    );
  });

  /*
    색을 바꾸면 다시 만들어야 한다.

    서버는 같은 멱등키로 색만 바꿔 보내면 **기존 작업을 그대로 재생한다.** 그래서 색이
    합성 키에 들어 있지 않으면, 사용자가 색을 바꿔도 예전 색 그대로인 그림이 나온다.
    (예전에는 반대로 색을 키에서 빼는 것이 맞았다 — 그때는 서버가 색을 받지 않았고,
     늦게 도착하는 서버 배경 조회 때문에 색이 저절로 바뀌어 합성이 두 번 돌았다.
     그 조회를 걷어냈으므로 이제 색은 사용자가 바꿀 때만 바뀐다.)
  */
  it("배경색을 바꾸면 새로 합성한다", async () => {
    mockSaveFourcutToServer.mockResolvedValue({
      mediaId: 7,
      objectUrl: "https://example.com/a.png",
      downloadUrl: "https://example.com/a.png",
      displayName: "harucut",
    });

    const view = render(<ShootResultPage />);
    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });

    // 사용자가 다른 색을 골랐다. 실제 스토어의 setBorderColor 는 색을 바꾸면서
    // imageResult 를 함께 비운다(lib/shootSessionStore.ts) — 그 동작을 그대로 흉내낸다.
    act(() => {
      mockUseShootSession.setState({ borderColor: "#ffffff", imageResult: null });
    });
    view.rerender(<ShootResultPage />);

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(2);
    });
    expect(mockSaveFourcutToServer).toHaveBeenLastCalledWith(
      expect.objectContaining({ backgroundColor: "#ffffff" }),
    );
  });

  /*
    ── 회귀: 꾸민 프레임의 테마가 늦게 도착해도 합성은 한 번이다 ──

    꾸민 프레임(remoteFrameId)으로 들어오면 themeData 가 비동기로 채워지면서
    effectiveBorderColor 를 한 번 바꾼다. 그런데 **회원 + 꾸민 프레임에서는 서버가 프레임에
    저장된 배경을 쓰므로 색이 결과를 바꾸지 않는다.** 그 값이 합성 키에 들어 있으면
    진행 중이던 작업이 버려지고 새 멱등키로 다시 돌아 보관함에 같은 네컷이 두 벌 남는다.
  */
  it("꾸민 프레임의 테마가 늦게 와도 합성을 두 번 하지 않는다", async () => {
    mockUseShootSession.setState({ remoteFrameId: 7 });
    mockSaveFourcutToServer.mockResolvedValue({
      mediaId: 7,
      objectUrl: "https://example.com/a.png",
      downloadUrl: "https://example.com/a.png",
      displayName: "harucut",
    });

    const view = render(<ShootResultPage />);
    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });

    // 테마가 도착하면서 배경색이 바뀐 순간.
    act(() => {
      mockThemeData = DECORATED_THEME;
    });
    view.rerender(<ShootResultPage />);

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });
  });

  /*
    ── 회귀: 프레임을 고치면 새 멱등키로 다시 만든다 ──

    `remoteFrameId` 는 내용을 고쳐도 그대로다(수정은 같은 id 로 가는 PUT 이다). 그래서 옛
    멱등키를 다시 보내면 서버가 **수정 전 작업을 재생한다** — 배경·스티커·누끼를 고치고
    돌아와도 고치기 전 그림이 나온다(docs/backend-contract.md D-4).
  */
  it("프레임 내용을 고치면 새 멱등키로 다시 합성한다", async () => {
    mockUseShootSession.setState({ remoteFrameId: 7 });
    mockThemeData = DECORATED_THEME;
    mockSaveFourcutToServer.mockResolvedValue({
      mediaId: 7,
      objectUrl: "https://example.com/a.png",
      downloadUrl: "https://example.com/a.png",
      displayName: "harucut",
    });

    const view = render(<ShootResultPage />);
    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });
    expect(mockSaveFourcutToServer).toHaveBeenLastCalledWith(
      expect.objectContaining({ idempotencyKey: "web-key-1" }),
    );

    // 사용자가 편집기에서 배경을 고치고 돌아왔다 → 같은 id, 다른 내용.
    act(() => {
      mockThemeData = EDITED_THEME;
    });
    view.rerender(<ShootResultPage />);

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(2);
    });
    // 키가 같으면 서버는 수정 전 작업을 그대로 재생한다.
    expect(mockSaveFourcutToServer).toHaveBeenLastCalledWith(
      expect.objectContaining({ idempotencyKey: "web-key-2" }),
    );
  });

  /*
    ── 회귀(반대쪽): 서명만 새로 받은 테마로는 다시 만들지 않는다 ──

    컴포넌트의 `renderUrl` 과 배경 `url` 은 조회할 때마다 값이 달라지는 서명 URL 이다.
    그것까지 지문에 넣으면 내용이 그대로인데도 매번 새 키가 나가, 같은 네컷이 보관함에
    두 벌 남는다(위 「테마가 늦게 와도」와 같은 실패다).
  */
  it("조회 서명만 바뀐 테마로는 다시 합성하지 않는다", async () => {
    mockUseShootSession.setState({ remoteFrameId: 7 });
    mockThemeData = DECORATED_THEME;
    mockSaveFourcutToServer.mockResolvedValue({
      mediaId: 7,
      objectUrl: "https://example.com/a.png",
      downloadUrl: "https://example.com/a.png",
      displayName: "harucut",
    });

    const view = render(<ShootResultPage />);
    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });

    act(() => {
      mockThemeData = RESIGNED_THEME;
    });
    view.rerender(<ShootResultPage />);

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });
  });

  /*
    ── 회귀: 진행 중 취소돼도 "처리 중"에 멈추지 않는다 ──

    합성 키는 비동기 작업을 시작하기 **전에** 찍힌다. 도중에 의존성이 바뀌면 그 실행은
    버려지는데, 다시 도는 effect 가 같은 키를 보고 "이미 했다"며 돌아가면 아무도 결과를
    만들지 않아 화면이 영원히 처리 중에 남는다.
  */
  it("진행 중이던 합성이 끊겨도 결과를 만들어 낸다", async () => {
    mockUseShootSession.setState({ remoteFrameId: 7 });

    let release: ((value: unknown) => void) | null = null;
    mockSaveFourcutToServer.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    const view = render(<ShootResultPage />);
    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });

    // 첫 합성이 아직 돌고 있는 동안 테마가 도착한다 → 그 실행은 버려진다.
    act(() => {
      mockThemeData = DECORATED_THEME;
    });
    view.rerender(<ShootResultPage />);

    // 버려진 실행이 키를 물고 있으면 두 번째 실행이 그냥 돌아가 버린다.
    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(2);
    });

    // 붙잡아 둔 합성을 풀어 준다. act 로 감싸야 그 뒤의 상태 변경까지 테스트가 기다린다.
    await act(async () => {
      release?.({
        mediaId: 7,
        objectUrl: "https://example.com/a.png",
        downloadUrl: "https://example.com/a.png",
        displayName: "harucut",
      });
    });

  });

  /*
    ── 회귀: 쿠키를 읽기 전에는 어느 쪽으로도 그리지 않는다 ──

    accessMode 의 초깃값은 "member" 라, 그 값으로 분기하면 진짜 비회원이 인증 전용
    서버 합성을 불러 401 을 맞는다. 그렇다고 초깃값을 게스트로 넘겨짚어도 안 된다 —
    브라우저가 그린 그림이 imageResult 에 박히면 회원인데도 기록에 아무것도 안 남는다.
    답은 넘겨짚지 않고 기다리는 것이다.
  */
  it("게스트 쿠키를 읽기 전에는 서버 합성도 브라우저 합성도 시작하지 않는다", async () => {
    useGuestTrialStore.setState({ accessMode: "member", hydrated: false });

    render(<ShootResultPage />);

    await waitFor(() => {
      expect(screen.getByTestId("frame-preview")).toBeInTheDocument();
    });
    expect(mockSaveFourcutToServer).not.toHaveBeenCalled();
    expect(mockComposeFramePng).not.toHaveBeenCalled();
  });

  /*
    ── 지금 알림이 실제로 덮는 범위 ──

    이 알림은 합성 응답을 받은 **뒤에** 도는 로컬 알림이라, 앱을 완전히 벗어나 OS 가
    WebView 의 JS 를 멈춘 경우는 덮지 못한다(그건 서버 푸시가 필요하다 —
    docs/app-shell-backend-requests.md 3번). 실제 계약이 무엇인지 못으로 박아 둔다.
  */
  it("문서가 가려져 있을 때만 완성 알림을 띄운다", async () => {
    stubVisibility("hidden");

    render(<ShootResultPage />);

    await waitFor(() => {
      expect(mockNativeNotify).toHaveBeenCalledTimes(1);
    });
    expect(mockNativeNotify).toHaveBeenCalledWith({
      title: "네컷이 완성됐어요",
      body: "눌러서 보러 가기",
    });
  });

  it("화면을 보고 있으면 알리지 않는다", async () => {
    render(<ShootResultPage />);

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });
    expect(mockNativeNotify).not.toHaveBeenCalled();
  });
});

/*
  위 화면 테스트는 세션 스토어를 목으로 갈아 끼운다. 그래서 "키를 세션이 들고 있다"까지는
  보여 주지만, **입력이 바뀌면 키를 새로 잡는다**는 반대쪽 안전장치는 진짜 구현으로 봐야 한다.
  옛 키를 그대로 다시 보내면 서버가 예전 작업을 재생해서, 새 사진을 골라도 예전 그림이 나온다.
*/
describe("useShootSession.ensureComposeIdempotencyKey", () => {
  const { useShootSession: useRealShootSession } = jest.requireActual<
    typeof import("@/lib/shootSessionStore")
  >("@/lib/shootSessionStore");

  beforeEach(() => {
    mockIdempotencyKeySeq = 0;
    useRealShootSession.getState().reset();
  });

  it("같은 입력이면 같은 키, 입력이 바뀌면 새 키를 준다", () => {
    const ensure = useRealShootSession.getState().ensureComposeIdempotencyKey;

    expect(ensure("shot-a")).toBe("web-key-1");
    expect(ensure("shot-a")).toBe("web-key-1");
    expect(ensure("shot-b")).toBe("web-key-2");
  });

  it("세션을 초기화하면 다음 촬영은 새 키로 간다", () => {
    const ensure = useRealShootSession.getState().ensureComposeIdempotencyKey;

    expect(ensure("shot-a")).toBe("web-key-1");
    useRealShootSession.getState().reset();
    expect(ensure("shot-a")).toBe("web-key-2");
  });

  /*
    ── 프레임 **내용** 축 ──

    `generationKey` 는 프레임을 `remoteFrameId` 라는 맨 숫자로만 가리킨다. 내용을 고쳐도
    id 는 그대로라 이 축이 따로 필요하다. 세 갈래를 다 못으로 박아 둔다 — 하나만 어긋나도
    보관함에 두 벌이 남거나(과하게 새 키) 수정 전 그림이 나온다(모자라게 옛 키).
  */
  it("프레임을 아직 못 읽었으면 쓰던 키를 그대로 준다", () => {
    const ensure = useRealShootSession.getState().ensureComposeIdempotencyKey;

    expect(ensure("shot-a", DECORATED_THEME)).toBe("web-key-1");
    // 화면을 다시 열면 테마가 도착하기 전까지 내용을 모른다. 여기서 새 키를 잡으면
    // 진행 중인 합성이 버려지고 같은 네컷이 두 벌 접수된다.
    expect(ensure("shot-a", null)).toBe("web-key-1");
  });

  it("처음 읽은 프레임 내용은 키를 바꾸지 않고 새겨 둔다", () => {
    const ensure = useRealShootSession.getState().ensureComposeIdempotencyKey;

    expect(ensure("shot-a", null)).toBe("web-key-1");
    // 늦게 도착한 테마는 **지금 도는 작업이 쓴 내용**이다 — 새 키를 잡을 이유가 없다.
    expect(ensure("shot-a", DECORATED_THEME)).toBe("web-key-1");
    expect(useRealShootSession.getState().composeIdempotency?.frameContentKey).toBe(
      buildFrameContentKey(DECORATED_THEME),
    );
    // 그 뒤에 내용이 바뀌면 그때는 알아본다.
    expect(ensure("shot-a", EDITED_THEME)).toBe("web-key-2");
  });

  it("프레임 내용이 바뀌면 새 키를 잡고 수정 전 결과를 버린다", () => {
    const ensure = useRealShootSession.getState().ensureComposeIdempotencyKey;

    expect(ensure("shot-a", DECORATED_THEME)).toBe("web-key-1");
    useRealShootSession.getState().setImageResult({
      mediaId: 7,
      objectUrl: "https://example.com/before-edit.png",
      downloadUrl: "https://example.com/before-edit.png",
      displayName: "harucut",
    });

    expect(ensure("shot-a", EDITED_THEME)).toBe("web-key-2");
    // 그 그림은 수정 전 프레임으로 만든 것이다. 남겨 두면 화면이 다시 합성하지 않는다.
    expect(useRealShootSession.getState().imageResult).toBeNull();
  });

  it("조회 서명만 새로 받은 프레임은 같은 키를 쓴다", () => {
    const ensure = useRealShootSession.getState().ensureComposeIdempotencyKey;

    expect(ensure("shot-a", DECORATED_THEME)).toBe("web-key-1");
    expect(ensure("shot-a", RESIGNED_THEME)).toBe("web-key-1");
  });
});

/*
  지문은 **서버가 저장한 내용만** 담아야 한다. 렌더 전용 주소가 섞이면 내용이 그대로인데도
  키가 매번 바뀌고, 반대로 내용 필드를 빠뜨리면 고친 프레임이 옛 키로 나간다.
*/
describe("buildFrameContentKey", () => {
  it("못 읽은 프레임은 지문이 없다", () => {
    expect(buildFrameContentKey(null)).toBeNull();
  });

  it("조회 서명만 달라진 같은 프레임은 같은 지문이다", () => {
    expect(buildFrameContentKey(RESIGNED_THEME)).toBe(
      buildFrameContentKey(DECORATED_THEME),
    );
  });

  it("배경·스티커·누끼를 고치면 지문이 달라진다", () => {
    const base = buildFrameContentKey(DECORATED_THEME);

    expect(buildFrameContentKey(EDITED_THEME)).not.toBe(base);
    expect(
      buildFrameContentKey({
        ...DECORATED_THEME,
        cellCutouts: [true, false, false, false],
      }),
    ).not.toBe(base);
    expect(
      buildFrameContentKey({
        ...DECORATED_THEME,
        components: DECORATED_THEME.components.map((component) => ({
          ...component,
          x: component.x + 5,
        })),
      }),
    ).not.toBe(base);
  });

  it("styleJson 의 키 순서는 지문을 흔들지 않는다", () => {
    const withOrder = (styleJson: Record<string, unknown>) =>
      buildFrameContentKey({
        ...DECORATED_THEME,
        components: DECORATED_THEME.components.map((component) => ({
          ...component,
          styleJson,
        })),
      });

    expect(withOrder({ opacity: 0.5, rotationDeg: 3 })).toBe(
      withOrder({ rotationDeg: 3, opacity: 0.5 }),
    );
  });
});
