import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { ApiRequestError } from "@/lib/clientApi";

const mockSearch = jest.fn();
const mockBlock = jest.fn();
const mockUnblock = jest.fn();

jest.mock("@/lib/admin/cmsApi", () => ({
  ...jest.requireActual("@/lib/admin/cmsApi"),
  searchUsers: (...a: unknown[]) => mockSearch(...a),
  blockUser: (...a: unknown[]) => mockBlock(...a),
  unblockUser: (...a: unknown[]) => mockUnblock(...a),
}));

const ACTIVE = {
  userId: "UsAAAA",
  email: "minji@example.com",
  username: "민지",
  provider: "KAKAO",
  userRole: "USER",
  userStatus: "ACTIVE",
  createdAt: "2026-10-01T10:00:00",
};

async function findUsers(email = "minji@example.com") {
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: `  ${email}  ` } });
  fireEvent.click(screen.getByRole("button", { name: "찾기" }));
  await waitFor(() => expect(mockSearch).toHaveBeenCalledWith(email));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch.mockResolvedValue([ACTIVE]);
});

// 소셜 계정 때문에 같은 이메일이 여러 행일 수 있다. 어느 계정인지 가입 경로로 가린다.
it("같은 이메일의 계정을 가입 경로와 상태로 나눠 보여 준다", async () => {
  mockSearch.mockResolvedValue([ACTIVE, { ...ACTIVE, userId: "UsBBBB", provider: "GOOGLE", userStatus: "BLOCKED" }]);
  render(<AdminUsers />);
  await findUsers();
  expect(await screen.findByText(/카카오 · 사용 중/)).toBeInTheDocument();
  expect(screen.getByText(/구글 · 정지됨/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "정지" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "정지 풀기" })).toBeInTheDocument();
});

it("없는 이메일이면 없다고 말한다", async () => {
  mockSearch.mockResolvedValue([]);
  render(<AdminUsers />);
  await findUsers();
  expect(await screen.findByText("이 이메일로 가입한 계정이 없어요.")).toBeInTheDocument();
});

it("정지는 이유를 받아 보내고, 상태와 버튼을 바꾼다", async () => {
  mockBlock.mockResolvedValue({ userId: "UsAAAA", userStatus: "BLOCKED" });
  render(<AdminUsers />);
  await findUsers();
  fireEvent.click(await screen.findByRole("button", { name: "정지" }));

  const dialog = await screen.findByRole("dialog", { name: "이 계정을 정지할까요?" });
  expect(within(dialog).getByText(/모든 기기에서 로그아웃되고/)).toBeInTheDocument();
  const submit = within(dialog).getByRole("button", { name: "정지" });
  expect(submit).toBeDisabled();

  fireEvent.change(within(dialog).getByLabelText("정지 이유"), { target: { value: "약관 위반" } });
  fireEvent.click(submit);

  await waitFor(() => expect(mockBlock).toHaveBeenCalledWith("UsAAAA", "약관 위반"));
  expect(await screen.findByRole("button", { name: "정지 풀기" })).toBeInTheDocument();
  expect(screen.getByText(/정지됨/)).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("계정을 정지했어요");
});

it("정지를 풀 때도 이유를 받는다", async () => {
  mockSearch.mockResolvedValue([{ ...ACTIVE, userStatus: "BLOCKED" }]);
  mockUnblock.mockResolvedValue({ userId: "UsAAAA", userStatus: "ACTIVE" });
  render(<AdminUsers />);
  await findUsers();
  fireEvent.click(await screen.findByRole("button", { name: "정지 풀기" }));

  const dialog = await screen.findByRole("dialog", { name: "정지를 풀까요?" });
  fireEvent.change(within(dialog).getByLabelText("푸는 이유"), { target: { value: "소명 확인" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "정지 풀기" }));

  await waitFor(() => expect(mockUnblock).toHaveBeenCalledWith("UsAAAA", "소명 확인"));
  expect(await screen.findByRole("button", { name: "정지" })).toBeInTheDocument();
});

// 자기 자신과 마지막 관리자는 서버가 403 으로 막는다. 「관리자만 쓸 수 있어요」는 이 사람에게 틀린 말이다.
it("서버가 정지를 막으면 왜 그런지 대화상자 안에서 말한다", async () => {
  mockBlock.mockRejectedValue(new ApiRequestError({ status: 403, code: "GEN-021" }));
  render(<AdminUsers />);
  await findUsers();
  fireEvent.click(await screen.findByRole("button", { name: "정지" }));
  const dialog = await screen.findByRole("dialog", { name: "이 계정을 정지할까요?" });
  fireEvent.change(within(dialog).getByLabelText("정지 이유"), { target: { value: "시험" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "정지" }));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent("내 계정이거나 마지막 관리자일 수 있어요");
  expect(within(dialog).getByLabelText("정지 이유")).toHaveValue("시험");
});

it("찾기가 실패하면 알리고 앞선 결과를 남기지 않는다", async () => {
  render(<AdminUsers />);
  await findUsers();
  await screen.findByRole("button", { name: "정지" });

  mockSearch.mockRejectedValue(new ApiRequestError({ status: 403, code: "GEN-021" }));
  fireEvent.click(screen.getByRole("button", { name: "찾기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("플랫폼 관리자만 쓸 수 있어요");
  expect(screen.queryByRole("button", { name: "정지" })).not.toBeInTheDocument();
});
