import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { create } from "zustand";
import ShootResultPage from "@/app/shoot/result/page";
import type { GeneratedFourcutAsset } from "@/lib/fourcutOutput";
import { useGuestTrialStore } from "@/lib/guestTrialStore";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockComposeFramePng = jest.fn();
const mockSaveFourcutToServer = jest.fn();
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();
const mockSetPendingGuestSave = jest.fn();

type MockShootSessionState = {
  frameId: string | null;
  remoteFrameId: number | null;
  shots: string[];
  selectedIndexes: Array<number | null>;
  borderColor: string;
  outputFilter: "NONE";
  imageResult: GeneratedFourcutAsset | null;
  setImageResult: (imageResult: GeneratedFourcutAsset | null) => void;
  clearResults: () => void;
};

const mockUseShootSession = create<MockShootSessionState>((set) => ({
  frameId: "classic-4" as string | null,
  remoteFrameId: null as number | null,
  shots: ["/shot-1.png", "/shot-2.png", "/shot-3.png", "/shot-4.png"],
  selectedIndexes: [0, 1, 2, 3] as Array<number | null>,
  borderColor: "#111827",
  outputFilter: "NONE",
  imageResult: null,
  setImageResult: (imageResult) => set({ imageResult }),
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

jest.mock("@/components/frame/GeneratedAssetDownloadCard", () => ({
  GeneratedAssetDownloadCard: ({ onDownload }: { onDownload: () => void }) => (
    <div data-testid="generated-asset-card">
      <button type="button" onClick={onDownload}>
        이미지 다운로드
      </button>
    </div>
  ),
}));

jest.mock("@/hooks/useRemoteFrameTheme", () => ({
  useRemoteFrameTheme: () => null,
}));

jest.mock("@/lib/themeBackground", () => ({
  resolveFrameBackgroundColor: (_theme: unknown, borderColor: string) =>
    borderColor,
}));

jest.mock("@/lib/guards", () => ({
  isNotNull: (value: unknown) => value != null,
}));

jest.mock("@/lib/shootSessionStore", () => ({
  useShootSession: () => mockUseShootSession(),
}));

jest.mock("@/lib/canvas/composeFrame", () => ({
  composeFramePng: (...args: unknown[]) => mockComposeFramePng(...args),
  downloadBlob: jest.fn(),
  downloadFromUrl: jest.fn(),
}));

jest.mock("@/lib/pendingGuestSave", () => ({
  setPendingGuestSave: (...args: unknown[]) => mockSetPendingGuestSave(...args),
}));

jest.mock("@/lib/fourcutProcessing", () => ({
  saveFourcutToServer: (...args: unknown[]) => mockSaveFourcutToServer(...args),
}));

const mockGetMediaDownloadUrl = jest.fn();

jest.mock("@/lib/userMediaApi", () => ({
  updateMediaDisplayName: jest.fn(),
  getMediaDownloadUrl: (...args: unknown[]) => mockGetMediaDownloadUrl(...args),
}));

jest.mock("@/lib/share", () => ({
  shareOrCopyLink: jest.fn(),
}));

describe("ShootResultPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateObjectURL.mockReturnValue("blob:generated-image");
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;
    mockSetPendingGuestSave.mockReturnValue(true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["image"], { type: "image/png" }),
    }) as unknown as typeof fetch;
    useGuestTrialStore.setState({ accessMode: "member", notice: null });

    mockUseShootSession.setState({
      frameId: "classic-4",
      remoteFrameId: null,
      shots: ["/shot-1.png", "/shot-2.png", "/shot-3.png", "/shot-4.png"],
      selectedIndexes: [0, 1, 2, 3],
      borderColor: "#111827",
      outputFilter: "NONE",
      imageResult: null,
    });

    mockComposeFramePng.mockResolvedValue(
      new Blob(["image"], { type: "image/png" }),
    );
    mockSaveFourcutToServer.mockImplementation(
      async ({ displayName }: { file: File; displayName: string }) => ({
        mediaId: 1,
        objectUrl: "https://example.com/image",
        downloadUrl: "https://example.com/image",
        displayName,
      }),
    );
  });

  it("generates the fourcut image once", async () => {
    render(<ShootResultPage />);

    await waitFor(() => {
      expect(mockSaveFourcutToServer).toHaveBeenCalledTimes(1);
    });

    expect(mockComposeFramePng).toHaveBeenCalledTimes(1);
    // 선택한 4장이 고른 순서 그대로 합성에 들어가야 한다.
    expect(mockComposeFramePng.mock.calls[0][0].sources).toEqual([
      { src: "/shot-1.png" },
      { src: "/shot-2.png" },
      { src: "/shot-3.png" },
      { src: "/shot-4.png" },
    ]);

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
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        "/login?redirectTo=%2Fhome%3FresumeSave%3D1",
      );
    });
  });

  it("게스트 보관에 실패하면 로그인으로 넘기지 않고 안내한다", async () => {
    useGuestTrialStore.setState({ accessMode: "guest" });
    mockSetPendingGuestSave.mockReturnValue(false);

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
});
