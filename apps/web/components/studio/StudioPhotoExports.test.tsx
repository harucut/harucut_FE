import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiRequestError } from "@/lib/clientApi";
import { EXPORT_POLL_MS, StudioPhotoExports } from "@/components/studio/StudioPhotoExports";

const mockCreate = jest.fn();
const mockList = jest.fn();
const mockDownload = jest.fn();

jest.mock("@/lib/studio/photosApi", () => ({
  ...jest.requireActual("@/lib/studio/photosApi"),
  createPhotoExport: (...a: unknown[]) => mockCreate(...a),
  listPhotoExports: (...a: unknown[]) => mockList(...a),
  getPhotoExportDownload: (...a: unknown[]) => mockDownload(...a),
}));

const PENDING = { exportId: "Ex1", status: "PENDING", photoCount: 2, createdAt: "x" };

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([]);
});

afterEach(() => jest.useRealTimers());

it("고른 사진으로 묶음을 만들고, 다 될 때까지 다시 물어 받기를 보인다", async () => {
  jest.useFakeTimers();
  const onCreated = jest.fn();
  mockCreate.mockResolvedValue(PENDING);
  render(<StudioPhotoExports eventId="Ev1" selectedIds={[11, 12]} onCreated={onCreated} />);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "고른 사진 묶어 받기 (2)" }));
  });
  expect(mockCreate).toHaveBeenCalledWith("Ev1", { photoIds: [11, 12] });
  expect(onCreated).toHaveBeenCalled();
  expect(screen.getByText("2장 · 기다리는 중")).toBeInTheDocument();

  mockList.mockResolvedValue([{ ...PENDING, status: "DONE", sizeBytes: 3 * 1024 * 1024 }]);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(EXPORT_POLL_MS);
  });
  expect(screen.getByText("2장 · 받을 수 있어요 · 3.0MB")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "받기" })).toBeInTheDocument();
});

it("고른 사진이 없으면 전체(지금 참가 방식 필터)로만 만든다", async () => {
  mockCreate.mockResolvedValue(PENDING);
  render(<StudioPhotoExports eventId="Ev1" selectedIds={[]} channel="BOOTH" onCreated={jest.fn()} />);
  expect(screen.getByRole("button", { name: "고른 사진 묶어 받기 (0)" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "이 참가 방식 전체 묶어 받기" }));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith("Ev1", { filter: { channel: "BOOTH" } }));
});

// 받을 때마다 서버가 다시 본다 — 담긴 사진이 지워졌으면 그 자리에서 무효가 된다.
it("받을 수 없는 묶음(EXPORT-002)은 안내하고 목록을 다시 받는다", async () => {
  mockList.mockResolvedValue([{ ...PENDING, status: "DONE" }]);
  mockDownload.mockRejectedValue(new ApiRequestError({ status: 410, code: "EXPORT-002", apiMessage: "x" }));
  render(<StudioPhotoExports eventId="Ev1" selectedIds={[]} onCreated={jest.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "받기" }));
  expect(await screen.findByText(/받을 수 없는 묶음이에요/)).toBeInTheDocument();
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
});

// Codex 리뷰(#543): 만들기 전에 시작한 목록 응답이 늦게 오면 방금 만든 묶음을 지우고 폴링도 멈췄다.
it("묶음을 만들기 전에 시작한 목록 응답은 방금 만든 묶음을 지우지 않는다", async () => {
  let releaseList: (value: unknown) => void = () => {};
  mockList.mockReset();
  mockList.mockImplementationOnce(() => new Promise((resolve) => { releaseList = resolve; }));
  mockCreate.mockResolvedValue(PENDING);
  render(<StudioPhotoExports eventId="Ev1" selectedIds={[11, 12]} onCreated={jest.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: "고른 사진 묶어 받기 (2)" }));
  expect(await screen.findByText("2장 · 기다리는 중")).toBeInTheDocument();
  await act(async () => releaseList([]));
  expect(screen.getByText("2장 · 기다리는 중")).toBeInTheDocument();
});

it("목록을 못 불러오면 빈 목록으로 보이지 않고 다시 불러오기를 둔다", async () => {
  mockList.mockReset();
  mockList
    .mockRejectedValueOnce(new ApiRequestError({ status: 503, code: "GEN-001", apiMessage: "x" }))
    .mockResolvedValueOnce([{ ...PENDING, status: "DONE" }]);
  render(<StudioPhotoExports eventId="Ev1" selectedIds={[]} onCreated={jest.fn()} />);

  fireEvent.click(await screen.findByRole("button", { name: "목록 다시 불러오기" }));
  expect(await screen.findByRole("button", { name: "받기" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "목록 다시 불러오기" })).not.toBeInTheDocument();
});

// Codex 리뷰(#543): 조회가 폴링 간격보다 오래 걸려도 다 된 묶음이 보여야 한다.
it("조회가 간격보다 오래 걸려도 앞 조회가 끝난 뒤 다음 조회를 한다", async () => {
  jest.useFakeTimers();
  mockList.mockReset();
  let releaseSlow: (value: unknown) => void = () => {};
  mockList
    .mockResolvedValueOnce([PENDING])
    .mockImplementationOnce(() => new Promise((resolve) => { releaseSlow = resolve; }));
  render(<StudioPhotoExports eventId="Ev1" selectedIds={[]} onCreated={jest.fn()} />);
  expect(await screen.findByText("2장 · 기다리는 중")).toBeInTheDocument();

  await act(async () => {
    await jest.advanceTimersByTimeAsync(EXPORT_POLL_MS * 3);
  });
  expect(mockList).toHaveBeenCalledTimes(2);
  await act(async () => releaseSlow([{ ...PENDING, status: "DONE" }]));
  expect(screen.getByRole("button", { name: "받기" })).toBeInTheDocument();
});
