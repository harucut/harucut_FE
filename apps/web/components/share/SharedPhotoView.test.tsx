/**
 * 받는 사람 페이지(2026-11-16 「받은 사람은 사진만 볼 수 있게 다운로드 할 수 있는」). 사진과 「사진 저장」뿐이다.
 * 그림과 저장은 이 사이트의 /s/<토큰>/image·/download 를 거친다 — 부를 때마다 새 서명 주소로 보낸다.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SharedPhotoUnavailable, SharedPhotoView } from "@/components/share/SharedPhotoView";

const mockPrepared = { current: null as File | null };
jest.mock("@/hooks/usePreparedPhotoFile", () => ({
  usePreparedPhotoFile: () => mockPrepared.current,
}));

const mockSaveImageFromSignedUrl = jest.fn();
const mockSharePhotoFile = jest.fn();
jest.mock("@/lib/share", () => ({
  ...jest.requireActual("@/lib/share"),
  saveImageFromSignedUrl: (...args: unknown[]) => mockSaveImageFromSignedUrl(...args),
  sharePhotoFile: (...args: unknown[]) => mockSharePhotoFile(...args),
}));

const TOKEN = "tok_0123456789abcdef";

beforeEach(() => {
  mockPrepared.current = null;
  mockSaveImageFromSignedUrl.mockReset();
  mockSharePhotoFile.mockReset();
});

it("사진과 「사진 저장」만 있다 — 사진은 이 사이트의 그림 주소로 연다", () => {
  render(<SharedPhotoView token={TOKEN} title="우리 넷" extension="jpg" />);

  expect(screen.getByRole("img", { name: "우리 넷" })).toHaveAttribute("src", `/s/${TOKEN}/image`);
  expect(screen.getByRole("button", { name: "사진 저장" })).toBeInTheDocument();
  expect(screen.getAllByRole("button")).toHaveLength(1);
});

it("받아 둔 사진이 있으면 공유 창으로 저장한다 — iPhone 은 거기서 「이미지 저장」을 고른다", async () => {
  mockPrepared.current = new File([new Uint8Array([0xff, 0xd8])], "우리 넷.jpg", { type: "image/jpeg" });
  mockSharePhotoFile.mockResolvedValue("shared");
  render(<SharedPhotoView token={TOKEN} title="우리 넷" extension="jpg" />);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "사진 저장" }));
  });
  expect(mockSharePhotoFile).toHaveBeenCalledWith(mockPrepared.current);
  expect(mockSaveImageFromSignedUrl).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("사진첩이나 「파일」 앱");
});

it("받아 둔 사진이 없으면 내려받는다 — 앱이 받을 수도 있어 절대 주소로", async () => {
  mockSaveImageFromSignedUrl.mockResolvedValue("downloaded");
  render(<SharedPhotoView token={TOKEN} title="우리 넷" extension="png" />);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "사진 저장" }));
  });
  expect(mockSaveImageFromSignedUrl).toHaveBeenCalledWith(`http://localhost/s/${TOKEN}/download`, "우리 넷.png");
  expect(screen.getByRole("status")).toHaveTextContent("내려받기를 시작했어요.");
});

it("닫힌 링크는 이유를 가르지 않고 열 수 없다고 말한다", () => {
  render(<SharedPhotoUnavailable closed />);
  expect(screen.getByRole("heading", { name: "열 수 없는 링크예요" })).toBeInTheDocument();
  expect(screen.getByText("사진이 지워졌거나 보관 기간이 지났어요.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
});

it("서버에 못 닿았으면 닫혔다고 말하지 않고 다시 시도를 둔다", () => {
  render(<SharedPhotoUnavailable closed={false} />);
  expect(screen.getByRole("heading", { name: "사진을 불러오지 못했어요" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
});
