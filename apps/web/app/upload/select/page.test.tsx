import { fireEvent, render } from "@testing-library/react";
import UploadSelectPage from "@/app/upload/select/page";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockAddMedia = jest.fn();
const mockCreateObjectURL = jest.fn();

const uploadSessionState = {
  frameId: "classic-4",
  remoteFrameId: null as number | null,
  media: [] as Array<{ src: string }>,
  selectedIndexes: [null, null, null, null] as Array<number | null>,
  borderColor: "#111827",
  outputFilter: "NONE",
  toggleSelect: jest.fn(),
  resetAll: jest.fn(),
  addMedia: mockAddMedia,
  setBorderColor: jest.fn(),
  setOutputFilter: jest.fn(),
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

jest.mock("@/lib/uploadSessionStore", () => ({
  useUploadSession: () => uploadSessionState,
}));

jest.mock("@/lib/presignedUploadApi", () => ({
  SUPPORTED_IMAGE_ACCEPT: "image/png,image/jpeg,image/webp,image/gif",
  isSupportedUploadFile: (file: File) =>
    ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type),
}));

describe("UploadSelectPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateObjectURL.mockReturnValue("blob:preview-image");
    URL.createObjectURL = mockCreateObjectURL;
    uploadSessionState.media = [];
    uploadSessionState.selectedIndexes = [null, null, null, null];
    uploadSessionState.frameId = "classic-4";
  });

  it("adds selected files as local preview media without uploading them", () => {
    const { container } = render(<UploadSelectPage />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;

    expect(input).not.toBeNull();

    const file = new File(["image"], "source.png", { type: "image/png" });
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [file] },
    });

    expect(mockCreateObjectURL).toHaveBeenCalledWith(file);
    expect(mockAddMedia).toHaveBeenCalledWith([{ src: "blob:preview-image" }]);
  });

  it("skips unsupported formats and explains how many were dropped", () => {
    const { container } = render(<UploadSelectPage />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;

    const png = new File(["image"], "ok.png", { type: "image/png" });
    const heic = new File(["image"], "iphone.heic", { type: "image/heic" });

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [png, heic] },
    });

    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(mockCreateObjectURL).toHaveBeenCalledWith(png);
    expect(mockAddMedia).toHaveBeenCalledWith([{ src: "blob:preview-image" }]);
    expect(container.textContent).toContain("1개는 지원하지 않는 형식이라 제외했어요.");
  });

  it("adds nothing when every selected file is unsupported", () => {
    const { container } = render(<UploadSelectPage />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [new File(["image"], "shot.avif", { type: "image/avif" })],
      },
    });

    expect(mockAddMedia).not.toHaveBeenCalled();
    expect(mockCreateObjectURL).not.toHaveBeenCalled();
    expect(container.textContent).toContain("1개는 지원하지 않는 형식이라 제외했어요.");
  });
});
