import { render, waitFor } from "@testing-library/react";
import ShootSelectPage from "@/app/shoot/select/page";
import ShootResultPage from "@/app/shoot/result/page";
import StickerEditorPage from "@/app/theme/sticker/page";
import type { FourcutFilterId } from "@/lib/frameFilters";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const noop = jest.fn();

const DEFAULT_FILTER: FourcutFilterId = "NONE";

const shootSessionState = {
  frameId: null as string | null,
  remoteFrameId: null as number | null,
  shots: [] as string[],
  selectedIndexes: [0, 1, 2, 3] as Array<number | null>,
  borderColor: "111827",
  outputFilter: DEFAULT_FILTER,
  imageResult: null,
  toggleSelect: noop,
  reset: noop,
  setBorderColor: noop,
  setOutputFilter: noop,
  clearResults: noop,
  setImageResult: noop,
};

const themeSessionState = {
  frameId: null as string | null,
  remoteFrameId: null as number | null,
};

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock("@/components/layout/PageHeader", () => ({
  PageHeader: ({ title, description }: { title: React.ReactNode; description?: React.ReactNode }) => (
    <div data-testid="page-header">
      <div>{title}</div>
      <div>{description}</div>
    </div>
  ),
}));

jest.mock("@/components/frame/FrameSelectPanel", () => ({
  FrameSelectPanel: () => <div data-testid="frame-select-panel" />,
}));

jest.mock("@/components/frame/FrameOutputOptionsPanel", () => ({
  FrameOutputOptionsPanel: () => <div data-testid="frame-output-options" />,
}));

jest.mock("@/components/frame/FramePreview", () => ({
  FramePreview: () => <div data-testid="frame-preview" />,
}));

jest.mock("@/components/frame/GeneratedAssetDownloadCard", () => ({
  GeneratedAssetDownloadCard: () => <div data-testid="generated-asset-card" />,
}));

jest.mock("@/components/theme/editor/ThemeEditorPage", () => ({
  ThemeEditorPage: ({ frameId }: { frameId: string }) => (
    <div data-testid="theme-editor-page">{frameId}</div>
  ),
}));

jest.mock("@/lib/themeBackground", () => ({
  DEFAULT_FRAME_BACKGROUND_COLOR: "111827",
  resolveFrameBackgroundColor: (_theme: unknown, borderColor: string) => borderColor,
}));

jest.mock("@/lib/shootSessionStore", () => ({
  useShootSession: () => shootSessionState,
}));

jest.mock("@/lib/themeSessionStore", () => ({
  useThemeSession: () => themeSessionState,
}));

describe("page-level multistep session guards", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    Object.assign(shootSessionState, {
      frameId: null,
      remoteFrameId: null,
      shots: [],
      selectedIndexes: [0, 1, 2, 3],
      borderColor: "111827",
      outputFilter: DEFAULT_FILTER,
      imageResult: null,
    });

    Object.assign(themeSessionState, {
      frameId: null,
      remoteFrameId: null,
    });
  });

  test("/shoot/select sends users back to /shoot when frameId is missing", async () => {
    shootSessionState.shots = ["/shot-1.png"];

    render(<ShootSelectPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/shoot");
    });
  });

  test("/shoot/select sends users back to /shoot/capture when shots are missing", async () => {
    shootSessionState.frameId = "classic-4";
    shootSessionState.shots = [];

    render(<ShootSelectPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/shoot/capture");
    });
  });

  test("/shoot/result sends users back to /shoot/select when 4 picks are not ready", async () => {
    shootSessionState.frameId = "classic-4";
    shootSessionState.shots = ["/shot-1.png"];
    shootSessionState.selectedIndexes = [0, null, null, null];

    render(<ShootResultPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/shoot/select");
    });
  });

  test("/shoot/result sends users back to /shoot/select when selected sources are missing", async () => {
    shootSessionState.frameId = "classic-4";
    shootSessionState.shots = ["/shot-1.png"];
    shootSessionState.selectedIndexes = [0, 1, 2, 3];

    render(<ShootResultPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/shoot/select");
    });
  });

  test("/theme/sticker sends users back to /theme when frameId is missing", async () => {
    render(<StickerEditorPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/theme");
    });
  });
});
