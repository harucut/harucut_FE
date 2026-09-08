import { fireEvent, render, screen } from "@testing-library/react";
import ShootPage from "@/app/shoot/page";
import { useShootSession } from "@/lib/shootSessionStore";
import type { FrameId } from "@/constants/frames";

const mockPush = jest.fn();
let mockQuery = "";
let mockChosenFrameId: FrameId = "grid-4";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(mockQuery),
}));

jest.mock("@/hooks/useMyFrames", () => ({
  useMyFrames: () => ({ frames: [], isLoading: false, error: null, refresh: jest.fn() }),
}));

// 고르는 UI 는 FrameChooser 의 몫이라 확인 버튼만 남긴다. children 은 그대로 그린다 —
// 행사 배너가 거기로 들어가므로, 걷어내면 배너를 볼 수 없다.
jest.mock("@/components/frame/FrameChooser", () => ({
  FrameChooser: ({
    onConfirm,
    children,
  }: {
    onConfirm: (choice: { frameId: FrameId; remoteFrameId: number | null }) => void;
    children?: React.ReactNode;
  }) => (
    <div>
      {children}
      <button
        type="button"
        onClick={() => onConfirm({ frameId: mockChosenFrameId, remoteFrameId: null })}
      >
        확인
      </button>
    </div>
  ),
}));

const SHOTS = ["data:1", "data:2", "data:3", "data:4"];

/** 결과 화면이 `keepShots=1` 로 돌려보낸 상태 — 사진을 들고 프레임 화면에 선다. */
function renderWithKeptShots(source: "camera" | "upload") {
  mockQuery = source === "upload" ? "source=upload&keepShots=1" : "keepShots=1";
  useShootSession.setState({
    shots: SHOTS,
    shotsFrameId: "classic-4",
    source,
  });
  render(<ShootPage />);
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
}

describe("프레임을 다시 고를 때 들고 온 사진", () => {
  beforeEach(() => {
    mockPush.mockClear();
    // 기본은 비율이 크게 다른 짝(classic-4 1.42 → grid-4 0.71).
    mockChosenFrameId = "grid-4";
    useShootSession.getState().reset();
  });

  /*
    갤러리 사진은 원본 비율 그대로 담긴다(lib/photoImport.ts). 자르기는 미리보기·합성이
    새 프레임 기준으로 하므로 비율이 달라도 그대로 쓸 수 있다 — 예전에는 여기서
    비율만 보고 지워, 28장을 고른 사람이 다시 고르러 가야 했다.
  */
  it("업로드 사진은 슬롯 비율이 달라져도 남는다", () => {
    renderWithKeptShots("upload");
    expect(useShootSession.getState().shots).toEqual(SHOTS);
    expect(mockPush).toHaveBeenCalledWith("/shoot/select");
  });

  it("촬영본은 슬롯 비율이 달라지면 비우고 다시 촬영으로 보낸다", () => {
    renderWithKeptShots("camera");
    expect(useShootSession.getState().shots).toEqual([]);
    expect(mockPush).toHaveBeenCalledWith("/shoot/capture");
  });

  it("촬영본도 슬롯 비율이 같으면 그대로 쓴다", () => {
    // classic-4(1.42) → wide-4(1.41).
    mockChosenFrameId = "wide-4";
    renderWithKeptShots("camera");
    expect(useShootSession.getState().shots).toEqual(SHOTS);
    expect(mockPush).toHaveBeenCalledWith("/shoot/select");
  });
});

const EVENT_NAME = "여름 팬미팅";

/** 한 SPA 세션 안에서 `/shoot` 에 다시 서는 것 — 스토어는 모듈 수준이라 그대로 남는다. */
function enterShoot(query: string) {
  mockQuery = query;
  return render(<ShootPage />);
}

describe("행사 이름", () => {
  beforeEach(() => {
    mockPush.mockClear();
    useShootSession.getState().reset();
  });

  it("행사 쿼리로 들어오면 배너에 행사 이름이 뜬다", () => {
    enterShoot(`frame=classic-4&event=${encodeURIComponent(EVENT_NAME)}`);
    expect(useShootSession.getState().eventName).toBe(EVENT_NAME);
    expect(screen.getByText(EVENT_NAME)).toBeInTheDocument();
  });

  /*
    결과 화면이 "다른 프레임으로" 로 돌려보내는 길에는 행사 쿼리가 없다(result/page.tsx).
    같은 촬영을 이어 가는 것이므로 행사 맥락은 남아야 한다.
  */
  it("keepShots=1 로 이어 가면 행사 이름을 물려받는다", () => {
    enterShoot(`frame=classic-4&event=${encodeURIComponent(EVENT_NAME)}`).unmount();

    enterShoot("keepShots=1");

    expect(useShootSession.getState().eventName).toBe(EVENT_NAME);
    expect(screen.getByText(EVENT_NAME)).toBeInTheDocument();
  });

  /*
    행사 촬영을 마친 브라우저로 일반 `/shoot` 에 다시 들어오는 경우. 이어 가겠다는 표시가
    없으므로 새 촬영이고, 지난 행사의 배너가 따라붙으면 안 된다.
  */
  it("쿼리 없는 새 진입은 이전 행사 이름을 지운다", () => {
    enterShoot(`frame=classic-4&event=${encodeURIComponent(EVENT_NAME)}`).unmount();

    enterShoot("");

    expect(useShootSession.getState().eventName).toBeNull();
    expect(screen.queryByText(EVENT_NAME)).not.toBeInTheDocument();
  });
});
