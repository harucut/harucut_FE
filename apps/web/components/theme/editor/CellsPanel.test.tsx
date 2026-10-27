import { fireEvent, render, screen, within } from "@testing-library/react";
import { CellsPanel } from "@/components/theme/editor/CellsPanel";
import { toCreateFrameRequest, toThemeExportJson } from "@/lib/frameApi";
import { useThemeEditorStore } from "@/lib/themeEditorStore";
import type { RemoteFrame } from "@/lib/api-types";

beforeEach(() => {
  const store = useThemeEditorStore.getState();
  useThemeEditorStore.setState({ frameId: null });
  store.setFrameId("classic-4");
});

/*
  자유 사진 칸(P5) 편집. 값은 서버 계약(cells)과 같은 규칙으로 맞추고, 되돌리기·저장·불러오기를 그대로 탄다.
*/
describe("사진 칸 자유 편집", () => {
  it("켜면 지금 칸 모양에서 시작하고 끄면 고정 레이아웃으로 돌아간다(되돌리기 포함)", () => {
    render(<CellsPanel />);
    const toggle = screen.getByRole("switch", { name: "칸 자유 편집" });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    expect(useThemeEditorStore.getState().cells).toHaveLength(4);
    expect(screen.getAllByRole("tab")).toHaveLength(4);

    useThemeEditorStore.getState().undo();
    expect(useThemeEditorStore.getState().cells).toBeNull();
  });

  it("칸 값을 저장할 수 있는 값으로 맞추고, 사진 순서는 맞바꾸고, 모양을 바꾼다", () => {
    useThemeEditorStore.getState().setFreeCells(true);
    render(<CellsPanel />);

    fireEvent.click(screen.getByRole("tab", { name: "2번 칸" }));
    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("회전(도)"), { target: { value: "-4.5" } });
    fireEvent.change(screen.getByLabelText("넣을 사진"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("radio", { name: "타원" }));

    const cells = useThemeEditorStore.getState().cells!;
    // 최소 크기 100px 로 맞춘다.
    expect(cells[1]).toMatchObject({ width: 100, rotation: -4.5, shotIndex: 3, shape: { type: "ELLIPSE" } });
    // 4번째 사진을 쓰던 칸은 2번째 사진과 맞바꾼다 — 네 칸이 늘 서로 다르다.
    expect(cells.map((c) => c.shotIndex)).toEqual([0, 3, 2, 1]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("저장 요청에 cells 를 싣고, 서버 응답의 cells 를 다시 편집기로 들인다", () => {
    useThemeEditorStore.getState().setFreeCells(true);
    useThemeEditorStore.getState().updateCell(0, { rotation: 10 });
    const json = useThemeEditorStore.getState().exportJson()!;
    const request = toCreateFrameRequest(json, { title: "t", description: "", previewKey: "k" });
    expect(request.cells).toHaveLength(4);
    expect(request.cells?.[0]).toMatchObject({ rotation: 10, shotIndex: 0, shape: { type: "RECT", cornerRadius: 40 } });

    const frame = {
      frameId: 1,
      title: "t",
      frameType: "CLASSIC",
      components: [],
      cells: request.cells,
    } as unknown as RemoteFrame;
    const imported = toThemeExportJson(frame);
    useThemeEditorStore.getState().importJson(imported);
    expect(useThemeEditorStore.getState().cells?.[0].rotation).toBe(10);

    // 고정 레이아웃 프레임은 cells 가 없다.
    useThemeEditorStore.getState().importJson({ ...imported, cells: undefined });
    expect(useThemeEditorStore.getState().cells).toBeNull();
    expect(toCreateFrameRequest(useThemeEditorStore.getState().exportJson()!, { title: "t", description: "", previewKey: "k" })).not.toHaveProperty("cells");
  });
});

it("자유 칸이 아니면 칸 탭이 없다", () => {
  render(<CellsPanel />);
  expect(within(screen.getByRole("region", { name: "사진 칸" })).queryByRole("tab")).not.toBeInTheDocument();
});
