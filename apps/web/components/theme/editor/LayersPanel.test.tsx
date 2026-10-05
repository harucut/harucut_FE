import { fireEvent, render, screen } from "@testing-library/react";
import { LayersPanel } from "./LayersPanel";
import { useThemeEditorStore } from "@/lib/themeEditorStore";

test("맨 위 레이어를 먼저 보여 주고 위로 버튼이 실제 목록에서도 위로 이동시킨다", () => {
  useThemeEditorStore.getState().reset();
  useThemeEditorStore.getState().setFrameId("classic-4");
  useThemeEditorStore.getState().addText({ text: "아래", fontSize: 24 });
  useThemeEditorStore.getState().addText({ text: "위", fontSize: 24 });
  render(<LayersPanel />);
  expect(screen.getAllByRole("button", { name: "위로" })[0]).toBeDisabled();
  expect(screen.getAllByText(/^TEXT:/).map((n) => n.textContent)).toEqual([
    "TEXT: 위",
    "TEXT: 아래",
  ]);
  fireEvent.click(screen.getAllByRole("button", { name: "위로" })[1]);
  expect(screen.getAllByText(/^TEXT:/).map((n) => n.textContent)).toEqual([
    "TEXT: 아래",
    "TEXT: 위",
  ]);
});
