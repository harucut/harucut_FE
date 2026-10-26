import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StudioMembers } from "@/components/studio/StudioMembers";

const mockLeft = jest.fn();
const mockListMembers = jest.fn();
const mockListInvitations = jest.fn();
const mockInvite = jest.fn();
const mockChangeRole = jest.fn();
const mockRemove = jest.fn();

jest.mock("@/lib/studio/accessApi", () => ({
  ...jest.requireActual("@/lib/studio/accessApi"),
  listMembers: (...a: unknown[]) => mockListMembers(...a),
  listInvitations: (...a: unknown[]) => mockListInvitations(...a),
  inviteMember: (...a: unknown[]) => mockInvite(...a),
  changeMemberRole: (...a: unknown[]) => mockChangeRole(...a),
  removeMember: (...a: unknown[]) => mockRemove(...a),
  revokeInvitation: jest.fn(),
}));

const OWNER = { userId: "u-owner", name: "민지", role: "OWNER", joinedAt: "2026-10-01T00:00:00Z" };
const ADMIN = { userId: "u-admin", name: "준호", role: "ADMIN", joinedAt: "2026-10-02T00:00:00Z" };
const DESIGNER = { userId: "u-designer", name: "서연", role: "DESIGNER", joinedAt: "2026-10-03T00:00:00Z" };

beforeEach(() => {
  jest.clearAllMocks();
  mockListMembers.mockResolvedValue([OWNER, ADMIN, DESIGNER]);
  mockListInvitations.mockResolvedValue([]);
});

// OWNER 를 건드리는 일은 OWNER 만 한다(백엔드 GEN-021). 쓸 수 없는 조작은 보여 주지 않는다.
it("관리자는 소유자를 고치지 못하고 소유자 역할을 줄 수도 없다", async () => {
  render(<StudioMembers workspaceId="Ws1" myRole="ADMIN" myUserId="u-admin" onLeft={mockLeft} />);
  await screen.findByText("민지");
  expect(screen.queryByLabelText("민지 역할")).not.toBeInTheDocument();
  const designerRole = screen.getByLabelText("서연 역할");
  expect(within(designerRole).queryByRole("option", { name: "소유자" })).not.toBeInTheDocument();
  expect(within(screen.getByLabelText("초대할 역할")).queryByRole("option", { name: "소유자" })).not.toBeInTheDocument();
});

it("초대 링크는 만든 자리에서 한 번만 보여 준다", async () => {
  mockInvite.mockResolvedValue({ invitationId: "Iv1", inviteToken: "tok_abcdefghijklmnopqrstuvwxyz", expiresAt: "x" });
  render(<StudioMembers workspaceId="Ws1" myRole="OWNER" myUserId="u-owner" onLeft={mockLeft} />);
  fireEvent.click(await screen.findByRole("button", { name: "초대 링크 만들기" }));
  await waitFor(() => expect(mockInvite).toHaveBeenCalledWith("Ws1", "DESIGNER"));
  expect(screen.getByText(`${window.location.origin}/invite#tok_abcdefghijklmnopqrstuvwxyz`)).toBeInTheDocument();
});

it("역할을 바꾸면 바로 보낸다", async () => {
  mockChangeRole.mockResolvedValue({ ...DESIGNER, role: "VIEWER" });
  render(<StudioMembers workspaceId="Ws1" myRole="OWNER" myUserId="u-owner" onLeft={mockLeft} />);
  const select = await screen.findByLabelText("서연 역할");
  await act(async () => {
    fireEvent.change(select, { target: { value: "VIEWER" } });
  });
  expect(mockChangeRole).toHaveBeenCalledWith("Ws1", "u-designer", "VIEWER");
});

it("나가기는 확인 뒤 본인을 빼고 부모에 알린다", async () => {
  mockRemove.mockResolvedValue(undefined);
  render(<StudioMembers workspaceId="Ws1" myRole="ADMIN" myUserId="u-admin" onLeft={mockLeft} />);
  fireEvent.click(await screen.findByRole("button", { name: "나가기" }));
  await act(async () => {
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "나가기" }));
  });
  expect(mockRemove).toHaveBeenCalledWith("Ws1", "me");
  expect(mockLeft).toHaveBeenCalled();
});

it("보기 전용 멤버에게는 초대·역할 조작이 없다", async () => {
  render(<StudioMembers workspaceId="Ws1" myRole="VIEWER" myUserId="u-viewer" onLeft={mockLeft} />);
  await screen.findByText("민지");
  expect(screen.queryByRole("button", { name: "초대 링크 만들기" })).not.toBeInTheDocument();
  expect(mockListInvitations).not.toHaveBeenCalled();
});
