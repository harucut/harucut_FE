import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StudioPageTheme } from "@/components/studio/StudioPageTheme";
import type { PageTheme } from "@/lib/event/pageTheme";

const mockUpload = jest.fn();
const mockGetAsset = jest.fn();

jest.mock("@/lib/assetUploadApi", () => ({
  uploadAsset: (...a: unknown[]) => mockUpload(...a),
  getAsset: (...a: unknown[]) => mockGetAsset(...a),
}));

let latest: PageTheme | null = null;

function Harness({ initial = { schemaVersion: 1 } as PageTheme }) {
  const [theme, setTheme] = useState<PageTheme>(initial);
  return (
    <StudioPageTheme
      workspaceId="Ws1"
      value={theme}
      onChange={(next) => {
        latest = next;
        setTheme(next);
      }}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  latest = null;
});

it("색을 바꾸면 미리보기에 바로 얹고, 대비가 모자라면 알린다", () => {
  render(<Harness />);
  expect(screen.queryByText("글자가 잘 안 읽힐 수 있어요.")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("버튼 색 값"), { target: { value: "#FFE066" } });
  expect(latest?.colors?.accent).toBe("#FFE066");
  expect(screen.getByLabelText("행사 화면 미리보기")).toHaveStyle({ "--ev-accent": "#FFE066" });
  expect(screen.getByText(/버튼 글자 \/ 버튼 대비/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "기본 색으로" }));
  expect(latest?.colors).toEqual({});
  expect(screen.queryByText("글자가 잘 안 읽힐 수 있어요.")).not.toBeInTheDocument();
});

// 로고·배경은 공간 자산(PAGE_THEME_ASSET)이다 — 이 행사가 속한 공간으로 올린다.
it("로고를 이 공간의 테마 자산으로 올리고 그 id 를 테마에 둔다", async () => {
  mockUpload.mockResolvedValue({ assetId: "AsLogo", key: "k", url: "https://s3/logo.png" });
  render(<Harness />);
  const file = new File(["x"], "logo.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("로고 올리기"), { target: { files: [file] } });

  await waitFor(() => expect(latest?.logoAssetId).toBe("AsLogo"));
  expect(mockUpload).toHaveBeenCalledWith({ file, purpose: "PAGE_THEME_ASSET", workspaceId: "Ws1" });
  expect(screen.getByAltText("고른 로고")).toHaveAttribute("src", "https://s3/logo.png");

  fireEvent.click(screen.getByRole("button", { name: "빼기" }));
  expect(latest?.logoAssetId).toBeUndefined();
});

it("이미 고른 배경은 짧은 조회 주소로 미리 보여 준다", async () => {
  mockGetAsset.mockResolvedValue({ assetId: "AsBg", status: "VERIFIED", url: "https://s3/bg.png" });
  render(<Harness initial={{ schemaVersion: 1, backgroundAssetId: "AsBg" }} />);
  expect(await screen.findByAltText("고른 배경 이미지")).toHaveAttribute("src", "https://s3/bg.png");
  expect(mockGetAsset).toHaveBeenCalledWith("AsBg");
});

it("올리기에 실패하면 서버 문구로 알리고 테마는 그대로 둔다", async () => {
  mockUpload.mockRejectedValue(new Error("boom"));
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("배경 이미지 올리기"), {
    target: { files: [new File(["x"], "bg.jpg", { type: "image/jpeg" })] },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("이미지를 올리지 못했어요.");
  expect(latest?.backgroundAssetId).toBeUndefined();
});
