import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StudioHome } from "@/components/studio/StudioHome";

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockQuery = "";
const mockListWorkspaces = jest.fn();
const mockCreateWorkspace = jest.fn();
const mockListEvents = jest.fn();
const mockCreateEvent = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => new URLSearchParams(mockQuery),
}));
jest.mock("@/components/layout/AppNav", () => ({ AppNav: () => null }));
const mockListMyEvents = jest.fn();
jest.mock("@/lib/studio/accessApi", () => ({
  ...jest.requireActual("@/lib/studio/accessApi"),
  listMyEvents: () => mockListMyEvents(),
  listMembers: () => mockListMembers(),
  listInvitations: async () => [],
  inviteMember: (...a: unknown[]) => mockInvite(...a),
  removeMember: (...a: unknown[]) => mockRemoveMember(...a),
}));
const mockListMembers = jest.fn();
const mockInvite = jest.fn();
const mockRemoveMember = jest.fn();
jest.mock("@/lib/userApi", () => ({ getMyUserInfo: async () => ({ id: "u-me" }) }));
jest.mock("@/lib/studio/projectsApi", () => ({
  ...jest.requireActual("@/lib/studio/projectsApi"),
  listProjects: async () => [],
  getWorkspaceBrandDefaults: async () => ({}),
}));
jest.mock("@/lib/studio/studioApi", () => ({
  listWorkspaces: () => mockListWorkspaces(),
  createWorkspace: (...args: unknown[]) => mockCreateWorkspace(...args),
  listEvents: (...args: unknown[]) => mockListEvents(...args),
  createEvent: (...args: unknown[]) => mockCreateEvent(...args),
}));

const PERSONAL = { workspaceId: "WsMe", name: "내 공간", type: "PERSONAL", role: "OWNER" };
const ORG = { workspaceId: "WsOrg", name: "하루컷 웨딩팀", type: "ORGANIZATION", role: "OWNER" };

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = "";
  mockListEvents.mockResolvedValue([]);
  mockListMyEvents.mockResolvedValue([]);
  mockListMembers.mockResolvedValue([]);
});

// 행사는 조직 공간에만 만든다 — 개인 공간은 탈퇴 때 통째로 지워진다.
it("운영 공간이 없으면 개인 공간이 있어도 공간 만들기부터 보여 준다", async () => {
  mockListWorkspaces.mockResolvedValue([PERSONAL]);
  mockCreateWorkspace.mockResolvedValue(ORG);
  render(<StudioHome />);

  fireEvent.change(await screen.findByLabelText("공간 이름"), { target: { value: "하루컷 웨딩팀" } });
  fireEvent.click(screen.getByRole("button", { name: "공간 만들기" }));

  await waitFor(() => expect(mockCreateWorkspace).toHaveBeenCalledWith("하루컷 웨딩팀"));
  expect(mockReplace).toHaveBeenCalledWith("/studio?workspace=WsOrg");
  expect(mockListEvents).not.toHaveBeenCalledWith("WsMe");
});

it("공간의 행사를 상태와 함께 보여 준다", async () => {
  mockListWorkspaces.mockResolvedValue([PERSONAL, ORG]);
  mockListEvents.mockResolvedValue([
    {
      eventId: "Ev1",
      status: "LIVE",
      paused: true,
      captureOpen: false,
      joinUrlPath: "/e/wedding-1027",
      settings: { name: "민지 ♥ 준호 결혼식" },
    },
  ]);
  render(<StudioHome />);

  const link = await screen.findByRole("link", { name: /민지 ♥ 준호 결혼식/ });
  expect(link).toHaveAttribute("href", "/studio/events/Ev1");
  expect(screen.getByText("일시 중지")).toBeInTheDocument();
  expect(mockListEvents).toHaveBeenCalledWith("WsOrg");
});

it("참가 주소 규칙에 맞아야 행사를 만들고, 초안은 개인 휴대폰 참가로 시작한다", async () => {
  mockListWorkspaces.mockResolvedValue([ORG]);
  mockCreateEvent.mockResolvedValue({ eventId: "EvNew" });
  render(<StudioHome />);

  fireEvent.change(await screen.findByLabelText("행사 이름"), { target: { value: "졸업식" } });
  fireEvent.change(screen.getByLabelText("참가 주소"), { target: { value: "ab" } });
  expect(screen.getByRole("button", { name: "행사 만들기" })).toBeDisabled();

  fireEvent.change(screen.getByLabelText("참가 주소"), { target: { value: "Grad-2026" } });
  fireEvent.click(screen.getByRole("button", { name: "행사 만들기" }));

  await waitFor(() =>
    expect(mockCreateEvent).toHaveBeenCalledWith("WsOrg", expect.objectContaining({ name: "졸업식", slug: "grad-2026", byodEnabled: true })),
  );
  expect(mockPush).toHaveBeenCalledWith("/studio/events/EvNew");
});

// 버튼을 숨긴다고 권한이 생기지 않지만, 쓸 수 없는 버튼을 보여 주지도 않는다.
it("관리자가 아니면 행사 만들기를 보여 주지 않는다", async () => {
  mockListWorkspaces.mockResolvedValue([{ ...ORG, role: "DESIGNER" }]);
  render(<StudioHome />);
  expect(await screen.findByText(/관리자 권한이 필요해요/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "행사 만들기" })).not.toBeInTheDocument();
});

// 행사 고객은 공간 멤버가 아니다 — 받은 행사만 보이고, 운영 공간이 없어도 목록은 보인다.
it("고객으로 받은 행사를 권한과 함께 보여 준다", async () => {
  mockListWorkspaces.mockResolvedValue([PERSONAL]);
  mockListMyEvents.mockResolvedValue([
    { eventId: "Ev9", name: "민지 ♥ 준호", status: "LIVE", access: { permissions: ["VIEW_PHOTOS", "DOWNLOAD_PHOTOS"] } },
    { eventId: "Ev1", name: "운영하는 행사", status: "LIVE", access: { role: "OWNER", permissions: [] } },
  ]);
  render(<StudioHome />);
  expect(await screen.findByText("민지 ♥ 준호")).toBeInTheDocument();
  expect(screen.getByText("사진 보기 · 사진 내려받기")).toBeInTheDocument();
  // 멤버로 운영하는 행사는 공간의 행사 목록에 나온다.
  expect(screen.queryByText("운영하는 행사")).not.toBeInTheDocument();
});

const ORG_B = { workspaceId: "WsB", name: "두 번째 팀", type: "ORGANIZATION", role: "OWNER" };

// 앞 공간에서 만든 초대 링크가 다음 공간의 것처럼 보이면 엉뚱한 공간 권한을 건네게 된다.
it("공간을 바꾸면 앞 공간에서 만든 초대 링크를 지운다", async () => {
  mockListWorkspaces.mockResolvedValue([ORG, ORG_B]);
  mockInvite.mockResolvedValue({ invitationId: "Iv1", inviteToken: "T".repeat(43), expiresAt: "2026-11-02T00:00:00Z" });
  const { rerender } = render(<StudioHome />);
  fireEvent.click(await screen.findByRole("button", { name: "초대 링크 만들기" }));
  expect(await screen.findByText(/T{43}/)).toBeInTheDocument();

  mockQuery = "workspace=WsB";
  rerender(<StudioHome />);
  await waitFor(() => expect(screen.queryByText(/T{43}/)).not.toBeInTheDocument());
});

it("공간에서 나가면 공간 목록을 다시 받아 그 공간을 지운다", async () => {
  mockListWorkspaces.mockResolvedValueOnce([ORG, ORG_B]).mockResolvedValueOnce([ORG_B]);
  mockListMembers.mockResolvedValue([{ userId: "u-me", name: "나", role: "ADMIN", joinedAt: "2026-10-01T00:00:00Z" }]);
  mockRemoveMember.mockResolvedValue(undefined);
  render(<StudioHome />);
  fireEvent.click(await screen.findByRole("button", { name: "나가기" }));
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "나가기" }));
  await waitFor(() => expect(mockListWorkspaces).toHaveBeenCalledTimes(2));
  expect(mockReplace).toHaveBeenCalledWith("/studio");
  expect(await screen.findByText("두 번째 팀")).toBeInTheDocument();
});

// 운영 담당은 멤버 목록을 보지 못한다(서버 403) — 맡은 행사만 보이고 행사도 만들지 않는다.
it("운영 담당에게는 멤버·프로젝트·행사 만들기를 보이지 않는다", async () => {
  mockListWorkspaces.mockResolvedValue([{ ...ORG, role: "OPERATOR" }]);
  render(<StudioHome />);

  expect(await screen.findByText("운영 담당은 맡은 행사만 보여요.", { exact: false })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "멤버" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "프로젝트와 기본값" })).not.toBeInTheDocument();
  expect(mockListMembers).not.toHaveBeenCalled();
});

// 멤버 목록이 없어도 운영 담당은 스스로 나갈 수 있어야 한다(Codex #554) — 본인 탈퇴는 어느 역할이든 된다.
it("운영 담당은 멤버 목록 없이도 이 공간에서 나갈 수 있다", async () => {
  mockListWorkspaces.mockResolvedValueOnce([{ ...ORG, role: "OPERATOR" }]).mockResolvedValue([]);
  mockRemoveMember.mockResolvedValue(undefined);
  render(<StudioHome />);

  fireEvent.click(await screen.findByRole("button", { name: "이 공간에서 나가기" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "나가기" }));

  await waitFor(() => expect(mockRemoveMember).toHaveBeenCalledWith("WsOrg", "me"));
  expect(mockReplace).toHaveBeenCalledWith("/studio");
  await waitFor(() => expect(mockListWorkspaces).toHaveBeenCalledTimes(2));
});
