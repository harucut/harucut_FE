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
