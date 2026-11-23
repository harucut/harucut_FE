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

function Harness({ logo, run = "run-1" }: { logo?: string; run?: string | null }) {
  const [value, setValue] = useState<FreeTextValue>({ text: "", styleId: "pretendard-bold-dark" });
  return (
    <FreeTextComposer
      outputLogoUrl={logo}
      config={config}
      token="p"
      eventId="evt-1"
      captureRunId={run}
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
  expect(mockPreview.mock.calls[0][2]).toEqual({
    captureRunId: "run-1",
    frameVersionId: 31,
    text: "축하",
    styleId: "pretendard-bold-dark",
  });
  expect(screen.getByAltText("미리보기: 축하")).toHaveStyle({ top: "90%", height: "10%" });
});

it("서버와 같은 규칙으로 정리한 문구를 보내, 서버가 정리해 돌려준 응답도 받아들인다", async () => {
  mockPreview.mockImplementation(async (_t, _e, body: { text: string }) => rendered(body.text));
  render(<Harness />);
  fireEvent.change(screen.getByRole("textbox", { name: "사진에 넣을 문구" }), { target: { value: "  축하해요  " } });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(FREE_TEXT_PREVIEW_DELAY_MS);
  });
  expect(mockPreview.mock.calls[0][2].text).toBe("축하해요");
  expect(screen.getByAltText("미리보기: 축하해요")).toBeInTheDocument();
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

it("행사 로고를 얹는 행사면 서버와 같은 자리(오른쪽 아래)에 로고를 겹친다", async () => {
  mockPreview.mockImplementation(async (_t, _e, body: { text: string }) => rendered(body.text));
  const { container } = render(<Harness logo="https://cdn.example/logo.png" />);
  fireEvent.change(screen.getByRole("textbox", { name: "사진에 넣을 문구" }), { target: { value: "축하" } });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(FREE_TEXT_PREVIEW_DELAY_MS);
  });
  const logo = container.querySelector('img[src="https://cdn.example/logo.png"]') as HTMLImageElement;
  Object.defineProperty(logo, "naturalWidth", { value: 400 });
  Object.defineProperty(logo, "naturalHeight", { value: 100 });
  fireEvent.load(logo);
  // 600×1000 캔버스: 여백 18, 너비 108, 높이 27 → x 474, y 955.
  expect(logo).toHaveStyle({ left: "79%", top: "95.5%", width: "18%", height: "2.7%" });
});

it("회차가 아직 없으면 미리보기를 부르지 않는다 — 서버는 회차에 고정된 설정으로 그린다", async () => {
  render(<Harness run={null} />);
  fireEvent.change(screen.getByRole("textbox", { name: "사진에 넣을 문구" }), { target: { value: "축하" } });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(FREE_TEXT_PREVIEW_DELAY_MS);
  });
  expect(mockPreview).not.toHaveBeenCalled();
});
