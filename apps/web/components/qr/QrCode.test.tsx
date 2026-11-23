import { render } from "@testing-library/react";
import { encode } from "uqr";
import { QrCode } from "@/components/qr/QrCode";

describe("QrCode", () => {
  const link = "https://www.harucut.com/r#Zm9vYmFyLXJlc3VsdC10b2tlbi0zMmJ5dGVzLWJhc2U2NHVybA";

  it("QR 행렬의 어두운 칸을 그대로 그린다", () => {
    const { container } = render(<QrCode value={link} label="결과 받기 QR" />);
    const qr = encode(link, { ecc: "M", border: 4 });
    const dark = qr.data.flat().filter(Boolean).length;

    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${qr.size} ${qr.size}`);
    const d = container.querySelector("path")!.getAttribute("d")!;
    expect(d.match(/M/g)).toHaveLength(dark);
  });

  // 결과 링크는 그 자체가 수령 권한이다. 화면에 읽어 줄 설명에 원문을 넣지 않는다.
  it("접근성 이름은 넘긴 설명만 쓰고 링크 원문은 DOM 에 남기지 않는다", () => {
    const { container, getByRole } = render(<QrCode value={link} label="결과 받기 QR" />);
    expect(getByRole("img", { name: "결과 받기 QR" })).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("Zm9vYmFy");
  });

  it("값이 바뀌면 다른 행렬을 그린다", () => {
    const { container, rerender } = render(<QrCode value={link} label="QR" />);
    const before = container.querySelector("path")!.getAttribute("d");
    rerender(<QrCode value={`${link}x`} label="QR" />);
    expect(container.querySelector("path")!.getAttribute("d")).not.toBe(before);
  });
});
