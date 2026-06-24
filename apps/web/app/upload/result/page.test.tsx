import { render, waitFor } from "@testing-library/react";
import { create } from "zustand";
import UploadResultPage from "@/app/upload/result/page";
import type { FrameMedia } from "@/components/frame/FramePreview";
import type { GeneratedFourcutAsset } from "@/lib/fourcutOutput";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockConsumeVideoConversion = jest.fn();
const mockComposeFramePng = jest.fn();
const mockRecordFrameWebm = jest.fn();
const mockUploadGeneratedFourcutFile = jest.fn();
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();

type MockUploadSessionState = {
  frameId: string | null;
  remoteFrameId: number | null;
  media: FrameMedia[];
  selectedIndexes: Array<number | null>;
  borderColor: string;
  outputFilter: "NONE";
  includeVideo: boolean;
  imageResult: GeneratedFourcutAsset | null;
  videoResult: GeneratedFourcutAsset | null;
  setImageResult: (imageResult: GeneratedFourcutAsset | null) => void;
  setVideoResult: (videoResult: GeneratedFourcutAsset | null) => void;
  clearResults: () => void;
};

const mockUseUploadSession = create<MockUploadSessionState>((set) => ({
  frameId: "classic-4" as string | null,
  remoteFrameId: null as number | null,
  media: [
    { type: "video" as const, src: "blob:video-1" },
    { type: "image" as const, src: "/image-2.png" },
    { type: "image" as const, src: "/image-3.png" },
    { type: "image" as const, src: "/image-4.png" },
  ],
  selectedIndexes: [0, 1, 2, 3] as Array<number | null>,
  borderColor: "#111827",
  outputFilter: "NONE",
  includeVideo: true,
  imageResult: null,
  videoResult: null,
  setImageResult: (imageResult) => set({ imageResult }),
  setVideoResult: (videoResult) => set({ videoResult }),
  clearResults: jest.fn(() => set({ imageResult: null, videoResult: null })),
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

jest.mock("@/lib/uploadSessionStore", () => ({
  useUploadSession: () => mockUseUploadSession(),
}));

jest.mock("@/lib/videoConversionQuotaStore", () => ({
  useVideoConversionQuotaStore: (
    selector: (state: {
      consume: () => void;
      usedCount: number;
      limit: number;
      unlimited: boolean;
    }) => unknown,
  ) =>
    selector({
      consume: mockConsumeVideoConversion,
      usedCount: 0,
      limit: 3,
      unlimited: false,
    }),
  useHydrateVideoConversionQuota: () => {},
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

describe("UploadResultPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateObjectURL.mockReturnValue("blob:generated-video");
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;

    mockUseUploadSession.setState({
      frameId: "classic-4",
      remoteFrameId: null,
      media: [
        { type: "video", src: "blob:video-1" },
        { type: "image", src: "/image-2.png" },
        { type: "image", src: "/image-3.png" },
        { type: "image", src: "/image-4.png" },
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
    render(<UploadResultPage />);

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
    render(<UploadResultPage />);

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
    const imageBaseName = imageCall?.[0].file.name.replace(/\.[^.]+$/, "");
    const videoBaseName = videoCall?.[0].file.name.replace(/\.[^.]+$/, "");
    expect(imageBaseName).toBe(videoBaseName);
  });
});
