import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  await waitFor(() => expect(mockInvite).toHaveBeenCalledWith("Ev1", ["VIEW_PHOTOS", "DOWNLOAD_PHOTOS"], "신랑 측", false));
  expect(screen.getByText(`${window.location.origin}/invite#tok_customer_abcdefghijklmn`)).toBeInTheDocument();
});

// 사람을 더한다고 과거 사진 열람 범위가 저절로 넓어지면 안 된다. 기본은 받은 뒤 사진만이고, 고른 때만 넓힌다.
it("이미 찍은 사진은 체크해야 보여 주고, 링크를 만들면 체크를 되돌린다", async () => {
  mockList.mockResolvedValue([]);
  mockInvite.mockResolvedValue({ invitationId: "Iv1", inviteToken: "tok_customer_abcdefghijklmn", expiresAt: "x" });
  render(<StudioEventCustomers eventId="Ev1" />);
  const past = (await screen.findByRole("checkbox", { name: /이미 찍은 사진도 보여 주기/ })) as HTMLInputElement;
  expect(past.checked).toBe(false);

  fireEvent.click(past);
  fireEvent.click(screen.getByRole("button", { name: "고객 초대 링크 만들기" }));

  await waitFor(() => expect(mockInvite).toHaveBeenCalledWith("Ev1", ["VIEW_PHOTOS", "DOWNLOAD_PHOTOS"], undefined, true));
  await waitFor(() => expect(past.checked).toBe(false));
});

it("사진 범위가 제한된 행에 시각을 보여 주고, 확인을 거쳐서만 넓힌다", async () => {
  const limited = { ...GRANT, photosFrom: "2026-11-02T10:00:00+09:00" };
  mockList.mockResolvedValue([limited]);
  mockUpdate.mockResolvedValue({ ...GRANT, photosFrom: null });
  render(<StudioEventCustomers eventId="Ev1" />);

  expect(await screen.findByText(/뒤에 찍은 사진만 봐요/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이전 사진도 보이게" }));
  expect(mockUpdate).not.toHaveBeenCalled();

  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "이전 사진도 보이게" }));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("Ev1", 3, GRANT.permissions, true));
  await waitFor(() => expect(screen.queryByText(/뒤에 찍은 사진만 봐요/)).not.toBeInTheDocument());
});

it("권한을 바꿔도 사진 범위는 넓히지 않는다", async () => {
  mockList.mockResolvedValue([{ ...GRANT, photosFrom: "2026-11-02T10:00:00+09:00" }]);
  mockUpdate.mockResolvedValue({ ...GRANT, photosFrom: "2026-11-02T10:00:00+09:00" });
  render(<StudioEventCustomers eventId="Ev1" />);
  const fieldset = await screen.findByRole("group", { name: "신부 권한" });
  await act(async () => {
    fireEvent.click(fieldset.querySelectorAll("input")[2]);
  });
  expect(mockUpdate).toHaveBeenCalledWith("Ev1", 3, ["VIEW_PHOTOS", "DOWNLOAD_PHOTOS", "BULK_DOWNLOAD"]);
});
