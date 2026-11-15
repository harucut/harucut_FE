/**
 * 이 화면에서 났던 회귀 하나를 못박는다 — 꾸민 프레임의 내용을 못 읽으면 잠겨야 할
 * 배경색 고르기가 열렸다. 서버 합성은 remoteFrameId 만 보고 프레임에 저장된 배경을 쓰므로
 * (lib/fourcutCompose.ts 의 usesStoredBackground) 그때 고른 색은 저장되면서 버려진다.
 * 사용자에게는 "골랐는데 안 먹었다"로만 보이는 실패다.
 *
 * 그래서 잠금은 내용이 아니라 remoteFrameId 로 가른다. 조회 중에도 열지 않는다 —
 * 판정이 뒤집히는 순간 이미 고른 값이 사라진다.
 */
import type { MouseEvent, ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ShootSelectPage from "@/app/create/select/page";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
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
  borderColor: "#18181a",
  outputFilter: "NONE" as string,
  toggleSelect: noop,
  setBorderColor: jest.fn(),
  setOutputFilter: jest.fn(),
  source: "capture" as "capture" | "upload",
  resetShots: jest.fn(),
  importPhotos: jest.fn(),
};

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), prefetch: jest.fn() }),
}));

jest.mock("@/components/layout/PageHeader", () => ({
  PageHeader: ({
    title,
    backHref,
    backLabel,
    onBackClick,
  }: {
    title: ReactNode;
    backHref?: string;
    backLabel?: string;
    onBackClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <div>
      {title}
      {/* 이동은 진짜 Link 가 한다. 여기서는 눌렀을 때 함께 하는 일만 본다. */}
      {backHref ? (
        <a href={backHref} aria-label={backLabel} onClick={(event) => { event.preventDefault(); onBackClick?.(event); }} />
      ) : null}
    </div>
  ),
}));

// 사진 고르기 판은 대역으로 두되 **꾸미기 쪽은 진짜를 그린다** — 잠기는지 아닌지가 전부다.
jest.mock("@/components/frame/FrameSelectPanel", () => ({
  FrameSelectPanel: ({
    renderExtraControls,
    onAddPhotos,
    photosNotice,
  }: {
    renderExtraControls?: () => ReactNode;
    onAddPhotos?: () => void;
    photosNotice?: string | null;
  }) => (
    <div data-testid="frame-select-panel">
      {photosNotice ? <p data-testid="photos-notice">{photosNotice}</p> : null}
      {onAddPhotos ? <button type="button" onClick={onAddPhotos}>사진 불러오기</button> : null}
      {renderExtraControls?.()}
    </div>
  ),
}));

jest.mock("@/hooks/useRemoteFrameTheme", () => ({
  useRemoteFrameThemeState: () => mockThemeState,
}));

jest.mock("@/lib/shootSessionStore", () => ({
  useShootSession: () => mockShootSession,
}));

/** 테두리 색 견본 묶음. 꾸민 프레임이면 통째로 없다. */
const colorPicker = () => screen.queryByRole("group", { name: "테두리 색" });

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockThemeState, { data: null, error: null, isLoading: false });
  Object.assign(mockShootSession, { frameId: "grid-4", remoteFrameId: null, source: "capture", outputFilter: "NONE", shots: ["/shot-1.png"] });
  // 기본은 쿠키를 읽은 회원이다. 비회원 시험은 따로 바꾼다.
  useGuestTrialStore.setState({ accessMode: "member", hydrated: true });
});

test("꾸민 프레임의 조회가 실패해도 테두리 색 고르기는 잠긴 채다", () => {
  mockShootSession.remoteFrameId = 7;
  Object.assign(mockThemeState, { error: new Error("boom") });

  render(<ShootSelectPage />);

  expect(colorPicker()).toBeNull();
  // 못 바꾸는 까닭은 화면 위 배너 하나가 사실대로 말한다(다음 시험). 꾸미기 안에서 다시 말하지 않는다.
  expect(screen.getAllByRole("status")).toHaveLength(1);
});

test("조회에 실패하면 사실대로 말하고 다시 부를 길을 준다", () => {
  mockShootSession.remoteFrameId = 7;
  Object.assign(mockThemeState, { error: new Error("boom") });

  render(<ShootSelectPage />);

  expect(screen.getByRole("status")).toHaveTextContent(
    "프레임을 불러오지 못해 배경색을 바꿀 수 없어요.",
  );

  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(mockReload).toHaveBeenCalledTimes(1);
});

test("조회 중에는 열어 두지 않는다 — 곧 뒤집힐 판정이다", () => {
  mockShootSession.remoteFrameId = 7;
  Object.assign(mockThemeState, { isLoading: true });

  render(<ShootSelectPage />);

  expect(colorPicker()).toBeNull();
  // 아직 실패가 아니라 조회 중이다. 실패 배너를 미리 띄우지 않는다.
  expect(screen.queryByRole("status")).toBeNull();
  // 보정은 꾸민 프레임에서도 고른다.
  expect(screen.getByRole("group", { name: "보정" })).toBeInTheDocument();
});

test("꾸민 프레임을 읽어 왔으면 테두리는 프레임이 정한다 — 고르기를 두지 않는다", () => {
  mockShootSession.remoteFrameId = 7;
  Object.assign(mockThemeState, { data: theme });

  render(<ShootSelectPage />);

  expect(colorPicker()).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("group", { name: "보정" })).toBeInTheDocument();
});

test("꾸민 프레임을 안 쓰면 테두리 색을 고를 수 있다", () => {
  render(<ShootSelectPage />);

  expect(colorPicker()).not.toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});

test("견본을 누르면 세션에 '#rrggbb' 로 넣는다", () => {
  render(<ShootSelectPage />);

  fireEvent.click(screen.getByRole("button", { name: "블러시 핑크" }));
  expect(mockShootSession.setBorderColor).toHaveBeenCalledWith("#f4c6d0");
});

/*
  「다시 찍기」는 처음부터 새로 찍는다(2026-11-14). 찍은 사진을 들고 가면 촬영 화면이 다 찍은 것으로
  보고 이 화면으로 되돌린다 — 다시 찍을 길이 막힌다.
*/
test("다시 찍기는 찍은 사진을 비우고 촬영으로 간다", () => {
  render(<ShootSelectPage />);
  fireEvent.click(screen.getByRole("link", { name: "다시 찍기" }));
  expect(mockShootSession.resetShots).toHaveBeenCalledTimes(1);
});

// 새 탭으로 여는 클릭은 이 탭을 떠나지 않는다. 찍은 사진은 이 탭에만 있어 지우면 되찾을 길이 없다.
test.each([{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }])(
  "새 탭으로 여는 다시 찍기(%o)는 사진을 비우지 않는다",
  (init) => {
    render(<ShootSelectPage />);
    fireEvent.click(screen.getByRole("link", { name: "다시 찍기" }), init);
    expect(mockShootSession.resetShots).not.toHaveBeenCalled();
  },
);

// 「비회원이면 보정은 선택 못하도록 해」(2026-11-15). 견본은 잠긴 채 보이고, 남아 있던 보정은 기본으로 되돌린다.
test("비회원은 보정을 고를 수 없고, 고른 보정이 남아 있으면 기본으로 되돌린다", () => {
  useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });
  mockShootSession.outputFilter = "B&W";
  render(<ShootSelectPage />);

  expect(screen.getByText("회원 전용")).toBeInTheDocument();
  expect(mockShootSession.setOutputFilter).toHaveBeenCalledWith("NONE");
  // 테두리 색은 비회원도 고른다.
  expect(colorPicker()).not.toBeNull();
});

test("회원은 보정을 그대로 고른다", () => {
  mockShootSession.outputFilter = "B&W";
  render(<ShootSelectPage />);

  expect(screen.queryByText("회원 전용")).toBeNull();
  expect(mockShootSession.setOutputFilter).not.toHaveBeenCalled();
});

/*
  갤러리에서 불러오기(2026-11-15 「프레임 고르고 나면 바로 사진 고르기로 들어가서 거기서 올릴 수 있게」). 따로
  화면이 없고, 이 화면의 사진 목록 맨 앞 칸으로 불러온다. 회원에게만 그 칸이 있다.
*/
describe("갤러리에서 불러오기", () => {
  beforeEach(() => {
    Object.assign(mockShootSession, { source: "upload", shots: [] });
  });

  test("사진이 없어도 돌려보내지 않고, 회원에게 불러오기 칸과 안내를 준다", () => {
    render(<ShootSelectPage />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "사진 불러오기" })).toBeInTheDocument();
    expect(screen.getByTestId("photos-notice")).toHaveTextContent("고른 사진은 빈 칸부터 차례로 들어가요.");
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
  });

  test("뒤로가기는 불러온 사진을 들고 프레임을 다시 고른다", () => {
    render(<ShootSelectPage />);

    const back = screen.getByRole("link", { name: "프레임 다시 고르기" });
    expect(back).toHaveAttribute("href", "/create?source=upload&keepShots=1");
    fireEvent.click(back);
    expect(mockShootSession.resetShots).not.toHaveBeenCalled();
  });

  // 그 사이 비회원이 되면(세션이 끊겼다고 확인됨) 불러온 사진을 버리고 회원 전용 안내로 돌려보낸다.
  test("비회원이면 불러온 사진을 버리고 회원 전용 안내로 돌려보낸다", () => {
    mockShootSession.shots = ["/upload-1.png"];
    useGuestTrialStore.setState({ accessMode: "guest", hydrated: true });
    render(<ShootSelectPage />);

    expect(screen.queryByRole("button", { name: "사진 불러오기" })).toBeNull();
    expect(mockShootSession.resetShots).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/create?guestNotice=restricted&frame=grid-4");
  });

  test("찍은 사진(촬영)이 없으면 그대로 찍으러 돌아간다", () => {
    Object.assign(mockShootSession, { source: "capture", shots: [] });
    render(<ShootSelectPage />);

    expect(mockReplace).toHaveBeenCalledWith("/create/capture");
    expect(screen.queryByRole("button", { name: "사진 불러오기" })).toBeNull();
  });
});
