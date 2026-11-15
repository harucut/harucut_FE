/**
 * 사진 고르기의 「꾸미기」(2026-11-14, 시안 B).
 *
 * 테두리 색은 편집기와 같은 동그란 견본(+ 「다른 색」)으로 고르고, 보정은 설명 문구 없이 내 사진에 그 보정을
 * 입힌 견본으로 고른다. 꾸민 프레임은 테두리를 프레임이 정하므로 고르기가 아예 없다 — 서버 합성이 보낸 색을
 * 버려, 고르게 두면 고른 색이 저장될 때 조용히 사라진다.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { FrameOutputOptionsPanel } from "@/components/frame/FrameOutputOptionsPanel";

function renderPanel(overrides: Partial<Parameters<typeof FrameOutputOptionsPanel>[0]> = {}) {
  const props = {
    borderColor: "#18181a",
    onBorderColorChange: jest.fn(),
    outputFilter: "NONE" as const,
    onOutputFilterChange: jest.fn(),
    hasCustomFrame: false,
    samplePhoto: "/shot-1.png",
    ...overrides,
  };
  render(<FrameOutputOptionsPanel {...props} />);
  return props;
}

describe("FrameOutputOptionsPanel", () => {
  it("지금 테두리 색 견본에만 고른 표시가 붙고, 견본을 누르면 '#rrggbb' 로 넘긴다", () => {
    const props = renderPanel();

    expect(screen.getByRole("button", { name: "잉크 차콜" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "민트" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "민트" }));
    expect(props.onBorderColorChange).toHaveBeenCalledWith("#cde9d8");
  });

  // 「테두리 색 고르는 거 한 줄로 / 보여주는 거 5개 색 맘대로 할 수 있는 거 한 개」(2026-11-15).
  it("테두리 색은 견본 다섯과 「다른 색」 하나다", () => {
    renderPanel();
    expect(within(screen.getByRole("group", { name: "테두리 색" })).getAllByRole("button")).toHaveLength(6);
  });

  it("목록에 없는 색은 「다른 색」 창에서 고르고, 색 코드 입력칸은 없다", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "다른 색 고르기" }));
    const dialog = screen.getByRole("dialog", { name: "다른 색" });
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.keyDown(within(dialog).getByRole("slider", { name: "색상" }), { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(within(dialog).getByRole("slider", { name: "채도와 밝기" }), { key: "ArrowUp", shiftKey: true });
    fireEvent.click(within(dialog).getByRole("button", { name: "이 색으로" }));

    expect(props.onBorderColorChange).toHaveBeenCalledWith(expect.stringMatching(/^#[0-9a-f]{6}$/));
    expect(props.onBorderColorChange).not.toHaveBeenCalledWith("#18181a");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("꾸민 프레임이면 테두리 고르기가 없고 보정만 고른다", () => {
    renderPanel({ hasCustomFrame: true });

    expect(screen.queryByRole("group", { name: "테두리 색" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "보정" })).toBeInTheDocument();
  });

  it("보정은 내 사진에 그 보정을 입힌 견본이고, 설명 문구 없이 이름만 둔다", () => {
    const props = renderPanel({ outputFilter: "B&W" });

    const blackAndWhite = screen.getByRole("button", { name: "흑백" });
    expect(blackAndWhite).toHaveAttribute("aria-pressed", "true");
    expect(blackAndWhite.querySelector("img")).toHaveAttribute("src", "/shot-1.png");
    expect(blackAndWhite.querySelector("img")?.style.filter).toContain("grayscale");
    expect(screen.queryByText("차분한 필름 톤")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "뽀샤시" }));
    expect(props.onOutputFilterChange).toHaveBeenCalledWith("SOFT");
  });

  // 「비회원이면 보정은 선택 못하도록 해」(2026-11-15). 견본은 보이되 잠기고 「회원 전용」이 붙는다.
  it("보정이 잠기면 견본을 누를 수 없고 「회원 전용」이 붙는다", () => {
    const props = renderPanel({ filtersLocked: true });

    expect(screen.getByText("회원 전용")).toBeInTheDocument();
    const chips = screen.getAllByRole("button").filter((button) => button.closest('[aria-label="보정"]'));
    expect(chips.length).toBeGreaterThan(1);
    chips.forEach((chip) => expect(chip).toBeDisabled());
    fireEvent.click(chips[1]);
    expect(props.onOutputFilterChange).not.toHaveBeenCalled();
    // 테두리 색은 그대로 고른다.
    expect(screen.getByRole("group", { name: "테두리 색" })).toBeInTheDocument();
  });

  // 이름은 꾸미기에서 붙인다(2026-11-15). 완성 뒤 바꾸는 것은 기록에서만 한다.
  it("사진 이름을 붙이면 넘기고, 비워 두면 날짜와 시간으로 붙는다고 알려 준다", () => {
    const onPhotoNameChange = jest.fn();
    renderPanel({ photoName: "", onPhotoNameChange });

    const field = screen.getByRole("textbox", { name: "사진 이름" });
    expect(field).toHaveAttribute("placeholder", "비워 두면 날짜와 시간으로 붙어요");
    fireEvent.change(field, { target: { value: "바다에서" } });
    expect(onPhotoNameChange).toHaveBeenCalledWith("바다에서");
  });

  it("이름을 받을 곳이 없으면 이름 칸도 없다", () => {
    renderPanel();
    expect(screen.queryByRole("textbox", { name: "사진 이름" })).toBeNull();
  });
});
