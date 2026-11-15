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

/*
  시안 B(2026-11-14): 미리보기 아래 [사진 | 꾸미기] 전환. 테두리 색·보정이 사진 여덟 장 밑에 묻혀 폰에서는
  스크롤해야 보였다. 다음 단추는 어느 쪽에서든 그대로 있다.
*/
describe("사진 · 꾸미기 전환", () => {
  const renderPanel = (selectedIndexes: (number | null)[] = [0, null, null, null]) =>
    render(
      <FrameSelectPanel
        frameId="classic-4"
        media={[{ src: "/1.png" }, { src: "/2.png" }, { src: "/3.png" }, { src: "/4.png" }]}
        maxSelect={4}
        nextButtonLabel="다음 단계"
        incompleteButtonLabel="4장을 골라 주세요"
        onToggleSelect={jest.fn()}
        onNext={jest.fn()}
        selectedIndexes={selectedIndexes}
        renderExtraControls={() => <p>꾸미기 내용</p>}
      />,
    );

  it("처음에는 사진을 보이고, 꾸미기를 누르면 사진 대신 꾸미기를 보인다", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "사진" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1번 사진 선택 해제 (현재 1번째로 선택됨)" })).toBeInTheDocument();
    expect(screen.queryByText("꾸미기 내용")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "꾸미기" }));

    expect(screen.getByRole("button", { name: "꾸미기" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("꾸미기 내용")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /번 사진/ })).not.toBeInTheDocument();
    // 다음 단추는 꾸미기에서도 그 자리에 있다.
    expect(screen.getByRole("button", { name: "4장을 골라 주세요" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "사진" }));
    expect(screen.getByRole("button", { name: "2번 사진 선택" })).toBeInTheDocument();
  });

  // 1·2·3·4 는 고르는 순서다. 꾸미기에서는 완성될 모습 그대로 본다(2026-11-15).
  it("꾸미기에서는 미리보기에 고르는 순서 숫자를 달지 않는다", () => {
    renderPanel([0, 1, null, null]);
    expect(screen.queryAllByText("1").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "꾸미기" }));
    expect(screen.queryAllByText("1")).toHaveLength(0);
    expect(screen.queryAllByText("2")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "사진" }));
    expect(screen.queryAllByText("1").length).toBeGreaterThan(0);
  });

  it("꾸미기 내용을 주지 않으면 전환 단추도 없다", () => {
    render(
      <FrameSelectPanel
        frameId="classic-4"
        media={[{ src: "/1.png" }]}
        maxSelect={4}
        nextButtonLabel="다음 단계"
        onToggleSelect={jest.fn()}
        onNext={jest.fn()}
        selectedIndexes={[null, null, null, null]}
      />,
    );

    expect(screen.queryByRole("button", { name: "꾸미기" })).not.toBeInTheDocument();
  });

  // 새로고침처럼 생긴 「선택 초기화」는 뺐다(2026-11-15). 담은 사진은 다시 눌러 뺀다.
  it("초기화 단추는 없다", () => {
    renderPanel([0, null, null, null]);
    expect(screen.queryByRole("button", { name: "선택 초기화" })).not.toBeInTheDocument();
  });
});

// 다 고른 뒤 다섯 번째를 누르면 왜 안 되는지 말한다 — 단추 줄 위라 폰에서도 화면 안이다(2026-11-14).
it("네 장을 다 고른 뒤 다섯 번째를 누르면 담지 않고 까닭을 말한다", () => {
  const onToggleSelect = jest.fn();
  render(
    <FrameSelectPanel
      frameId="classic-4"
      media={[{ src: "/1.png" }, { src: "/2.png" }, { src: "/3.png" }, { src: "/4.png" }, { src: "/5.png" }]}
      maxSelect={4}
      nextButtonLabel="다음 단계"
      onToggleSelect={onToggleSelect}
      onNext={jest.fn()}
      selectedIndexes={[0, 1, 2, 3]}
    />,
  );

  expect(screen.getByRole("status")).toHaveTextContent("");
  fireEvent.click(screen.getByRole("button", { name: "5번 사진 — 4장을 다 골라 더 선택할 수 없어요" }));

  expect(onToggleSelect).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toBe(
    "4장까지만 담을 수 있어요. 바꾸려면 담은 사진을 먼저 눌러 빼 주세요.",
  );
});

it("꾸미기로 넘어가면 다섯 번째 안내를 바로 거둔다", () => {
  render(
    <FrameSelectPanel
      frameId="classic-4"
      media={[{ src: "/1.png" }, { src: "/2.png" }, { src: "/3.png" }, { src: "/4.png" }, { src: "/5.png" }]}
      maxSelect={4}
      nextButtonLabel="다음 단계"
      onToggleSelect={jest.fn()}
      onNext={jest.fn()}
      selectedIndexes={[0, 1, 2, 3]}
      renderExtraControls={() => <p>꾸미기 내용</p>}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "5번 사진 — 4장을 다 골라 더 선택할 수 없어요" }));
  expect(screen.getByRole("status").textContent).not.toBe("");

  fireEvent.click(screen.getByRole("button", { name: "꾸미기" }));
  expect(screen.getByRole("status")).toHaveTextContent("");
});
