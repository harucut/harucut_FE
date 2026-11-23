/**
 * 배경 고르기(2026-11-09 바꿈).
 *
 * 색은 동그란 견본을 눌러 고르고, 목록에 없는 색은 맨 끝 견본이 기기의 색 고르기 창을 연다.
 * 색 코드 입력칸은 없앴다 — 다른 색을 쓰려면 코드를 알아야 했다. 배경 사진은 큰 단추 하나로 넣고,
 * 깔았으면 바꾸기·지우기를 둔다. 사진을 깔았을 때 어떤 색도 고른 것처럼 보이면 안 된다.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { BackgroundPanel } from "@/components/theme/editor/BackgroundPanel";

const mockSetBackgroundColor = jest.fn();
const mockClearBackgroundImage = jest.fn();
const mockState = {
  background: { type: "COLOR" } as { type: "COLOR" | "IMAGE"; url?: string },
  backgroundColor: "18181a",
  setBackgroundColor: (value: string) => mockSetBackgroundColor(value),
  setBackgroundImage: jest.fn(),
  clearBackgroundImage: () => mockClearBackgroundImage(),
};

jest.mock("@/lib/themeEditorStore", () => ({
  useThemeEditorStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));
jest.mock("@/hooks/useServerAssets", () => ({
  useServerAssets: () => ({ stickers: [], backgrounds: [] }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockState.background = { type: "COLOR" };
  mockState.backgroundColor = "18181a";
});

describe("BackgroundPanel", () => {
  it("견본을 누르면 그 색으로 바꾸고, 지금 색에만 고른 표시가 붙는다", () => {
    render(<BackgroundPanel frameId="classic-4" />);

    expect(screen.getByRole("button", { name: "잉크 차콜" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "블러시 핑크" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "블러시 핑크" }));
    expect(mockSetBackgroundColor).toHaveBeenCalledWith("f4c6d0");
  });

  // 「다른 색」은 기기의 색 고르기 창이 아니라 우리 창(CustomColorSheet)이다(2026-11-15).
  it("목록에 없는 색은 「다른 색」 창에서 고르고, 색 코드 입력칸은 없다", () => {
    render(<BackgroundPanel frameId="classic-4" />);

    fireEvent.click(screen.getByRole("button", { name: "다른 색 고르기" }));
    const dialog = screen.getByRole("dialog", { name: "다른 색" });
    fireEvent.keyDown(within(dialog).getByRole("slider", { name: "채도와 밝기" }), { key: "ArrowUp", shiftKey: true });
    fireEvent.click(within(dialog).getByRole("button", { name: "이 색으로" }));

    expect(mockSetBackgroundColor).toHaveBeenCalledWith(expect.stringMatching(/^#[0-9a-f]{6}$/));
    expect(mockSetBackgroundColor).not.toHaveBeenCalledWith("#18181a");
    expect(screen.queryByRole("dialog", { name: "다른 색" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("배경색 코드")).not.toBeInTheDocument();
  });

  it("배경 사진이 없으면 큰 단추 하나로 넣는다", () => {
    render(<BackgroundPanel frameId="classic-4" />);

    expect(screen.getByRole("button", { name: "사진으로 배경 넣기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "지우기" })).not.toBeInTheDocument();
    // 형식·용량 설명은 실패했을 때 그 사유로만 말한다.
    expect(screen.queryByText(/10MB 이하/)).not.toBeInTheDocument();
  });

  it("배경 사진을 깔았으면 바꾸기·지우기를 두고, 어떤 색도 고른 것처럼 보이지 않는다", () => {
    mockState.background = { type: "IMAGE", url: "blob:bg" };
    render(<BackgroundPanel frameId="classic-4" />);

    expect(screen.getByRole("button", { name: "바꾸기" })).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
    expect(mockClearBackgroundImage).toHaveBeenCalledTimes(1);
  });
});
