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

// 여기서 보는 것은 "프레임을 고른 뒤 사진이 남는가"뿐이다. 고르는 UI 는 FrameChooser 의
// 몫이라 확인 버튼만 남긴다.
jest.mock("@/components/frame/FrameChooser", () => ({
  FrameChooser: ({
    onConfirm,
  }: {
    onConfirm: (choice: { frameId: FrameId; remoteFrameId: number | null }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onConfirm({ frameId: mockChosenFrameId, remoteFrameId: null })}
    >
      확인
    </button>
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
