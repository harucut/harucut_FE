/**
 * 「다른 색」 창(2026-11-15 「색 맘대로 하는 거 창도 디자인 보여줘봐」). 견본 다섯에 없는 색을 우리 창에서 고른다 —
 * 예전에는 기기의 색 고르기 창(`<input type="color">`)이라 기기마다 생김새가 달랐다.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { ColorSwatches } from "@/components/ui/ColorSwatches";
import { CustomColorSheet, hexToHsv, hsvToHex } from "@/components/ui/CustomColorSheet";

describe("색 바꾸기", () => {
  it.each(["#123456", "#fafaf7", "#18181a", "#ff0000", "#00ff7f", "#ffffff", "#000000"])("%s 는 HSV 를 거쳐도 같은 색이다", (hex) => {
    expect(hsvToHex(hexToHsv(hex))).toBe(hex);
  });
});

describe("ColorSwatches", () => {
  it("견본 다섯과 「다른 색」 하나, 여섯이 한 줄이다", () => {
    render(<ColorSwatches label="테두리 색" value="fafaf7" onChange={jest.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "소프트 아이보리" })).toHaveAttribute("aria-pressed", "true");
  });

  it("목록에 없는 색이면 「다른 색」 자리가 고른 상태다", () => {
    render(<ColorSwatches label="테두리 색" value="#123456" onChange={jest.fn()} />);
    expect(screen.getByRole("button", { name: "다른 색 고르기" })).toHaveAttribute("aria-pressed", "true");
  });

  it("「다른 색」을 누르면 기기 창이 아니라 우리 창이 뜬다", () => {
    const { container } = render(<ColorSwatches label="테두리 색" value="fafaf7" onChange={jest.fn()} />);
    expect(container.querySelector('input[type="color"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다른 색 고르기" }));
    expect(screen.getByRole("dialog", { name: "다른 색" })).toBeInTheDocument();
  });
});

describe("CustomColorSheet", () => {
  it("「이 색으로」를 눌러야 넘기고 닫는다 — 끄는 동안에는 넘기지 않는다", () => {
    const onPick = jest.fn();
    const onClose = jest.fn();
    render(<CustomColorSheet initial="#cbe0f4" onClose={onClose} onPick={onPick} />);

    fireEvent.keyDown(screen.getByRole("slider", { name: "색상" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("slider", { name: "채도와 밝기" }), { key: "ArrowDown", shiftKey: true });
    expect(onPick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "이 색으로" }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatch(/^#[0-9a-f]{6}$/);
    expect(onPick.mock.calls[0][0]).not.toBe("#cbe0f4");
    expect(onClose).toHaveBeenCalled();
  });

  it("고치지 않고 「이 색으로」면 처음 색 그대로다", () => {
    const onPick = jest.fn();
    render(<CustomColorSheet initial="cbe0f4" onClose={jest.fn()} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "이 색으로" }));
    expect(onPick).toHaveBeenCalledWith("#cbe0f4");
  });

  it("취소하면 넘기지 않고 닫는다", () => {
    const onPick = jest.fn();
    const onClose = jest.fn();
    render(<CustomColorSheet initial="#cbe0f4" onClose={onClose} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("화살표로 움직이면 슬라이더 값이 바뀐다 — 키보드로도 고른다", () => {
    render(<CustomColorSheet initial="#808080" onClose={jest.fn()} onPick={jest.fn()} />);
    const hue = screen.getByRole("slider", { name: "색상" });
    const before = Number(hue.getAttribute("aria-valuenow"));
    fireEvent.keyDown(hue, { key: "ArrowRight", shiftKey: true });
    expect(Number(hue.getAttribute("aria-valuenow"))).toBe((before + 20) % 360);
    const area = screen.getByRole("slider", { name: "채도와 밝기" });
    fireEvent.keyDown(area, { key: "ArrowUp" });
    expect(area.getAttribute("aria-valuetext")).toBe("채도 0%, 밝기 52%");
  });
});
