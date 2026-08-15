import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { create } from "zustand";
import UploadResultPage from "@/app/upload/result/page";
import type { FrameMedia } from "@/components/frame/FramePreview";
import type { GeneratedFourcutAsset } from "@/lib/fourcutOutput";
import { useGuestTrialStore } from "@/lib/guestTrialStore";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockComposeFramePng = jest.fn();
const mockUploadGeneratedFourcutFile = jest.fn();
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();
const mockGetMediaDownloadUrl = jest.fn();

type MockUploadSessionState = {
  frameId: string | null;
  remoteFrameId: number | null;
  media: FrameMedia[];
  selectedIndexes: Array<number | null>;
  borderColor: string;
  outputFilter: "NONE";
  imageResult: GeneratedFourcutAsset | null;
  setImageResult: (imageResult: GeneratedFourcutAsset | null) => void;
  clearResults: () => void;
};

const mockUseUploadSession = create<MockUploadSessionState>((set) => ({
  frameId: "classic-4" as string | null,
  remoteFrameId: null as number | null,
  media: [
    { src: "/image-1.png" },
    { src: "/image-2.png" },
    { src: "/image-3.png" },
    { src: "/image-4.png" },
  ],
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

jest.mock("@/lib/uploadSessionStore", () => ({
  useUploadSession: () => mockUseUploadSession(),
}));

jest.mock("@/lib/canvas/composeFrame", () => ({
  composeFramePng: (...args: unknown[]) => mockComposeFramePng(...args),
  downloadFromUrl: jest.fn(),
}));

jest.mock("@/lib/fourcutProcessing", () => ({
  uploadGeneratedFourcutFile: (...args: unknown[]) =>
    mockUploadGeneratedFourcutFile(...args),
}));

jest.mock("@/lib/userMediaApi", () => ({
  updateMediaDisplayName: jest.fn(),
  getMediaDownloadUrl: (...args: unknown[]) => mockGetMediaDownloadUrl(...args),
}));

jest.mock("@/lib/share", () => ({
  shareOrCopyLink: jest.fn(),
}));

describe("UploadResultPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateObjectURL.mockReturnValue("blob:generated-image");
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;
    mockGetMediaDownloadUrl.mockResolvedValue("https://example.com/image");
    useGuestTrialStore.setState({ accessMode: "member", notice: null });

    mockUseUploadSession.setState({
      frameId: "classic-4",
      remoteFrameId: null,
      media: [
        { src: "/image-1.png" },
        { src: "/image-2.png" },
        { src: "/image-3.png" },
        { src: "/image-4.png" },
      ],
      selectedIndexes: [0, 1, 2, 3],
      borderColor: "#111827",
      outputFilter: "NONE",
      imageResult: null,
    });

    mockComposeFramePng.mockResolvedValue(
      new Blob(["image"], { type: "image/png" }),
    );
    mockUploadGeneratedFourcutFile.mockImplementation(
      async ({ displayName }: { file: File; displayName: string }) => ({
        mediaId: 1,
        objectUrl: "https://example.com/image",
        downloadUrl: "https://example.com/image",
        displayName,
      }),
    );
  });

  it("generates the fourcut image once", async () => {
    render(<UploadResultPage />);

    await waitFor(() => {
      expect(mockUploadGeneratedFourcutFile).toHaveBeenCalledTimes(1);
    });

    expect(mockComposeFramePng).toHaveBeenCalledTimes(1);
    // 고른 4장이 순서 그대로 합성에 들어가야 한다.
    expect(mockComposeFramePng.mock.calls[0][0].sources).toEqual([
      { src: "/image-1.png" },
      { src: "/image-2.png" },
      { src: "/image-3.png" },
      { src: "/image-4.png" },
    ]);

    // 업로드 파일은 기본 표시 이름(harucut_YYYYMMDD_HHMMSS) + .png 규약을 따른다.
    const { file, displayName } = mockUploadGeneratedFourcutFile.mock.calls[0][0];
    expect(displayName).toMatch(/^harucut_\d{8}_\d{6}$/);
    expect(file.name).toBe(`${displayName}.png`);
    expect(file.type).toBe("image/png");
  });

  it("다운로드에 실패하면 alert 대신 전역 안내를 띄운다", async () => {
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    mockGetMediaDownloadUrl.mockRejectedValue(new Error("download failed"));

    render(<UploadResultPage />);

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
