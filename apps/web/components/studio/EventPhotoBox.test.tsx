import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiRequestError } from "@/lib/clientApi";
import { EventPhotoBox } from "@/components/studio/EventPhotoBox";

const mockList = jest.fn();
const mockDownload = jest.fn();
const mockDelete = jest.fn();
const mockMyEvents = jest.fn();

jest.mock("@/components/layout/AppNav", () => ({ AppNav: () => null }));
jest.mock("@/lib/studio/photosApi", () => ({
  ...jest.requireActual("@/lib/studio/photosApi"),
  listEventPhotos: (...a: unknown[]) => mockList(...a),
  getEventPhotoDownload: (...a: unknown[]) => mockDownload(...a),
  deleteEventPhoto: (...a: unknown[]) => mockDelete(...a),
}));
jest.mock("@/lib/studio/accessApi", () => ({
  ...jest.requireActual("@/lib/studio/accessApi"),
  listMyEvents: () => mockMyEvents(),
}));

const DONE = { photoId: 11, status: "DONE", createdAt: "2026-10-26T10:00:00+09:00", channel: "BYOD", frameVersionId: 41, thumbnailUrl: "https://s3/t11" };
const FAILED = { photoId: 12, status: "FAILED", createdAt: "2026-10-26T10:01:00+09:00", channel: "BOOTH", frameVersionId: 41, failure: { code: "INPUT_MISSING", retryable: false } };

function access(permissions: string[], role?: string) {
  return [{ eventId: "Ev1", name: "민지 ♥ 준호", status: "LIVE", access: { role, permissions } }];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue({ items: [DONE, FAILED], nextCursor: null });
  mockMyEvents.mockResolvedValue(access(["VIEW_PHOTOS", "DOWNLOAD_PHOTOS", "DELETE_PHOTOS"]));
});

it("사진과 실패 사유를 보여 주고, 권한이 있는 동작만 둔다", async () => {
  mockMyEvents.mockResolvedValue(access(["VIEW_PHOTOS"]));
  render(<EventPhotoBox eventId="Ev1" />);
  expect(await screen.findByRole("heading", { name: "민지 ♥ 준호 사진함" })).toBeInTheDocument();
  expect(screen.getByText("촬영 사진이 빠졌어요")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "지우기" })).not.toBeInTheDocument();
});

it("필터를 바꾸면 첫 쪽부터 다시 받는다", async () => {
  render(<EventPhotoBox eventId="Ev1" />);
  await screen.findByText("촬영 사진이 빠졌어요");
  fireEvent.change(screen.getByLabelText("참가 방식"), { target: { value: "BOOTH" } });
  await waitFor(() => expect(mockList).toHaveBeenLastCalledWith("Ev1", { channel: "BOOTH" }));
});

it("다음 쪽이 있으면 더 보기로 이어 받는다", async () => {
  mockList.mockResolvedValueOnce({ items: [DONE], nextCursor: "c2" }).mockResolvedValueOnce({ items: [FAILED], nextCursor: null });
  render(<EventPhotoBox eventId="Ev1" />);
  fireEvent.click(await screen.findByRole("button", { name: "더 보기" }));
  await waitFor(() => expect(mockList).toHaveBeenLastCalledWith("Ev1", {}, "c2"));
  expect(await screen.findByText("촬영 사진이 빠졌어요")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
});

// 썸네일은 5분짜리 서명 URL 이다. 깨지면 새 주소를 받는다.
it("썸네일이 깨지면 목록을 다시 받는다(여러 장이어도 한 번)", async () => {
  render(<EventPhotoBox eventId="Ev1" />);
  const img = await screen.findByRole("img");
  fireEvent.error(img);
  fireEvent.error(img);
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
});

it("지우기는 확인 뒤에 하고 목록에서 뺀다", async () => {
  mockDelete.mockResolvedValue(undefined);
  render(<EventPhotoBox eventId="Ev1" />);
  fireEvent.click(await screen.findByRole("button", { name: "지우기" }));
  expect(mockDelete).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "지우기" }));
  });
  expect(mockDelete).toHaveBeenCalledWith("Ev1", 11);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("서버가 권한으로 막으면(PHOTO-001) 그 문구를 보여 준다", async () => {
  mockList.mockRejectedValue(new ApiRequestError({ status: 403, code: "PHOTO-001", apiMessage: "x" }));
  render(<EventPhotoBox eventId="Ev1" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("이 사진을 다룰 권한이 없어요");
});

// Codex 리뷰(#542): 필터를 바꾸기 전에 시작한 조회가 늦게 오면 지금 필터의 목록을 덮으면 안 된다.
it("필터를 바꾸기 전에 시작한 조회 응답은 버린다", async () => {
  const BOOTH_PHOTO = { ...DONE, photoId: 21, channel: "BOOTH", thumbnailUrl: "https://s3/t21" };
  let releaseBooth: (value: unknown) => void = () => {};
  mockList
    .mockResolvedValueOnce({ items: [DONE, FAILED], nextCursor: null })
    .mockImplementationOnce(() => new Promise((resolve) => { releaseBooth = resolve; }))
    .mockResolvedValueOnce({ items: [DONE], nextCursor: null });
  render(<EventPhotoBox eventId="Ev1" />);
  await screen.findByText("촬영 사진이 빠졌어요");

  fireEvent.change(screen.getByLabelText("참가 방식"), { target: { value: "BOOTH" } });
  fireEvent.change(screen.getByLabelText("참가 방식"), { target: { value: "BYOD" } });
  await waitFor(() => expect(mockList).toHaveBeenLastCalledWith("Ev1", { channel: "BYOD" }));
  await waitFor(() => expect(screen.queryByText("촬영 사진이 빠졌어요")).not.toBeInTheDocument());

  await act(async () => releaseBooth({ items: [BOOTH_PHOTO], nextCursor: "c-booth" }));
  expect(document.querySelector('img[src="https://s3/t21"]')).toBeNull();
  expect(screen.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
});
