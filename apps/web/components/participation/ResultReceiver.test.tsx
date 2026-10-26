import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiRequestError } from "@/lib/clientApi";
import { ResultReceiver, RESULT_POLL_MS } from "@/components/participation/ResultReceiver";

const mockGetResult = jest.fn();
const mockGetResultDownload = jest.fn();

jest.mock("@/lib/event/eventApi", () => ({
  getResult: (...args: unknown[]) => mockGetResult(...args),
  getResultDownload: (...args: unknown[]) => mockGetResultDownload(...args),
}));

const TOKEN_A = "A".repeat(43);
const TOKEN_B = "B".repeat(43);

function done(eventName = "민지·현우 결혼식") {
  return {
    status: "DONE",
    eventName,
    thumbnailUrl: "https://bucket.s3.amazonaws.com/thumb.jpg?X-Amz-Signature=abc",
    expiresAt: "2026-11-30T00:00:00Z",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState({}, "", "/r");
});

afterEach(() => {
  jest.useRealTimers();
});

it("토큰이 없으면 요청하지 않고 링크를 다시 열라고 안내한다", async () => {
  render(<ResultReceiver />);
  expect(await screen.findByRole("alert")).toHaveTextContent("받은 링크를 다시 열어 주세요");
  expect(mockGetResult).not.toHaveBeenCalled();
});

it("fragment 의 토큰으로 결과를 불러와 행사 이름·미리보기를 보여 준다", async () => {
  window.history.replaceState({}, "", `/r#${TOKEN_A}`);
  mockGetResult.mockResolvedValue(done());

  render(<ResultReceiver />);

  expect(await screen.findByRole("heading", { name: "민지·현우 결혼식" })).toBeInTheDocument();
  expect(mockGetResult).toHaveBeenCalledWith(TOKEN_A, expect.any(AbortSignal));
  expect(screen.getByAltText("완성된 사진 미리보기")).toHaveAttribute("referrerpolicy", "no-referrer");
});

it("저장을 누르면 같은 토큰으로 다운로드 주소를 받아 noreferrer 링크로 연다", async () => {
  window.history.replaceState({}, "", `/r#${TOKEN_A}`);
  mockGetResult.mockResolvedValue(done());
  mockGetResultDownload.mockResolvedValue({ url: "https://bucket/x.jpg", expiresAt: "x" });
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.rel).toBe("noreferrer");
    expect(this.href).toBe("https://bucket/x.jpg");
  });

  render(<ResultReceiver />);
  fireEvent.click(await screen.findByRole("button", { name: "사진 저장" }));

  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(mockGetResultDownload).toHaveBeenCalledWith(TOKEN_A);
  click.mockRestore();
});

// R5 16절 — 같은 탭에서 다른 결과 링크로 바뀌면 이전 결과를 먼저 버린다.
it("다른 결과 링크로 바뀌면 이전 결과를 지우고 새 토큰으로 다시 묻는다", async () => {
  window.history.replaceState({}, "", `/r#${TOKEN_A}`);
  mockGetResult.mockResolvedValueOnce(done("A 행사"));
  let resolveB: (value: unknown) => void = () => {};
  mockGetResult.mockImplementationOnce(() => new Promise((resolve) => { resolveB = resolve; }));

  render(<ResultReceiver />);
  expect(await screen.findByRole("heading", { name: "A 행사" })).toBeInTheDocument();

  act(() => {
    window.history.replaceState({}, "", `/r#${TOKEN_B}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });

  expect(screen.queryByRole("heading", { name: "A 행사" })).not.toBeInTheDocument();
  expect(screen.queryByAltText("완성된 사진 미리보기")).not.toBeInTheDocument();
  expect(mockGetResult).toHaveBeenLastCalledWith(TOKEN_B, expect.any(AbortSignal));

  await act(async () => resolveB(done("B 행사")));
  expect(await screen.findByRole("heading", { name: "B 행사" })).toBeInTheDocument();
});

it("토큰 문법이 아닌 fragment 는 보내지 않는다", async () => {
  window.history.replaceState({}, "", "/r#<script>");
  render(<ResultReceiver />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(mockGetResult).not.toHaveBeenCalled();
});

it("준비 중이면 같은 토큰으로 다시 묻는다", async () => {
  jest.useFakeTimers();
  window.history.replaceState({}, "", `/r#${TOKEN_A}`);
  mockGetResult
    .mockResolvedValueOnce({ ...done(), status: "PENDING", thumbnailUrl: null })
    .mockResolvedValueOnce(done());

  render(<ResultReceiver />);
  expect(await screen.findByText(/사진을 만들고 있어요/)).toBeInTheDocument();

  await act(async () => {
    await jest.advanceTimersByTimeAsync(RESULT_POLL_MS);
  });
  expect(mockGetResult).toHaveBeenCalledTimes(2);
  expect(await screen.findByRole("button", { name: "사진 저장" })).toBeInTheDocument();
});

it("만료된 링크는 기간이 지났다고 알리고 저장 버튼을 두지 않는다", async () => {
  window.history.replaceState({}, "", `/r#${TOKEN_A}`);
  mockGetResult.mockResolvedValue({ ...done(), status: "EXPIRED", thumbnailUrl: null });
  render(<ResultReceiver />);
  expect(await screen.findByText("사진을 받을 수 있는 기간이 지났어요.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "사진 저장" })).not.toBeInTheDocument();
});

it("잘못된 토큰(RESULT-001)은 서버 문구로 안내하고 다시 확인을 두지 않는다", async () => {
  window.history.replaceState({}, "", `/r#${TOKEN_A}`);
  mockGetResult.mockRejectedValue(new ApiRequestError({ status: 401, code: "RESULT-001", apiMessage: "x" }));
  render(<ResultReceiver />);
  expect(await screen.findByRole("alert")).toHaveTextContent("결과 링크가 올바르지 않아요.");
  expect(screen.queryByRole("button", { name: "다시 확인" })).not.toBeInTheDocument();
});

// 같은 IP 에서 틀린 토큰을 분당 30회 넘게 내면 429(백엔드 fork #20). 잠시 뒤 다시 하면 되는 실패다.
it("요청이 너무 잦으면(GEN-061) 안내하고 다시 확인을 둔다", async () => {
  window.history.replaceState({}, "", `/r#${TOKEN_A}`);
  mockGetResult.mockRejectedValue(new ApiRequestError({ status: 429, code: "GEN-061", apiMessage: "x" }));
  render(<ResultReceiver />);
  expect(await screen.findByRole("alert")).toHaveTextContent("요청이 너무 많아요.");
  expect(screen.getByRole("button", { name: "다시 확인" })).toBeInTheDocument();
});

// P2B-4 — 결과 화면도 그 결과가 만들어진 경험 버전의 행사 테마로 그린다.
it("행사 테마의 색·로고·문구로 그린다", async () => {
  window.history.replaceState({}, "", `/r#${TOKEN_A}`);
  mockGetResult.mockResolvedValue({
    ...done(),
    theme: {
      colors: { bg: "#FFF8F3", accent: "#C8553D" },
      font: "SYSTEM",
      logoUrl: "https://bucket/logo.png",
      copy: { done: "와 주셔서 고마워요!" },
      branding: { hideHarucutBranding: false, outputLogo: "NONE" },
    },
  });
  render(<ResultReceiver />);
  expect(await screen.findByText("와 주셔서 고마워요!")).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveStyle({ "--ev-bg": "#FFF8F3", "--ev-accent": "#C8553D" });
  expect(screen.getByAltText("행사 로고")).toHaveAttribute("referrerpolicy", "no-referrer");
});

it("주최자 문구가 없는 화면은 기본 문구를 쓴다", async () => {
  window.history.replaceState({}, "", `/r#${TOKEN_A}`);
  mockGetResult.mockResolvedValue({ ...done(), status: "EXPIRED", thumbnailUrl: null, theme: { copy: { done: "x" } } });
  render(<ResultReceiver />);
  expect(await screen.findByText("사진을 받을 수 있는 기간이 지났어요.")).toBeInTheDocument();
});
