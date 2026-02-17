import { render, screen } from "@testing-library/react";
import { ThemeOverlaySvg } from "@/components/theme/editor/ThemeOverlaySvg";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

const layout = FRAME_LAYOUTS["classic-4"];

// 텍스트 컴포넌트 1개만 가진 최소 오버레이 데이터
const theme: ThemeExportJson = {
  frameId: "classic-4",
  components: [
    {
      id: "text-1",
      type: "TEXT",
      source: "ABC",
      x: 100,
      y: 200,
      width: 300,
      height: 120,
      scale: 1,
      rotation: 0,
      zIndex: 1,
      styleJson: {
        fontFamily: "Pretendard",
        fontSize: 24,
        color: "#fff",
        textAlign: "left",
      },
    },
  ],
};

describe("ThemeOverlaySvg", () => {
  // data가 없으면 오버레이 SVG 자체를 렌더하지 않아야 합니다.
  it("does not render when data is null", () => {
    const { container } = render(<ThemeOverlaySvg layout={layout} data={null} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  // 슬롯 viewBox를 넘기면 로컬 좌표(0,0 기준)로 렌더되어야 합니다.
  it("renders in slot-local coordinate space when viewBox is provided", () => {
    render(
      <ThemeOverlaySvg
        layout={layout}
        data={theme}
        viewBox={{ x: 50, y: 100, width: 400, height: 300 }}
      />,
    );

    const svg = document.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 400 300");

    // 원본 좌표(100, 200)가 슬롯 원점(50, 100) 기준으로 변환되면
    // 중심점은 translate(200, 160)이 됩니다.
    const group = document.querySelector("g[transform]");
    expect(group).toBeTruthy();
    expect(group?.getAttribute("transform")).toContain("translate(200 160)");
  });

  // 텍스트 source 문자열이 실제 SVG text 노드로 렌더되는지 확인합니다.
  it("renders text content", () => {
    render(<ThemeOverlaySvg layout={layout} data={theme} />);
    expect(screen.getByText("ABC")).toBeInTheDocument();
  });
});

