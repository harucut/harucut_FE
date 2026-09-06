/**
 * 이 화면에서 났던 회귀 하나를 못박는다 — 꾸민 프레임의 내용을 못 읽으면 잠겨야 할
 * 배경색 고르기가 열렸다. 서버 합성은 remoteFrameId 만 보고 프레임에 저장된 배경을 쓰므로
 * (lib/fourcutCompose.ts 의 usesStoredBackground) 그때 고른 색은 저장되면서 버려진다.
 * 사용자에게는 "골랐는데 안 먹었다"로만 보이는 실패다.
 *
 * 그래서 잠금은 내용이 아니라 remoteFrameId 로 가른다. 조회 중에도 열지 않는다 —
 * 판정이 뒤집히는 순간 이미 고른 값이 사라진다.
 */
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ShootSelectPage from "@/app/shoot/select/page";
import type { RemoteFrameThemeState } from "@/hooks/useRemoteFrameTheme";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

const mockReload = jest.fn();
const noop = jest.fn();

const theme: ThemeExportJson = {
  frameId: "grid-4",
  background: { type: "COLOR", value: "#112233" },
  components: [],
};

const mockThemeState: RemoteFrameThemeState = {
  data: null,
  error: null,
  isLoading: false,
  reload: mockReload,
};

const mockShootSession = {
  frameId: "grid-4" as string | null,
  remoteFrameId: null as number | null,
  shots: ["/shot-1.png"],
  selectedIndexes: [0, null, null, null] as Array<number | null>,
  borderColor: "#23262d",
  outputFilter: "NONE" as const,
  toggleSelect: noop,
  clearSelection: noop,
  setBorderColor: noop,
  setOutputFilter: noop,
  eventName: null as string | null,
  source: "capture" as const,
};

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

jest.mock("@/components/layout/PageHeader", () => ({
  PageHeader: ({ title }: { title: ReactNode }) => <div>{title}</div>,
}));

// 사진 고르기 판은 대역으로 두되 **출력 옵션은 진짜를 그린다** — 잠기는지 아닌지가 전부다.
jest.mock("@/components/frame/FrameSelectPanel", () => ({
  FrameSelectPanel: ({
    renderExtraControls,
  }: {
    renderExtraControls?: () => ReactNode;
  }) => <div data-testid="frame-select-panel">{renderExtraControls?.()}</div>,
}));

jest.mock("@/hooks/useRemoteFrameTheme", () => ({
  useRemoteFrameThemeState: () => mockThemeState,
}));

jest.mock("@/lib/shootSessionStore", () => ({
  useShootSession: () => mockShootSession,
}));

/** 색 고르기가 열려 있는지는 HEX 입력 한 칸으로 본다(잠기면 통째로 사라진다). */
const colorPicker = () => screen.queryByLabelText("배경색 고르기");

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockThemeState, { data: null, error: null, isLoading: false });
  Object.assign(mockShootSession, { frameId: "grid-4", remoteFrameId: null });
});

test("꾸민 프레임의 조회가 실패해도 배경색 고르기는 잠긴 채다", () => {
  mockShootSession.remoteFrameId = 7;
  Object.assign(mockThemeState, { error: new Error("boom") });

  render(<ShootSelectPage />);

  expect(colorPicker()).toBeNull();
  // 잠금 사유가 갈려야 한다 — "프레임이 배경을 정해 뒀다"가 아니라 "못 읽었다"다.
  expect(
    screen.getByText(/프레임 내용을 확인하지 못했어요/),
  ).toBeInTheDocument();
});

test("조회에 실패하면 사실대로 말하고 다시 부를 길을 준다", () => {
  mockShootSession.remoteFrameId = 7;
  Object.assign(mockThemeState, { error: new Error("boom") });

  render(<ShootSelectPage />);

  expect(screen.getByRole("status")).toHaveTextContent(
    "프레임을 불러오지 못해 배경색을 바꿀 수 없어요.",
  );

  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(mockReload).toHaveBeenCalledTimes(1);
});

test("조회 중에는 열어 두지 않는다 — 곧 뒤집힐 판정이다", () => {
  mockShootSession.remoteFrameId = 7;
  Object.assign(mockThemeState, { isLoading: true });

  render(<ShootSelectPage />);

  expect(colorPicker()).toBeNull();
  // 아직 실패가 아니라 조회 중이다. 실패 배너를 미리 띄우지 않는다.
  expect(screen.queryByRole("status")).toBeNull();
  expect(
    screen.getByText(/꾸민 프레임을 선택해서 배경 색상은/),
  ).toBeInTheDocument();
});

test("꾸민 프레임을 읽어 왔으면 프레임이 배경을 정한다고 말한다", () => {
  mockShootSession.remoteFrameId = 7;
  Object.assign(mockThemeState, { data: theme });

  render(<ShootSelectPage />);

  expect(colorPicker()).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
  expect(
    screen.getByText(/꾸민 프레임을 선택해서 배경 색상은/),
  ).toBeInTheDocument();
});

test("꾸민 프레임을 안 쓰면 배경색을 고를 수 있다", () => {
  render(<ShootSelectPage />);

  expect(colorPicker()).not.toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});
