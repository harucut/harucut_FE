import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiRequestError } from "@/lib/clientApi";
import { InviteAccept } from "@/components/invite/InviteAccept";

const mockReplace = jest.fn();
const mockMembership = jest.fn();
const mockPreview = jest.fn();
const mockAccept = jest.fn();

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock("@/lib/authSession", () => ({ resolveMembership: () => mockMembership() }));
jest.mock("@/lib/studio/accessApi", () => ({
  ...jest.requireActual("@/lib/studio/accessApi"),
  previewInvitation: (...args: unknown[]) => mockPreview(...args),
  acceptInvitation: (...args: unknown[]) => mockAccept(...args),
}));

const TOKEN = "Ab3_dEf4-gHi5jKl6mNo7pQr8sTu9vWx0yZa1bCd2eF";
const KEY = "harucut:pending-invite";

const WORKSPACE_PREVIEW = {
  kind: "WORKSPACE",
  workspaceName: "하루컷 웨딩팀",
  role: "DESIGNER",
  invitedByName: "민지",
  expiresAt: "2026-11-02T10:00:00+09:00",
};

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/invite");
  mockMembership.mockResolvedValue("member");
  mockPreview.mockResolvedValue(WORKSPACE_PREVIEW);
});

it("fragment 의 토큰을 탭 저장소로 옮기고 주소창에서 지운 뒤 무엇에 들어가는지 보여 준다", async () => {
  window.history.replaceState(null, "", `/invite#${TOKEN}`);
  render(<InviteAccept />);

  expect(await screen.findByText(/하루컷 웨딩팀/)).toBeInTheDocument();
  expect(screen.getByText("디자이너")).toBeInTheDocument();
  expect(window.location.hash).toBe("");
  expect(window.sessionStorage.getItem(KEY)).toBe(TOKEN);
  expect(mockPreview).toHaveBeenCalledWith(TOKEN);
});

it("로그인하지 않았으면 로그인하고 돌아오게 한다", async () => {
  mockMembership.mockResolvedValue("guest");
  window.history.replaceState(null, "", `/invite#${TOKEN}`);
  render(<InviteAccept />);

  const link = await screen.findByRole("link", { name: "로그인하고 초대 받기" });
  expect(link).toHaveAttribute("href", "/login?redirectTo=%2Finvite");
  expect(mockPreview).not.toHaveBeenCalled();
  // 로그인하러 다녀오면 fragment 는 돌아오지 않는다 — 탭 저장소로 잇는다.
  expect(window.sessionStorage.getItem(KEY)).toBe(TOKEN);
});

it("로그인하고 돌아오면 탭 저장소의 토큰으로 이어 간다", async () => {
  window.sessionStorage.setItem(KEY, TOKEN);
  render(<InviteAccept />);
  expect(await screen.findByText(/하루컷 웨딩팀/)).toBeInTheDocument();
});

it("받으면 토큰을 지우고 그 공간으로 간다", async () => {
  window.sessionStorage.setItem(KEY, TOKEN);
  mockAccept.mockResolvedValue({ kind: "WORKSPACE", workspaceId: "WsOrg", role: "DESIGNER" });
  render(<InviteAccept />);

  fireEvent.click(await screen.findByRole("button", { name: "초대 받기" }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/studio?workspace=WsOrg"));
  expect(window.sessionStorage.getItem(KEY)).toBeNull();
});

// 행사 고객에게 운영 화면은 할 일이 없다. 받자마자 사진함으로 간다.
it("행사 초대를 받으면 그 행사 사진함으로 바로 간다", async () => {
  window.sessionStorage.setItem(KEY, TOKEN);
  mockAccept.mockResolvedValue({ kind: "EVENT", eventId: "Ev9", permissions: ["VIEW_PHOTOS"] });
  render(<InviteAccept />);

  fireEvent.click(await screen.findByRole("button", { name: "초대 받기" }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/studio/events/Ev9/photos"));
});

it("기한이 지난 초대(MEMBER-001)는 안내하고 토큰을 지운다", async () => {
  window.sessionStorage.setItem(KEY, TOKEN);
  mockPreview.mockRejectedValue(new ApiRequestError({ status: 410, code: "MEMBER-001", apiMessage: "x" }));
  render(<InviteAccept />);

  expect(await screen.findByRole("alert")).toHaveTextContent("초대 기한이 지났어요");
  expect(screen.queryByRole("button", { name: "다시 확인" })).not.toBeInTheDocument();
  expect(window.sessionStorage.getItem(KEY)).toBeNull();
});

it("이미 참여 중이면(MEMBER-003) 행사 운영으로 가는 길을 둔다", async () => {
  window.sessionStorage.setItem(KEY, TOKEN);
  mockAccept.mockRejectedValue(new ApiRequestError({ status: 409, code: "MEMBER-003", apiMessage: "x" }));
  render(<InviteAccept />);

  const button = await screen.findByRole("button", { name: "초대 받기" });
  await act(async () => {
    fireEvent.click(button);
  });
  expect(screen.getByRole("alert")).toHaveTextContent("이미 참여하고 있어요.");
  expect(screen.getByRole("link", { name: "행사 운영으로 가기" })).toHaveAttribute("href", "/studio");
});

it("받지 않기를 누르면 토큰을 지운다", async () => {
  window.sessionStorage.setItem(KEY, TOKEN);
  render(<InviteAccept />);
  fireEvent.click(await screen.findByRole("button", { name: "받지 않기" }));
  expect(window.sessionStorage.getItem(KEY)).toBeNull();
  expect(mockReplace).toHaveBeenCalledWith("/home");
});

// 세션이 끝나도(다른 탭 로그아웃 등) 초대는 살아 있다 — 토큰을 남기고 로그인으로 잇는다.
it("확인 중 인증이 끝나면(401) 토큰을 남기고 로그인 안내로 간다", async () => {
  window.sessionStorage.setItem(KEY, TOKEN);
  mockPreview.mockRejectedValue(new ApiRequestError({ status: 401, code: "AUTH-001", apiMessage: "x" }));
  render(<InviteAccept />);
  expect(await screen.findByRole("link", { name: "로그인하고 초대 받기" })).toBeInTheDocument();
  expect(window.sessionStorage.getItem(KEY)).toBe(TOKEN);
});

it("수락 중 인증이 끝나도(401) 로그인 안내로 간다", async () => {
  window.sessionStorage.setItem(KEY, TOKEN);
  mockAccept.mockRejectedValue(new ApiRequestError({ status: 401, code: "AUTH-001", apiMessage: "x" }));
  render(<InviteAccept />);
  fireEvent.click(await screen.findByRole("button", { name: "초대 받기" }));
  expect(await screen.findByRole("link", { name: "로그인하고 초대 받기" })).toBeInTheDocument();
  expect(window.sessionStorage.getItem(KEY)).toBe(TOKEN);
});

// 재대조 항목: 갓 가입한 초대 고객은 필수 약관 동의 전이라 서버가 TERMS-004 로 막는다. 막다른 길이면 안 된다.
it("필수 약관에 막혀 실패하면 다시 확인할 수 있고, 동의 뒤에는 이어 간다", async () => {
  window.history.replaceState(null, "", `/invite#${TOKEN}`);
  mockPreview.mockRejectedValueOnce(new ApiRequestError({ status: 403, code: "TERMS-004", apiMessage: "x" }));
  render(<InviteAccept />);

  fireEvent.click(await screen.findByRole("button", { name: "다시 확인" }));
  expect(await screen.findByRole("button", { name: "초대 받기" })).toBeInTheDocument();
});

// Codex 리뷰 #606 — 같은 탭에 다른 초대 링크를 붙여 넣으면 fragment 만 바뀌어, 이전 초대를 보여 주고 이전 초대를 받았다.
it("같은 탭에서 다른 초대 링크로 바뀌면 그 초대를 다시 읽고 그것을 받는다", async () => {
  const OTHER = "Zz9_yYx8-wWv7uUt6sSr5qQp4oOn3mMl2kKj1iIh0gG";
  window.history.replaceState(null, "", `/invite#${TOKEN}`);
  render(<InviteAccept />);
  await screen.findByText("하루컷 웨딩팀");

  mockPreview.mockResolvedValue({ ...WORKSPACE_PREVIEW, workspaceName: "두 번째 팀" });
  await act(async () => {
    window.history.replaceState(null, "", `/invite#${OTHER}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await screen.findByText("두 번째 팀");
  expect(mockPreview).toHaveBeenLastCalledWith(OTHER);

  mockAccept.mockResolvedValue({ kind: "WORKSPACE", workspaceId: "WsB" });
  fireEvent.click(screen.getByRole("button", { name: "초대 받기" }));
  await waitFor(() => expect(mockAccept).toHaveBeenCalledWith(OTHER));
});

// Codex 리뷰 #609 — 받는 중에 다른 초대 링크로 바뀌면, 이전 수락의 답이 새 초대의 토큰을 지우고 이전 공간으로 데려갔다.
it("받는 중에 다른 초대 링크로 바뀌면 이전 수락의 답으로 새 초대를 건드리지 않는다", async () => {
  const OTHER = "Zz9_yYx8-wWv7uUt6sSr5qQp4oOn3mMl2kKj1iIh0gG";
  window.history.replaceState(null, "", `/invite#${TOKEN}`);
  let finishAccept: (v: unknown) => void = () => {};
  mockAccept.mockImplementation(() => new Promise((resolve) => (finishAccept = resolve)));
  render(<InviteAccept />);
  fireEvent.click(await screen.findByRole("button", { name: "초대 받기" }));

  mockPreview.mockResolvedValue({ ...WORKSPACE_PREVIEW, workspaceName: "두 번째 팀" });
  await act(async () => {
    window.history.replaceState(null, "", `/invite#${OTHER}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await screen.findByText("두 번째 팀");

  await act(async () => {
    finishAccept({ kind: "WORKSPACE", workspaceId: "WsOrg" });
  });
  expect(mockReplace).not.toHaveBeenCalled();
  expect(window.sessionStorage.getItem(KEY)).toBe(OTHER);
  expect(screen.getByText("두 번째 팀")).toBeInTheDocument();
});
