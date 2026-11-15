/**
 * 공유 창(2026-11-16 「하단에서 스륵 올라오는 일반적인 거」 + 참고 그림 — 사진 카드 아래 카카오톡·인스타그램·스레드·X·링크 복사).
 *
 * 지키는 것
 * - 링크는 창을 열 때 받아 둔다. 누른 뒤에 받으면 제스처가 풀려 새 창·복사가 막힌다.
 * - 스레드·X·링크 복사는 받는 사람 페이지(/s/<토큰>) 링크다. 미리보기에 사진이 뜬다.
 * - 카카오톡·인스타그램은 사진 파일을 넘긴다. 파일을 넘길 수 없는 기기(PC)에는 두 단추가 없다.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PhotoShareSheet } from "@/components/share/PhotoShareSheet";

const mockCreateMediaShareLink = jest.fn();
jest.mock("@/lib/userMediaApi", () => ({
  createMediaShareLink: (...args: unknown[]) => mockCreateMediaShareLink(...args),
}));

const mockSharePhoto = jest.fn();
jest.mock("@/lib/share", () => ({
  ...jest.requireActual("@/lib/share"),
  sharePhoto: (...args: unknown[]) => mockSharePhoto(...args),
}));

const TOKEN = "tok_0123456789abcdef";
const SHARE_URL = `http://localhost/s/${TOKEN}`;
const PHOTO_URL = "https://cdn.example/media/1.jpg?sig=1";

/** 창은 사진마다 링크를 기억한다(모듈 안). 테스트마다 다른 사진으로 연다. */
let nextMediaId = 100;

function renderSheet(overrides: { file?: File | null; onClose?: () => void } = {}) {
  const mediaId = (nextMediaId += 1);
  const onClose = overrides.onClose ?? jest.fn();
  const getUrl = jest.fn(async () => PHOTO_URL);
  render(
    <PhotoShareSheet
      open
      onClose={onClose}
      mediaId={mediaId}
      title="우리 넷"
      thumbnailSrc={PHOTO_URL}
      photo={{ file: overrides.file ?? null, getUrl, filename: "우리 넷.jpg" }}
    />,
  );
  return { mediaId, onClose, getUrl, sheet: screen.getByRole("dialog", { name: "사진 공유하기" }) };
}

/** 파일 공유가 되는 휴대폰 브라우저. jsdom 에는 navigator.canShare 도 matchMedia 도 없다. */
function asPhone() {
  Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({ matches: query === "(pointer: coarse)", media: query }),
    configurable: true,
  });
}

beforeEach(() => {
  mockCreateMediaShareLink.mockReset();
  mockCreateMediaShareLink.mockResolvedValue(TOKEN);
  mockSharePhoto.mockReset();
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "canShare");
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(window, "matchMedia");
  Reflect.deleteProperty(document, "execCommand");
  delete window.__HARUCUT_NATIVE__;
  delete window.ReactNativeWebView;
  jest.restoreAllMocks();
});

it("열면 사진 카드와 보낼 곳이 뜨고, 링크를 받아 둔다", async () => {
  const { mediaId, sheet } = renderSheet();

  expect(within(sheet).getByText("우리 넷")).toBeInTheDocument();
  expect(mockCreateMediaShareLink).toHaveBeenCalledWith(mediaId);
  // 링크를 받기 전에는 링크로 가는 단추가 눌리지 않는다.
  expect(within(sheet).getByRole("button", { name: "X" })).toBeDisabled();
  await waitFor(() => expect(within(sheet).getByRole("button", { name: "X" })).toBeEnabled());
});

it("PC 처럼 사진 파일을 넘길 수 없는 기기에는 카카오톡·인스타그램이 없다", async () => {
  const { sheet } = renderSheet();
  await waitFor(() => expect(within(sheet).getByRole("button", { name: "링크 복사" })).toBeEnabled());

  expect(within(sheet).queryByRole("button", { name: "카카오톡" })).toBeNull();
  expect(within(sheet).queryByRole("button", { name: "인스타그램" })).toBeNull();
  expect(within(sheet).getByRole("button", { name: "스레드" })).toBeInTheDocument();
});

it("X·스레드는 받는 사람 페이지 링크로 새 글 쓰기를 연다", async () => {
  const open = jest.spyOn(window, "open").mockReturnValue(null);
  const { onClose, sheet } = renderSheet();
  await waitFor(() => expect(within(sheet).getByRole("button", { name: "X" })).toBeEnabled());

  fireEvent.click(within(sheet).getByRole("button", { name: "X" }));
  expect(open).toHaveBeenLastCalledWith(
    `https://x.com/intent/tweet?url=${encodeURIComponent(SHARE_URL)}`,
    "_blank",
    "noopener,noreferrer",
  );
  fireEvent.click(within(sheet).getByRole("button", { name: "스레드" }));
  expect(open).toHaveBeenLastCalledWith(
    `https://www.threads.com/intent/post?url=${encodeURIComponent(SHARE_URL)}`,
    "_blank",
    "noopener,noreferrer",
  );
  expect(onClose).toHaveBeenCalled();
});

it("링크 복사는 같은 링크를 복사하고 「복사했어요」로 바뀐다", async () => {
  const writeText = jest.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  const { sheet } = renderSheet();
  await waitFor(() => expect(within(sheet).getByRole("button", { name: "링크 복사" })).toBeEnabled());

  await act(async () => {
    fireEvent.click(within(sheet).getByRole("button", { name: "링크 복사" }));
  });
  expect(writeText).toHaveBeenCalledWith(SHARE_URL);
  expect(within(sheet).getByRole("button", { name: "복사했어요" })).toBeInTheDocument();
});

it("브라우저가 복사를 막으면 허용하라고 말한다 — 다시 눌러도 같은 자리에서 막힌다", async () => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: async () => Promise.reject(new DOMException("denied", "NotAllowedError")) },
    configurable: true,
  });
  Object.defineProperty(document, "execCommand", { value: () => false, configurable: true });
  const { sheet } = renderSheet();
  await waitFor(() => expect(within(sheet).getByRole("button", { name: "링크 복사" })).toBeEnabled());

  await act(async () => {
    fireEvent.click(within(sheet).getByRole("button", { name: "링크 복사" }));
  });
  expect(within(sheet).getByRole("alert")).toHaveTextContent("복사가 막혔어요. 브라우저에서 복사를 허용한 뒤 다시 눌러 주세요.");
});

it("링크를 못 만들면 그 자리에서 다시 시도한다", async () => {
  mockCreateMediaShareLink.mockRejectedValueOnce(new Error("boom"));
  const { sheet } = renderSheet();

  const retry = await within(sheet).findByRole("button", { name: "다시 시도" });
  expect(within(sheet).getByText("링크를 만들지 못했어요.")).toBeInTheDocument();
  expect(within(sheet).getByRole("button", { name: "X" })).toBeDisabled();

  fireEvent.click(retry);
  await waitFor(() => expect(within(sheet).getByRole("button", { name: "X" })).toBeEnabled());
  expect(mockCreateMediaShareLink).toHaveBeenCalledTimes(2);
});

it("휴대폰은 받아 둔 사진이 있어야 카카오톡·인스타그램이 눌리고, 사진과 받는 사람 링크를 넘긴다", async () => {
  asPhone();
  mockSharePhoto.mockResolvedValue("shared");
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "우리 넷.jpg", { type: "image/jpeg" });
  const { onClose, sheet } = renderSheet({ file });
  await waitFor(() => expect(within(sheet).getByRole("button", { name: "X" })).toBeEnabled());

  await act(async () => {
    fireEvent.click(within(sheet).getByRole("button", { name: "인스타그램" }));
  });
  expect(mockSharePhoto).toHaveBeenCalledWith(
    expect.objectContaining({ file, filename: "우리 넷.jpg", link: SHARE_URL, title: "우리 넷 | 하루컷" }),
  );
  // 공유 창에서 보냈으면 이 창도 닫는다.
  expect(onClose).toHaveBeenCalled();
});

it("휴대폰에서 사진을 아직 못 받았으면 카카오톡·인스타그램은 기다린다", async () => {
  asPhone();
  const { sheet } = renderSheet({ file: null });
  await waitFor(() => expect(within(sheet).getByRole("button", { name: "X" })).toBeEnabled());

  expect(within(sheet).getByRole("button", { name: "카카오톡" })).toBeDisabled();
  expect(within(sheet).getByRole("button", { name: "인스타그램" })).toBeDisabled();
});

it("앱에서는 사진을 받아 두지 않아도 바로 넘긴다 — 네이티브가 그 자리에서 받는다", async () => {
  window.__HARUCUT_NATIVE__ = { version: 5, platform: "ios" };
  window.ReactNativeWebView = { postMessage: jest.fn() };
  mockSharePhoto.mockResolvedValue("cancelled");
  const { onClose, sheet } = renderSheet({ file: null });

  const kakao = within(sheet).getByRole("button", { name: "카카오톡" });
  expect(kakao).toBeEnabled();
  await act(async () => {
    fireEvent.click(kakao);
  });
  expect(mockSharePhoto).toHaveBeenCalledTimes(1);
  // 공유 창을 그냥 닫았으면 이 창은 그대로다 — 다른 곳으로 보낼 수 있다.
  expect(onClose).not.toHaveBeenCalled();
});

it("사진을 못 보냈으면 이유 대신 다시 누르라고 말한다 — 네이티브 원문은 띄우지 않는다", async () => {
  window.__HARUCUT_NATIVE__ = { version: 5, platform: "android" };
  window.ReactNativeWebView = { postMessage: jest.fn() };
  mockSharePhoto.mockRejectedValue(new Error("Failed to share the file: activity not found"));
  const { sheet } = renderSheet();

  await act(async () => {
    fireEvent.click(within(sheet).getByRole("button", { name: "카카오톡" }));
  });
  expect(within(sheet).getByRole("alert")).toHaveTextContent("사진을 보내지 못했어요. 다시 눌러 주세요.");
});

it("X 로 닫는다", async () => {
  const { onClose, sheet } = renderSheet();
  fireEvent.click(within(sheet).getByRole("button", { name: "닫기" }));
  expect(onClose).toHaveBeenCalled();
  await waitFor(() => expect(mockCreateMediaShareLink).toHaveBeenCalled());
});
