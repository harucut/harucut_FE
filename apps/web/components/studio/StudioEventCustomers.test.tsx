import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StudioEventCustomers } from "@/components/studio/StudioEventCustomers";

const mockList = jest.fn();
const mockUpdate = jest.fn();
const mockInvite = jest.fn();

jest.mock("@/lib/studio/accessApi", () => ({
  ...jest.requireActual("@/lib/studio/accessApi"),
  listEventGrants: (...a: unknown[]) => mockList(...a),
  updateEventGrant: (...a: unknown[]) => mockUpdate(...a),
  inviteEventCustomer: (...a: unknown[]) => mockInvite(...a),
  removeEventGrant: jest.fn(),
}));

const GRANT = { grantId: 3, userId: "u-bride", name: "신부", permissions: ["VIEW_PHOTOS", "DOWNLOAD_PHOTOS"], createdAt: "x" };

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([GRANT]);
});

it("권한을 켜면 집합을 통째로 바꿔 보낸다", async () => {
  mockUpdate.mockResolvedValue({ ...GRANT, permissions: ["VIEW_PHOTOS", "DOWNLOAD_PHOTOS", "BULK_DOWNLOAD"] });
  render(<StudioEventCustomers eventId="Ev1" />);
  const fieldset = await screen.findByRole("group", { name: "신부 권한" });
  await act(async () => {
    fireEvent.click(fieldset.querySelectorAll("input")[2]);
  });
  expect(mockUpdate).toHaveBeenCalledWith("Ev1", 3, ["VIEW_PHOTOS", "DOWNLOAD_PHOTOS", "BULK_DOWNLOAD"]);
});

// 하나도 없으면 회수와 같다 — 그 길은 「권한 회수」로만 둔다.
it("마지막 권한은 끌 수 없다", async () => {
  mockList.mockResolvedValue([{ ...GRANT, permissions: ["VIEW_PHOTOS"] }]);
  render(<StudioEventCustomers eventId="Ev1" />);
  const fieldset = await screen.findByRole("group", { name: "신부 권한" });
  fireEvent.click(fieldset.querySelectorAll("input")[0]);
  expect(mockUpdate).not.toHaveBeenCalled();
});

it("고객 초대는 고른 권한과 메모로 링크를 만들어 한 번 보여 준다", async () => {
  mockList.mockResolvedValue([]);
  mockInvite.mockResolvedValue({ invitationId: "Iv1", inviteToken: "tok_customer_abcdefghijklmn", expiresAt: "x" });
  render(<StudioEventCustomers eventId="Ev1" />);
  fireEvent.change(await screen.findByLabelText("메모 (선택)"), { target: { value: "신랑 측" } });
  fireEvent.click(screen.getByRole("button", { name: "고객 초대 링크 만들기" }));
  await waitFor(() => expect(mockInvite).toHaveBeenCalledWith("Ev1", ["VIEW_PHOTOS", "DOWNLOAD_PHOTOS"], "신랑 측"));
  expect(screen.getByText(`${window.location.origin}/invite#tok_customer_abcdefghijklmn`)).toBeInTheDocument();
});
