import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
