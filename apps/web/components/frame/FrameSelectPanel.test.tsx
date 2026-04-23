import { fireEvent, render, screen } from "@testing-library/react";
import { FrameSelectPanel } from "@/components/frame/FrameSelectPanel";

describe("FrameSelectPanel", () => {
  const baseProps = {
    frameId: null,
    media: [
      { type: "image" as const, src: "/1.png" },
      { type: "image" as const, src: "/2.png" },
      { type: "image" as const, src: "/3.png" },
      { type: "image" as const, src: "/4.png" },
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

