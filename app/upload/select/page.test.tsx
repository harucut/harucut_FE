import { fireEvent, render, waitFor } from "@testing-library/react";
import UploadSelectPage from "@/app/upload/select/page";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockAddMedia = jest.fn();
const mockUploadFourcutMedia = jest.fn();

const uploadSessionState = {
  frameId: "classic-4",
  remoteFrameId: null as number | null,
  media: [] as Array<{ type: "image" | "video"; src: string }>,
  selectedIndexes: [null, null, null, null] as Array<number | null>,
  borderColor: "#111827",
  outputFilter: "NONE",
  includeVideo: false,
  toggleSelect: jest.fn(),
  resetAll: jest.fn(),
  addMedia: mockAddMedia,
  setBorderColor: jest.fn(),
  setOutputFilter: jest.fn(),
  setIncludeVideo: jest.fn(),
};

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock("@/components/layout/PageHeader", () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

jest.mock("@/components/frame/FrameOutputOptionsPanel", () => ({
  FrameOutputOptionsPanel: () => <div data-testid="frame-output-options" />,
}));

jest.mock("@/components/frame/FrameSelectPanel", () => ({
  FrameSelectPanel: ({
    renderExtraControls,
  }: {
    renderExtraControls?: () => React.ReactNode;
  }) => <div>{renderExtraControls?.()}</div>,
}));

jest.mock("@/hooks/useRemoteFrameTheme", () => ({
  useRemoteFrameTheme: () => null,
}));

jest.mock("@/lib/themeBackground", () => ({
  resolveFrameBackgroundColor: (_theme: unknown, borderColor: string) => borderColor,
}));

jest.mock("@/lib/videoConversionQuotaStore", () => ({
  useVideoConversionQuotaStore: (selector: (state: { usedCount: number; limit: number }) => unknown) =>
    selector({ usedCount: 0, limit: 3 }),
}));

jest.mock("@/lib/uploadSessionStore", () => ({
  useUploadSession: () => uploadSessionState,
}));

jest.mock("@/lib/presignedUploadApi", () => ({
  SUPPORTED_FOURCUT_ACCEPT: "image/png,video/mp4,video/webm",
  uploadFourcutMedia: (...args: unknown[]) => mockUploadFourcutMedia(...args),
}));

describe("UploadSelectPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uploadSessionState.media = [];
    uploadSessionState.selectedIndexes = [null, null, null, null];
    uploadSessionState.frameId = "classic-4";
  });

  it("uploads selected files before adding them to the session", async () => {
    mockUploadFourcutMedia.mockResolvedValueOnce({
      mediaId: 11,
      objectUrl: "https://example.com/source.png",
      downloadUrl: "https://example.com/source.png?sig=1",
    });

    const { container } = render(<UploadSelectPage />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;

    expect(input).not.toBeNull();

    const file = new File(["image"], "source.png", { type: "image/png" });
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(mockUploadFourcutMedia).toHaveBeenCalledWith(file);
    });

    await waitFor(() => {
      expect(mockAddMedia).toHaveBeenCalledWith([
        { type: "image", src: "https://example.com/source.png?sig=1" },
      ]);
    });
  });
});
