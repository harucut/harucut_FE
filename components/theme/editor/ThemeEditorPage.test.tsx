import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeEditorPage } from "@/components/theme/editor/ThemeEditorPage";

const mockPush = jest.fn();
const mockSetFrameId = jest.fn();
const mockExportJson = jest.fn();
const mockImportJson = jest.fn();
const mockResetPhotos = jest.fn();
const mockSetBackgroundColor = jest.fn();
const mockAddDraft = jest.fn();
const mockUpdateDraft = jest.fn();
const mockClientPost = jest.fn();
const mockUploadPresigned = jest.fn();
const mockRenderPreview = jest.fn();

let mockDraftId: string | null = null;
let mockDrafts: Array<{
  id: string;
  data: { frameId: string; components: unknown[] };
}> = [];

const editorStoreState = {
  setFrameId: mockSetFrameId,
  exportJson: mockExportJson,
  importJson: mockImportJson,
  resetPhotos: mockResetPhotos,
  backgroundColor: "111827",
  setBackgroundColor: mockSetBackgroundColor,
  components: [] as Array<{ hidden?: boolean }>,
};

function themeEditorStoreMock(
  selector: (s: typeof editorStoreState) => unknown,
) {
  return selector(editorStoreState);
}
(themeEditorStoreMock as unknown as { getState: () => typeof editorStoreState }).getState =
  () => editorStoreState;

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

jest.mock("@/lib/themeEditorStore", () => ({
  useThemeEditorStore: themeEditorStoreMock,
}));

jest.mock("@/lib/themeDraftStore", () => ({
  useThemeDraftStore: (selector: (s: unknown) => unknown) =>
    selector({
      drafts: mockDrafts,
      addDraft: mockAddDraft,
      updateDraft: mockUpdateDraft,
    }),
}));

jest.mock("@/lib/themeSessionStore", () => ({
  useThemeSession: () => ({ draftId: mockDraftId }),
}));

jest.mock("@/lib/clientApi", () => ({
  clientApi: { post: (...args: unknown[]) => mockClientPost(...args) },
}));

jest.mock("@/lib/presignedUploadApi", () => ({
  PRESIGNED_UPLOAD_TYPES: {
    FRAME: "FRAME",
    FRAME_COMPONENTS: "FRAME_COMPONENTS",
    PROFILE: "PROFILE",
    FOURCUT_VIDEO: "FOURCUT_VIDEO",
    FOURCUT_PHOTO: "FOURCUT_PHOTO",
  },
  uploadToS3WithPresigned: (...args: unknown[]) => mockUploadPresigned(...args),
}));

jest.mock("@/lib/canvas/renderThemePreview", () => ({
  renderThemePreviewPng: (...args: unknown[]) => mockRenderPreview(...args),
}));

describe("ThemeEditorPage save flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraftId = null;
    mockDrafts = [];
    editorStoreState.components = [];
    mockExportJson.mockReturnValue({
      frameId: "classic-4",
      background: { type: "COLOR", value: "111827" },
      components: [],
    });
    mockRenderPreview.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    mockUploadPresigned.mockResolvedValue({ key: "preview-key" });
    mockClientPost.mockResolvedValue({ ok: true });
  });

  it("updates existing draft when draft is selected", async () => {
    mockDraftId = "draft-1";
    mockDrafts = [
      {
        id: "draft-1",
        data: { frameId: "classic-4", components: [] },
      },
    ];

    render(<ThemeEditorPage frameId="classic-4" />);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(mockClientPost).toHaveBeenCalledTimes(1);
      expect(mockUploadPresigned).toHaveBeenCalledWith(
        expect.objectContaining({ type: "FRAME", isTemp: false }),
      );
      expect(mockUpdateDraft).toHaveBeenCalledTimes(1);
      expect(mockAddDraft).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/home");
    });
  });

  it("adds draft when no selected draft exists", async () => {
    render(<ThemeEditorPage frameId="classic-4" />);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(mockClientPost).toHaveBeenCalledTimes(1);
      expect(mockUploadPresigned).toHaveBeenCalledWith(
        expect.objectContaining({ type: "FRAME", isTemp: false }),
      );
      expect(mockAddDraft).toHaveBeenCalledTimes(1);
      expect(mockUpdateDraft).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/home");
    });
  });
});
