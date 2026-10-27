import { act, fireEvent, render, screen } from "@testing-library/react";
import { FREE_TEXT_PREVIEW_DELAY_MS, FreeTextComposer, type FreeTextValue } from "@/components/participation/FreeTextComposer";
import { useState } from "react";

const mockPreview = jest.fn();
jest.mock("@/lib/event/eventApi", () => ({ previewFreeText: (...a: unknown[]) => mockPreview(...a) }));

const config = {
  box: { x: 0, y: 0.9, width: 1, height: 0.1 },
  maxLength: 20,
  maxLines: 1,
  styles: [{ id: "pretendard-bold-dark", label: "굵게 · 검정", weight: 700, color: "#111111" }],
};

function Harness() {
  const [value, setValue] = useState<FreeTextValue>({ text: "", styleId: "pretendard-bold-dark" });
  return (
    <FreeTextComposer
      config={config}
      token="p"
      eventId="evt-1"
      frame={{ frameVersionId: 31, layoutType: "CLASSIC", sortOrder: 1, isDefault: true, previewUrl: "https://x/frame.png" }}
      value={value}
      onChange={setValue}
    />
  );
}

const rendered = (text: string) => ({
  text,
  styleId: "pretendard-bold-dark",
  image: `data:image/png;base64,${text}`,
  x: 0, y: 900, width: 600, height: 100, canvasWidth: 600, canvasHeight: 1000,
});

beforeEach(() => {
  jest.useFakeTimers();
  mockPreview.mockReset();
});
afterEach(() => jest.useRealTimers());

it("입력이 멈춘 뒤에만 미리보기를 부른다", async () => {
  mockPreview.mockImplementation(async (_t, _e, body: { text: string }) => rendered(body.text));
  render(<Harness />);
  const input = screen.getByRole("textbox", { name: "사진에 넣을 문구" });
  fireEvent.change(input, { target: { value: "축" } });
  fireEvent.change(input, { target: { value: "축하" } });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(FREE_TEXT_PREVIEW_DELAY_MS);
  });
  expect(mockPreview).toHaveBeenCalledTimes(1);
  expect(mockPreview.mock.calls[0][2]).toEqual({ frameVersionId: 31, text: "축하", styleId: "pretendard-bold-dark" });
  expect(screen.getByAltText("미리보기: 축하")).toHaveStyle({ top: "90%", height: "10%" });
});

it("늦게 온 옛 문구의 응답은 지금 미리보기를 덮지 않는다", async () => {
  // 서버가 요청과 다른 문구를 돌려준 경우(취소가 늦어 도착한 옛 응답)를 흉내 낸다.
  mockPreview.mockResolvedValueOnce(rendered("옛 문구"));
  render(<Harness />);
  fireEvent.change(screen.getByRole("textbox", { name: "사진에 넣을 문구" }), { target: { value: "새 문구" } });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(FREE_TEXT_PREVIEW_DELAY_MS);
  });
  expect(mockPreview).toHaveBeenCalledTimes(1);
  expect(screen.queryByAltText(/미리보기:/)).not.toBeInTheDocument();
});
