/**
 * "저장한 프레임" 목록이 **모르는 것을 아는 척하지 않는지** 본다.
 *
 * 조회에 실패하면 frames 가 빈 배열이라, 실패 문구와 빈 목록 문구가 함께 떴다:
 *
 *   저장한 프레임을 불러오지 못했어요.
 *   저장한 프레임이 없어요.        ← 요청이 실패했을 뿐인데 없다고 단정한다
 *
 * 사용자에게는 공들여 꾸민 프레임이 날아간 것으로 읽힌다. 실패는 "없음"이 아니라 "모름"이다.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { SavedFramesSection } from "@/components/frame/SavedFramesSection";
import type { RemoteFrame } from "@/lib/api-types";

jest.mock("@/components/frame/FramePreview", () => ({
  FramePreview: () => <div data-testid="frame-preview" />,
}));

const ERROR = "저장한 프레임을 불러오지 못했어요.";
const EMPTY = "저장한 프레임이 없어요.";

function frame(over: Partial<RemoteFrame> = {}): RemoteFrame {
  return {
    frameId: 1,
    title: "내 프레임",
    frameType: "CLASSIC",
    source: "",
    isSystem: false,
    ...over,
  } as RemoteFrame;
}

function renderSection(over: Partial<Parameters<typeof SavedFramesSection>[0]> = {}) {
  const onRefresh = jest.fn();
  render(
    <SavedFramesSection
      title="저장한 프레임"
      emptyText={EMPTY}
      selectedFrameId={null}
      frames={[]}
      isLoading={false}
      error={null}
      selectedRemoteFrameId={null}
      onSelectRemoteFrame={jest.fn()}
      onRefresh={onRefresh}
      {...over}
    />,
  );
  return { onRefresh };
}

describe("SavedFramesSection", () => {
  it("불러오지 못했으면 없다고 말하지 않는다", () => {
    renderSection({ error: ERROR, frames: [] });

    expect(screen.getByText(ERROR)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
    // 사라진 게 아니라는 것까지 말해 준다.
    expect(
      screen.getByText(/저장한 프레임이 사라진 것은 아니에요/),
    ).toBeInTheDocument();
  });

  it("불러오지 못했으면 다시 시도할 자리를 준다", () => {
    const { onRefresh } = renderSection({ error: ERROR, frames: [] });

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("정말 하나도 없으면 없다고 말한다", () => {
    renderSection({ error: null, frames: [] });

    expect(screen.getByText(EMPTY)).toBeInTheDocument();
    expect(screen.queryByText(ERROR)).not.toBeInTheDocument();
  });

  // 방금까지 보이던 목록이 사라지는 편이 더 나쁘다. 새로고침 실패는 배너로만 알린다.
  it("목록이 있는 채로 새로고침만 실패하면 목록을 지우지 않는다", () => {
    renderSection({ error: ERROR, frames: [frame({ title: "내 프레임" })] });

    expect(screen.getByText(ERROR)).toBeInTheDocument();
    expect(screen.getByText("내 프레임")).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "다시 시도" }),
    ).not.toBeInTheDocument();
  });

  it("불러오는 중에는 실패도 없음도 말하지 않는다", () => {
    renderSection({ isLoading: true, error: null, frames: [] });

    expect(screen.getByText("불러오는 중…")).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
  });

  // 걸러져서 빈 것과 정말 없는 것은 다른 말이어야 한다.
  it("컷 구성이 달라 걸러진 것은 없는 것과 구분해 말한다", () => {
    renderSection({
      frames: [frame({ frameType: "GRID" })],
      selectedFrameId: "classic-4",
    });

    expect(screen.getByText(/컷 구성이 달라요/)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
  });

  /*
    꾸미기는 저장한 프레임을 고르지 않고 연다(2026-11-09). 예전에는 카드를 누르면 체크만 붙고,
    주 버튼 「새 프레임 만들기」를 누르면 고치려던 프레임 대신 빈 새 프레임이 열렸다.
  */
  describe("눌러서 여는 목록(꾸미기)", () => {
    it("누르면 그 프레임을 열고, 고른 표시나 따로 된 「수정하기」 단추는 없다", () => {
      const onOpen = jest.fn();
      const onSelectRemoteFrame = jest.fn();
      const saved = frame({ frameId: 7, title: "크리스마스 4컷" });
      renderSection({ frames: [saved], onOpen, onSelectRemoteFrame });

      const card = screen.getByRole("button", { name: "크리스마스 4컷 수정하기" });
      expect(card).not.toHaveAttribute("aria-pressed");
      expect(screen.getAllByRole("button", { name: /수정하기/ })).toHaveLength(1);

      fireEvent.click(card);
      expect(onOpen).toHaveBeenCalledWith(saved);
      expect(onSelectRemoteFrame).not.toHaveBeenCalled();
    });

    it("위에서 새 프레임의 컷 구성을 바꿔도 고칠 프레임을 거르지 않는다", () => {
      renderSection({
        frames: [frame({ frameType: "GRID", title: "네모 프레임" })],
        selectedFrameId: "classic-4",
        onOpen: jest.fn(),
      });

      expect(screen.getByText("네모 프레임")).toBeInTheDocument();
      expect(screen.queryByText(/컷 구성이 달라요/)).not.toBeInTheDocument();
    });
  });
});

