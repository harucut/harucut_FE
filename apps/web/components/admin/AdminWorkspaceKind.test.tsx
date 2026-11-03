import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AdminWorkspaceKind } from "@/components/admin/AdminWorkspaceKind";
import { setWorkspaceKind } from "@/lib/admin/cmsApi";

jest.mock("@/lib/admin/cmsApi", () => ({
  setWorkspaceKind: jest.fn(),
}));

// AdminSearchField 는 자체 검색·디바운스를 돈다. 이 화면이 보는 것은 고른 공간뿐이라, 고르기만 흉내 낸다.
let pickKind: "HOST" | "ENTERPRISE" = "HOST";
let pickType: "PERSONAL" | "ORGANIZATION" = "ORGANIZATION";
jest.mock("@/components/admin/AdminSearchField", () => ({
  AdminSearchField: ({ onPick }: { onPick: (w: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onPick({ workspaceId: "Ws1", name: "라온 웨딩홀", type: pickType, kind: pickKind, ownerEmails: [], createdAt: "" })
      }
    >
      공간 고르기
    </button>
  ),
}));

const mockSet = setWorkspaceKind as jest.Mock;

afterEach(() => {
  mockSet.mockReset();
  pickKind = "HOST";
  pickType = "ORGANIZATION";
});

it("조직 공간을 업체로 바꾸면 사유와 함께 저장하고 안내한다", async () => {
  mockSet.mockResolvedValue({ workspaceId: "Ws1", kind: "ENTERPRISE" });
  render(<AdminWorkspaceKind />);

  fireEvent.click(screen.getByRole("button", { name: "공간 고르기" }));
  expect(screen.getByText(/지금 주최자 공간/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "업체로 바꾸기" }));
  const dialog = screen.getByRole("dialog", { name: "업체 공간으로 바꿀까요?" });
  fireEvent.change(within(dialog).getByLabelText("바꾸는 이유"), { target: { value: "라온 웨딩홀 계약" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "업체로 바꾸기" }));

  await waitFor(() => expect(mockSet).toHaveBeenCalledWith("Ws1", "ENTERPRISE", "라온 웨딩홀 계약"));
  expect(await screen.findByText(/업체 공간으로 바꿨어요/)).toBeInTheDocument();
});

it("개인 공간은 바꿀 수 없다고 말한다", () => {
  pickType = "PERSONAL";
  render(<AdminWorkspaceKind />);

  fireEvent.click(screen.getByRole("button", { name: "공간 고르기" }));
  expect(screen.getByText("개인 공간은 늘 주최자예요.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /바꾸기/ })).not.toBeInTheDocument();
});
