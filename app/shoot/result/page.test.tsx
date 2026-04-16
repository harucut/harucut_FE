import { render, waitFor } from "@testing-library/react";
import { create } from "zustand";
import ShootResultPage from "@/app/shoot/result/page";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockConsumeVideoConversion = jest.fn();
const mockComposeFramePng = jest.fn();
const mockRecordFrameWebm = jest.fn();
const mockUploadGeneratedFourcutFile = jest.fn();
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();

const mockUseShootSession = create(() => ({
  frameId: "classic-4" as string | null,
  remoteFrameId: null as number | null,
  shots: [
    { photo: "/shot-1.png", video: "blob:shot-video-1" },
    { photo: "/shot-2.png" },
    { photo: "/shot-3.png" },
    { photo: "/shot-4.png" },
  ],
  selectedIndexes: [0, 1, 2, 3] as Array<number | null>,
  borderColor: "#111827",
  outputFilter: "NONE",
  includeVideo: true,
  imageResult: null as null | object,
  videoResult: null as null | object,
  setImageResult: (imageResult: unknown) =>
    mockUseShootSession.setState({ imageResult }),
  setVideoResult: (videoResult: unknown) =>
    mockUseShootSession.setState({ videoResult }),
  clearResults: jest.fn(() =>
    mockUseShootSession.setState({ imageResult: null, videoResult: null }),
  ),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock("@/components/layout/PageHeader", () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

jest.mock("@/components/layout/StepProgress", () => ({
  StepProgress: () => <div data-testid="step-progress" />,
}));

jest.mock("@/components/frame/FramePreview", () => ({
  FramePreview: () => <div data-testid="frame-preview" />,
}));

jest.mock("@/components/frame/GeneratedAssetDownloadCard", () => ({
  GeneratedAssetDownloadCard: () => <div data-testid="generated-asset-card" />,
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

jest.mock("@/lib/videoConversionQuotaStore", () => ({
  useVideoConversionQuotaStore: (
    selector: (state: {
      consume: () => void;
      usedCount: number;
      limit: number;
    }) => unknown,
  ) =>
    selector({
      consume: mockConsumeVideoConversion,
      usedCount: 0,
      limit: 3,
    }),
}));

jest.mock("@/lib/canvas/composeFrame", () => ({
  composeFramePng: (...args: unknown[]) => mockComposeFramePng(...args),
  recordFrameWebm: (...args: unknown[]) => mockRecordFrameWebm(...args),
  downloadFromUrl: jest.fn(),
}));

jest.mock("@/lib/fourcutProcessing", () => ({
  uploadGeneratedFourcutFile: (...args: unknown[]) =>
    mockUploadGeneratedFourcutFile(...args),
}));

jest.mock("@/lib/userMediaApi", () => ({
  updateMediaDisplayName: jest.fn(),
  getMediaDownloadUrl: jest.fn(),
}));

jest.mock("@/lib/share", () => ({
  shareOrCopyLink: jest.fn(),
}));

jest.mock("@/lib/fourcutVideo", () => ({
  MAX_FOURCUT_VIDEO_SECONDS: 8,
  TRIMMED_VIDEO_NOTICE: "trimmed",
  hasVideoSourceLongerThan: jest.fn().mockResolvedValue(false),
}));

describe("ShootResultPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateObjectURL.mockReturnValue("blob:generated-video");
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;

    mockUseShootSession.setState({
      frameId: "classic-4",
      remoteFrameId: null,
      shots: [
        { photo: "/shot-1.png", video: "blob:shot-video-1" },
        { photo: "/shot-2.png" },
        { photo: "/shot-3.png" },
        { photo: "/shot-4.png" },
      ],
      selectedIndexes: [0, 1, 2, 3],
      borderColor: "#111827",
      outputFilter: "NONE",
      includeVideo: true,
      imageResult: null,
      videoResult: null,
    });

    mockComposeFramePng.mockResolvedValue(
      new Blob(["image"], { type: "image/png" }),
    );
    mockRecordFrameWebm.mockResolvedValue(
      new Blob(["video"], { type: "video/webm" }),
    );
    mockUploadGeneratedFourcutFile.mockImplementation(
      async ({
        kind,
        displayName,
        extension,
      }: {
        kind: "IMAGE" | "VIDEO";
        displayName: string;
        extension: "png" | "mp4";
      }) => ({
        mediaId: kind === "IMAGE" ? 1 : 2,
        kind,
        objectUrl: `https://example.com/${kind.toLowerCase()}`,
        downloadUrl: `https://example.com/${kind.toLowerCase()}`,
        extension,
        displayName,
      }),
    );
  });

  it("starts the video generation flow only once after the image result updates the session", async () => {
    render(<ShootResultPage />);

    await waitFor(() => {
      const videoCalls = mockUploadGeneratedFourcutFile.mock.calls.filter(
        ([args]) => args.kind === "VIDEO",
      );
      expect(videoCalls).toHaveLength(1);
    });

    expect(mockRecordFrameWebm).toHaveBeenCalledTimes(1);
    expect(mockConsumeVideoConversion).toHaveBeenCalledTimes(1);
  });

  it("uses the same default display name for image and video outputs", async () => {
    render(<ShootResultPage />);

    await waitFor(() => {
      expect(mockUploadGeneratedFourcutFile).toHaveBeenCalledTimes(2);
    });

    const imageCall = mockUploadGeneratedFourcutFile.mock.calls.find(
      ([args]) => args.kind === "IMAGE",
    );
    const videoCall = mockUploadGeneratedFourcutFile.mock.calls.find(
      ([args]) => args.kind === "VIDEO",
    );

    expect(imageCall?.[0].displayName).toBe(videoCall?.[0].displayName);
    expect(imageCall?.[0].file.name).toBe(
      `${videoCall?.[0].displayName}.png`,
    );
    expect(videoCall?.[0].file.name).toBe(
      `${imageCall?.[0].displayName}.webm`,
    );
  });
});
