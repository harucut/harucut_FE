/**
 * 사진 고르기의 「꾸미기」(2026-11-14, 시안 B).
 *
 * 보정은 설명 문구 없이 내 사진에 그 보정을 입힌 견본으로 고르고, 사진 이름을 붙인다. 테두리 색은 고르지
 * 않는다(2026-11-15 「프레임 고르고 왔으면 꾸미기에서 색상 변경은 없어도 되겠다」) — 고른 프레임 카드의 색이 곧
 * 완성본의 색이다.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { FrameOutputOptionsPanel } from "@/components/frame/FrameOutputOptionsPanel";

function renderPanel(overrides: Partial<Parameters<typeof FrameOutputOptionsPanel>[0]> = {}) {
  const props = {
    outputFilter: "NONE" as const,
    onOutputFilterChange: jest.fn(),
    samplePhoto: "/shot-1.png",
    ...overrides,
  };
  render(<FrameOutputOptionsPanel {...props} />);
  return props;
}

describe("FrameOutputOptionsPanel", () => {
  it("테두리 색은 고르지 않는다 — 견본도 「다른 색」도 없고 보정만 고른다", () => {
    renderPanel();

    expect(screen.queryByText("테두리")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "테두리 색" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("다른 색 고르기")).not.toBeInTheDocument();
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
