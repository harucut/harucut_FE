import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiRequestError } from "@/lib/clientApi";
import { EventPhotoBox } from "@/components/studio/EventPhotoBox";

const mockList = jest.fn();
const mockDownload = jest.fn();
const mockDelete = jest.fn();
const mockMyEvents = jest.fn();
const mockRevokeLinks = jest.fn();

jest.mock("@/components/layout/AppNav", () => ({ AppNav: () => null }));
jest.mock("@/lib/studio/photosApi", () => ({
  ...jest.requireActual("@/lib/studio/photosApi"),
  listEventPhotos: (...a: unknown[]) => mockList(...a),
  getEventPhotoDownload: (...a: unknown[]) => mockDownload(...a),
  deleteEventPhoto: (...a: unknown[]) => mockDelete(...a),
  revokeEventPhotoResultAccess: (...a: unknown[]) => mockRevokeLinks(...a),
  listPhotoExports: () => Promise.resolve([]),
}));
const mockNativeSave = jest.fn();
jest.mock("@/lib/nativeBridge", () => ({
  ...jest.requireActual("@/lib/nativeBridge"),
  nativeSaveImageUrl: (...a: unknown[]) => mockNativeSave(...a),
}));
jest.mock("@/lib/studio/accessApi", () => ({
  ...jest.requireActual("@/lib/studio/accessApi"),
  listMyEvents: () => mockMyEvents(),
}));

const DONE = { photoId: 11, status: "DONE", createdAt: "2026-10-26T10:00:00+09:00", channel: "BYOD", frameVersionId: 41, thumbnailUrl: "https://s3/t11" };
const FAILED = { photoId: 12, status: "FAILED", createdAt: "2026-10-26T10:01:00+09:00", channel: "BOOTH", frameVersionId: 41, failure: { code: "INPUT_MISSING", retryable: false } };

/** 저장·지우기는 크게 보기 안에 있다. */
async function openViewer() {
  fireEvent.click(await screen.findByRole("button", { name: /크게 보기$/ }));
  return within(await screen.findByRole("dialog"));
}

function access(permissions: string[], role?: string) {
  return [{ eventId: "Ev1", name: "민지 ♥ 준호", status: "LIVE", access: { role, permissions } }];
}

beforeEach(() => {
  jest.clearAllMocks();
  // 기본은 일반 브라우저(앱 셸 아님).
  mockNativeSave.mockResolvedValue(null);
  mockList.mockResolvedValue({ items: [DONE, FAILED], nextCursor: null });
  mockDownload.mockReset();
  mockDownload.mockResolvedValue({ url: "https://s3/full.jpg", expiresAt: "x" });
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
  const img = await screen.findByRole("img", { name: /사진$/ });
  fireEvent.error(img);
  fireEvent.error(img);
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
});

it("지우기는 크게 보기에서 확인 뒤에 하고, 남은 사진이 없으면 닫고 목록에서 뺀다", async () => {
  mockDelete.mockResolvedValue(undefined);
  mockDownload.mockResolvedValue({ url: "https://s3/full11.jpg", expiresAt: "x" });
  render(<EventPhotoBox eventId="Ev1" />);
  const viewer = await openViewer();
  fireEvent.click(viewer.getByRole("button", { name: "지우기" }));
  expect(mockDelete).not.toHaveBeenCalled();
  const confirm = await screen.findByRole("dialog", { name: "이 사진을 지울까요?" });
  await act(async () => {
    fireEvent.click(within(confirm).getByRole("button", { name: "지우기" }));
  });
  expect(mockDelete).toHaveBeenCalledWith("Ev1", 11, expect.any(AbortSignal));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

// 썸네일은 긴 변 512px 라 크게 보면 흐리다. 내려받기 권한이 있으면 원본으로 바꾼다.
it("크게 보기는 원본으로 바꾸고, 다음 사진으로 넘길 수 있다", async () => {
  const SECOND = { ...DONE, photoId: 13, thumbnailUrl: "https://s3/thumb13.jpg" };
  mockList.mockResolvedValue({ items: [DONE, SECOND], nextCursor: null });
  mockDownload.mockImplementation(async (_e: string, id: number) => ({ url: `https://s3/full${id}.jpg`, expiresAt: "x" }));
  render(<EventPhotoBox eventId="Ev1" />);
  fireEvent.click((await screen.findAllByRole("button", { name: /크게 보기$/ }))[0]);
  const viewer = within(await screen.findByRole("dialog"));
  await waitFor(() => expect(viewer.getByRole("img")).toHaveAttribute("src", "https://s3/full11.jpg"));

  expect(viewer.getByRole("button", { name: "이전 사진" })).toBeDisabled();
  fireEvent.click(viewer.getByRole("button", { name: "다음 사진" }));
  await waitFor(() => expect(mockDownload).toHaveBeenCalledWith("Ev1", 13));
  expect(viewer.getByText("2/2")).toBeInTheDocument();
  expect(viewer.getByRole("button", { name: "다음 사진" })).toBeDisabled();
});

it("필터 결과가 없으면 조건을 지울 수 있고, 처음부터 없으면 안내만 한다", async () => {
  mockList.mockResolvedValue({ items: [], nextCursor: null });
  render(<EventPhotoBox eventId="Ev1" />);
  expect(await screen.findByText(/아직 찍은 사진이 없어요/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("참가 방식"), { target: { value: "BOOTH" } });
  fireEvent.click(await screen.findByRole("button", { name: "조건 지우기" }));
  expect(await screen.findByText(/아직 찍은 사진이 없어요/)).toBeInTheDocument();
  expect(mockList).toHaveBeenLastCalledWith("Ev1", {});
});

it("서버가 권한으로 막으면(PHOTO-001) 그 문구를 보여 준다", async () => {
  mockList.mockRejectedValue(new ApiRequestError({ status: 403, code: "PHOTO-001", apiMessage: "x" }));
  render(<EventPhotoBox eventId="Ev1" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("이 사진을 다룰 권한이 없어요");
});

// 묶음 받기는 따로 받은 권한(BULK_DOWNLOAD)이다. 완성 사진만 고를 수 있다.
it("한꺼번에 받기 권한이 있을 때만 완성 사진에 고르기를 두고, 필터를 바꾸면 고른 것을 비운다", async () => {
  mockMyEvents.mockResolvedValue(access(["VIEW_PHOTOS", "BULK_DOWNLOAD"]));
  render(<EventPhotoBox eventId="Ev1" />);
  const box = await screen.findByRole("checkbox");
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  fireEvent.click(box);
  expect(screen.getByRole("button", { name: "고른 사진 묶어 받기 (1)" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("참가 방식"), { target: { value: "BOOTH" } });
  expect(screen.getByRole("button", { name: "고른 사진 묶어 받기 (0)" })).toBeDisabled();
});

it("한꺼번에 받기 권한이 없으면 고르기와 묶음 영역이 없다", async () => {
  render(<EventPhotoBox eventId="Ev1" />);
  await screen.findByRole("button", { name: /크게 보기$/ });
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "한꺼번에 받기" })).not.toBeInTheDocument();
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

// Codex 리뷰(#542): 앱 셸 안에서 링크를 열면 외부 브라우저로 나간다 — 네이티브 사진첩 저장으로 보낸다.
it("앱 안에서는 저장을 네이티브 사진첩 저장으로 보내고 링크를 열지 않는다", async () => {
  mockNativeSave.mockResolvedValue({ ok: true });
  mockDownload.mockResolvedValue({ url: "https://s3/full11.jpg", expiresAt: "x" });
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<EventPhotoBox eventId="Ev1" />);
  const viewer = await openViewer();
  fireEvent.click(viewer.getByRole("button", { name: "저장" }));
  expect(await screen.findByText("사진첩에 저장했어요.")).toBeInTheDocument();
  expect(mockNativeSave).toHaveBeenCalledWith("https://s3/full11.jpg", "harucut-11.jpg");
  expect(click).not.toHaveBeenCalled();
  click.mockRestore();
});

// Codex 리뷰(#542): 지우기가 응답 없이 멈추면 확인 창에서 빠져나올 수 없었다.
it("지우기 요청이 멈추면 상한 뒤 확인 창을 풀고 알린다", async () => {
  jest.useFakeTimers();
  mockDelete.mockImplementation(
    (_e: string, _p: number, signal?: AbortSignal) =>
      new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
  );
  render(<EventPhotoBox eventId="Ev1" />);
  const viewer = await openViewer();
  fireEvent.click(viewer.getByRole("button", { name: "지우기" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "이 사진을 지울까요?" })).getByRole("button", { name: "지우기" }));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(30_000);
  });
  expect(screen.queryByRole("dialog", { name: "이 사진을 지울까요?" })).not.toBeInTheDocument();
  expect(screen.getByText(/지우지 못했어요|요청/)).toBeInTheDocument();
  jest.useRealTimers();
});

// Codex 리뷰(#543): 필터를 바꿔 새 목록을 받는 동안 이전 목록의 사진을 고르면 다른 필터의 사진이 묶음에 들어간다.
it("필터를 바꿔 새 목록을 받는 동안에는 사진 고르기를 막는다", async () => {
  mockMyEvents.mockResolvedValue(access(["VIEW_PHOTOS", "BULK_DOWNLOAD"]));
  mockList
    .mockResolvedValueOnce({ items: [DONE, FAILED], nextCursor: null })
    .mockImplementationOnce(() => new Promise(() => {}));
  render(<EventPhotoBox eventId="Ev1" />);
  expect(await screen.findByRole("checkbox")).toBeEnabled();
  fireEvent.change(screen.getByLabelText("참가 방식"), { target: { value: "BOOTH" } });
  // 필터를 바꾸면 이전 목록을 바로 비우므로 이전 사진을 고를 길이 없다.
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

// Codex 리뷰(#542): 필터를 바꾼 뒤 첫 쪽이 실패하면 이전 필터의 커서로 「더 보기」를 하면 안 된다.
it("필터를 바꾼 뒤 첫 쪽이 실패하면 이전 목록과 커서를 남기지 않는다", async () => {
  mockList
    .mockResolvedValueOnce({ items: [DONE], nextCursor: "c-all-2" })
    .mockRejectedValueOnce(new ApiRequestError({ status: 503, code: "GEN-001", apiMessage: "x" }));
  render(<EventPhotoBox eventId="Ev1" />);
  expect(await screen.findByRole("button", { name: "더 보기" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("참가 방식"), { target: { value: "BOOTH" } });
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
});

// 재대조 항목(R5 L326): 서버가 지원하는 기간 필터. 서울 날짜 하루 전체를 보낸다(to 는 미포함).
it("기간을 고르면 서울 날짜의 시작과 다음 날 0시로 다시 받고, 조건을 지우면 비운다", async () => {
  render(<EventPhotoBox eventId="Ev1" />);
  await screen.findAllByRole("listitem");
  mockList.mockResolvedValue({ items: [], nextCursor: null });

  fireEvent.change(screen.getByLabelText("시작일"), { target: { value: "2026-11-14" } });
  await waitFor(() => expect(mockList).toHaveBeenLastCalledWith("Ev1", { from: "2026-11-14T00:00:00+09:00", to: undefined }));

  fireEvent.change(screen.getByLabelText("종료일"), { target: { value: "2026-11-14" } });
  await waitFor(() =>
    expect(mockList).toHaveBeenLastCalledWith("Ev1", {
      from: "2026-11-14T00:00:00+09:00",
      to: new Date("2026-11-15T00:00:00+09:00").toISOString(),
    }),
  );

  fireEvent.click(await screen.findByRole("button", { name: "조건 지우기" }));
  await waitFor(() => expect(mockList).toHaveBeenLastCalledWith("Ev1", {}));
  expect(screen.getByLabelText("시작일")).toHaveValue("");
});

it("프레임이 둘 이상이면 프레임으로 거를 수 있다", async () => {
  mockList.mockResolvedValue({ items: [{ ...DONE, frameVersionId: 31 }, { ...DONE, photoId: 99, frameVersionId: 32 }], nextCursor: null });
  render(<EventPhotoBox eventId="Ev1" />);
  fireEvent.change(await screen.findByLabelText("프레임"), { target: { value: "32" } });
  await waitFor(() => expect(mockList).toHaveBeenLastCalledWith("Ev1", { frameVersionId: 32 }));
});

describe("보낸 링크 끊기", () => {
  async function openRevokeDialog() {
    render(<EventPhotoBox eventId="Ev1" />);
    const viewer = await openViewer();
    fireEvent.click(viewer.getByRole("button", { name: "보낸 링크 끊기" }));
    return await screen.findByRole("dialog", { name: "보낸 링크를 끊을까요?" });
  }

  it("이유를 적어야 끊고, 끊은 수를 알린다. 사진은 지우지 않는다", async () => {
    mockRevokeLinks.mockResolvedValue({ revokedCount: 2 });
    const dialog = await openRevokeDialog();
    const submit = within(dialog).getByRole("button", { name: "링크 끊기" });
    expect(submit).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("끊는 이유"), { target: { value: "오발송" } });
    fireEvent.click(submit);

    await waitFor(() => expect(mockRevokeLinks).toHaveBeenCalledWith("Ev1", 11, "오발송"));
    expect(await screen.findByText(/결과 링크 2개를 끊었어요/)).toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "보낸 링크를 끊을까요?" })).not.toBeInTheDocument();
  });

  it("끊을 링크가 없으면 없다고 말한다", async () => {
    mockRevokeLinks.mockResolvedValue({ revokedCount: 0 });
    const dialog = await openRevokeDialog();
    fireEvent.change(within(dialog).getByLabelText("끊는 이유"), { target: { value: "오발송" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "링크 끊기" }));
    expect(await screen.findByText("끊을 결과 링크가 없어요.")).toBeInTheDocument();
  });

  it("실패하면 입력을 잃지 않고 대화상자 안에서 알린다", async () => {
    mockRevokeLinks.mockRejectedValue(new Error("down"));
    const dialog = await openRevokeDialog();
    fireEvent.change(within(dialog).getByLabelText("끊는 이유"), { target: { value: "오발송" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "링크 끊기" }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("끊는 이유")).toHaveValue("오발송");
  });

  it("지울 권한이 없으면 버튼이 없다", async () => {
    mockMyEvents.mockResolvedValue(access(["VIEW_PHOTOS", "DOWNLOAD_PHOTOS"]));
    render(<EventPhotoBox eventId="Ev1" />);
    const viewer = await openViewer();
    await viewer.findByRole("button", { name: "저장" });
    expect(viewer.queryByRole("button", { name: "보낸 링크 끊기" })).not.toBeInTheDocument();
  });
});
