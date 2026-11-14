import { fireEvent, render, screen } from "@testing-library/react";
import { FrameSelectPanel } from "@/components/frame/FrameSelectPanel";

describe("FrameSelectPanel", () => {
  const baseProps = {
    frameId: null,
    media: [
      { src: "/1.png" },
      { src: "/2.png" },
      { src: "/3.png" },
      { src: "/4.png" },
    ],
    maxSelect: 4,
    nextButtonLabel: "다음 단계",
    onToggleSelect: jest.fn(),
    onReset: jest.fn(),
    onNext: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 선택 개수가 maxSelect보다 작으면 다음 버튼은 비활성화되어야 합니다.
  it("disables next button when selected count is not enough", () => {
    render(
      <FrameSelectPanel
        {...baseProps}
        selectedIndexes={[0, null, null, null]}
      />,
    );

    const nextButton = screen.getByRole("button", { name: "다음 단계" });
    expect(nextButton).toBeDisabled();
  });

  // 선택 개수가 정확히 maxSelect이면 다음 버튼이 활성화되고 onNext가 호출됩니다.
  it("enables next button when selected count matches maxSelect", () => {
    render(
      <FrameSelectPanel
        {...baseProps}
        selectedIndexes={[0, 1, 2, 3]}
      />,
    );

    const nextButton = screen.getByRole("button", { name: "다음 단계" });
    expect(nextButton).toBeEnabled();

    fireEvent.click(nextButton);
    expect(baseProps.onNext).toHaveBeenCalledTimes(1);
  });
});


// 고른 사진의 테두리·번호는 들어간 칸의 색이다 — 미리보기의 그 칸과 이어진다(2026-11-14).
it("고른 사진마다 들어간 칸의 색으로 테두리와 번호를 단다", () => {
  render(
    <FrameSelectPanel
      frameId="classic-4"
      media={[{ src: "/1.png" }, { src: "/2.png" }, { src: "/3.png" }, { src: "/4.png" }]}
      maxSelect={4}
      nextButtonLabel="다음 단계"
      onToggleSelect={jest.fn()}
      onReset={jest.fn()}
      onNext={jest.fn()}
      selectedIndexes={[2, 0, null, null]}
    />,
  );

  const first = screen.getByRole("button", { name: /3번 사진 선택 해제 \(현재 1번째로 선택됨\)/ });
  const second = screen.getByRole("button", { name: /1번 사진 선택 해제 \(현재 2번째로 선택됨\)/ });
  expect(first.style.borderColor).not.toBe("");
  expect(first.style.borderColor).not.toBe(second.style.borderColor);
  expect(screen.getByRole("button", { name: "2번 사진 선택" }).style.borderColor).toBe("");
});
