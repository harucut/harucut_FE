import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeEditorPage } from "@/components/theme/editor/ThemeEditorPage";

const mockPush = jest.fn();
const mockSetFrameId = jest.fn();
const mockExportJson = jest.fn();
const mockImportJson = jest.fn();
const mockResetPhotos = jest.fn();
const mockAddDraft = jest.fn();
const mockUpdateDraft = jest.fn();

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

describe("ThemeEditorPage save flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraftId = null;
    mockDrafts = [];
    editorStoreState.components = [];
    mockExportJson.mockReturnValue({
      frameId: "classic-4",
      components: [],
    });
  });

  // 기존 draft를 선택한 상태라면 add가 아니라 update 분기를 타야 합니다.
  it("updates existing draft when draft is selected", () => {
    mockDraftId = "draft-1";
    mockDrafts = [
      {
        id: "draft-1",
        data: { frameId: "classic-4", components: [] },
      },
    ];

    render(<ThemeEditorPage frameId="classic-4" />);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(mockUpdateDraft).toHaveBeenCalledTimes(1);
    expect(mockAddDraft).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/home");
  });

  // 선택된 draft가 없으면 새 draft를 추가해야 합니다.
  it("adds draft when no selected draft exists", () => {
    render(<ThemeEditorPage frameId="classic-4" />);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(mockAddDraft).toHaveBeenCalledTimes(1);
    expect(mockUpdateDraft).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/home");
  });
});
