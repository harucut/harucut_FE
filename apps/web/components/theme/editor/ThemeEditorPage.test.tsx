import { fireEvent, render, waitFor } from "@testing-library/react";
import { ThemeEditorPage } from "@/components/theme/editor/ThemeEditorPage";

const mockPush = jest.fn();
const mockSetFrameId = jest.fn();
const mockExportJson = jest.fn();
const mockImportJson = jest.fn();
const mockResetPhotos = jest.fn();
const mockSetBackgroundColor = jest.fn();
const mockAddDraft = jest.fn();
const mockCreateFrame = jest.fn();
const mockUpdateFrame = jest.fn();
const mockDeleteFrame = jest.fn();
const mockGetFrame = jest.fn();
const mockUploadPresigned = jest.fn();
const mockRenderPreview = jest.fn();
const mockAlert = jest.fn();

let mockRemoteFrameId: number | null = null;

const editorStoreState = {
  setFrameId: mockSetFrameId,
  exportJson: mockExportJson,
  importJson: mockImportJson,
  resetPhotos: mockResetPhotos,
  background: { type: "COLOR" as const, value: "111827" },
  backgroundColor: "111827",
  setBackgroundColor: mockSetBackgroundColor,
  components: [] as Array<{ hidden?: boolean }>,
  cellCutouts: [false, false, false, false],
  frameId: "classic",
  finalizePhotosForSave: jest.fn().mockResolvedValue(undefined),
  hydrateDraft: jest.fn(),
};

function themeEditorStoreMock(
  selector: (s: typeof editorStoreState) => unknown,
) {
  return selector(editorStoreState);
}

(
  themeEditorStoreMock as unknown as { getState: () => typeof editorStoreState }
).getState = () => editorStoreState;

(
  themeEditorStoreMock as unknown as {
    subscribe: (listener: () => void) => () => void;
  }
).subscribe = () => () => {};

function getPrimarySaveButton(container: HTMLElement) {
  const button = Array.from(
    container.querySelectorAll("header button.hc-button-primary"),
  ).find((node) => node.textContent?.includes("저장")) as HTMLButtonElement | undefined;

  if (!button) {
    throw new Error("save button not found");
  }

  return button;
}

function getDialogSaveButton(container: HTMLElement) {
  const dialog = container.querySelector('[role="dialog"]');
  const button = Array.from(
    dialog?.querySelectorAll("button.hc-button-primary") ?? [],
  ).find((node) => node.textContent?.includes("저장")) as HTMLButtonElement | undefined;

  if (!button) {
    throw new Error("dialog save button not found");
  }

  return button;
}

function confirmSave(container: HTMLElement) {
  fireEvent.click(getPrimarySaveButton(container));
  fireEvent.click(getDialogSaveButton(container));
}

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/components/theme/editor/canvas/CanvasStage", () => ({
  CanvasStage: () => <div data-testid="canvas-stage" />,
}));

jest.mock("@/components/theme/editor/AssetPanel", () => ({
  AssetPanel: () => <div data-testid="asset-panel" />,
}));

jest.mock("@/components/theme/editor/LayersPanel", () => ({
  LayersPanel: () => <div data-testid="layers-panel" />,
}));

jest.mock("@/components/theme/editor/InspectorPanel", () => ({
  InspectorPanel: () => <div data-testid="inspector-panel" />,
}));

jest.mock("@/components/theme/editor/CutoutPanel", () => ({
  CutoutPanel: () => <div data-testid="cutout-panel" />,
}));

jest.mock("@/lib/themeEditorStore", () => ({
  useThemeEditorStore: themeEditorStoreMock,
}));

jest.mock("@/lib/themeDraftStore", () => ({
  useThemeDraftStore: (selector: (s: unknown) => unknown) =>
    selector({
      addDraft: mockAddDraft,
    }),
}));

jest.mock("@/lib/themeSessionStore", () => ({
  useThemeSession: () => ({
    remoteFrameId: mockRemoteFrameId,
  }),
}));

jest.mock("@/lib/remoteFrameApi", () => ({
  createFrame: (...args: unknown[]) => mockCreateFrame(...args),
  updateFrame: (...args: unknown[]) => mockUpdateFrame(...args),
  deleteFrame: (...args: unknown[]) => mockDeleteFrame(...args),
  getFrame: (...args: unknown[]) => mockGetFrame(...args),
}));

jest.mock("@/lib/presignedUploadApi", () => ({
  PRESIGNED_UPLOAD_TYPES: {
    FRAME: "FRAME",
    FRAME_COMPONENT: "FRAME_COMPONENT",
    PROFILE: "PROFILE",
    FOURCUT_PHOTO: "FOURCUT_PHOTO",
  },
  uploadToS3WithPresigned: (...args: unknown[]) => mockUploadPresigned(...args),
  SUPPORTED_IMAGE_ACCEPT: "image/png,image/jpeg,image/webp,image/gif",
  UNSUPPORTED_UPLOAD_MESSAGE: "PNG·JPG·WEBP·GIF만 올릴 수 있어요.",
  isSupportedUploadFile: (file: File) =>
    ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type),
}));

jest.mock("@/lib/canvas/renderThemePreview", () => ({
  renderThemePreviewPng: (...args: unknown[]) => mockRenderPreview(...args),
}));

describe("ThemeEditorPage save flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = mockAlert;
    mockRemoteFrameId = null;
    editorStoreState.components = [];
    editorStoreState.background = { type: "COLOR", value: "111827" };
    editorStoreState.backgroundColor = "111827";

    mockExportJson.mockReturnValue({
      frameId: "classic-4",
      background: { type: "COLOR", value: "111827" },
      components: [],
    });
    mockRenderPreview.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    mockUploadPresigned.mockResolvedValue({ key: "preview-key" });
    mockCreateFrame.mockResolvedValue(undefined);
    mockUpdateFrame.mockResolvedValue(undefined);
    mockGetFrame.mockResolvedValue({
      frameId: 7,
      title: "saved",
      frameType: "CLASSIC",
      background: { type: "COLOR", value: "111827" },
      components: [],
    });
  });

  it("adds a local draft when creating a new frame", async () => {
    const { container } = render(<ThemeEditorPage frameId="classic-4" />);

    confirmSave(container);

    await waitFor(() => {
      expect(mockCreateFrame).toHaveBeenCalledTimes(1);
      expect(mockUploadPresigned).toHaveBeenCalledWith(
        expect.objectContaining({ type: "FRAME" }),
      );
      expect(mockAddDraft).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/theme");
    });
  });

  it("updates a remote frame without touching local drafts", async () => {
    mockRemoteFrameId = 7;

    const { container } = render(<ThemeEditorPage frameId="classic-4" />);

    await waitFor(() => {
      expect(mockGetFrame).toHaveBeenCalledWith(7);
    });

    confirmSave(container);

    await waitFor(() => {
      expect(mockUpdateFrame).toHaveBeenCalledWith(7, expect.any(Object));
      expect(mockAddDraft).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/theme");
    });
  });

  it("blocks remote frame save when the initial load fails", async () => {
    mockRemoteFrameId = 7;
    mockGetFrame.mockRejectedValueOnce(new Error("load failed"));

    const { container } = render(<ThemeEditorPage frameId="classic-4" />);
    const saveButton = getPrimarySaveButton(container);

    await waitFor(() => {
      expect(mockGetFrame).toHaveBeenCalledWith(7);
      expect(saveButton).toBeDisabled();
    });

    fireEvent.click(saveButton);

    expect(mockUpdateFrame).not.toHaveBeenCalled();
    expect(mockCreateFrame).not.toHaveBeenCalled();
  });

  it("shows the plan limit message when frame creation is rejected with SUBS-003", async () => {
    mockCreateFrame.mockRejectedValueOnce({
      status: 403,
      data: {
        code: "SUBS-003",
        status: 403,
        message: "The number of stored frames exceeds the limit for the current plan.",
      },
    });

    const { container } = render(<ThemeEditorPage frameId="classic-4" />);

    confirmSave(container);

    await waitFor(() => {
      expect(container.textContent).toContain(
        "지금 요금제로는 프레임을 저장할 수 없어요. 기존 프레임을 지우거나 플랜을 올려 주세요.",
      );
    });
  });
});
