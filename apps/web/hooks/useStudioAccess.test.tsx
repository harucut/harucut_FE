import { act, render, screen, waitFor } from "@testing-library/react";
import { forgetStudioAccess, rememberStudioAccess, useStudioAccess } from "@/hooks/useStudioAccess";

const mockWorkspaces = jest.fn();
const mockEvents = jest.fn();
jest.mock("@/lib/studio/studioApi", () => ({ listWorkspaces: () => mockWorkspaces() }));
jest.mock("@/lib/studio/accessApi", () => ({ listMyEvents: () => mockEvents() }));

function Probe() {
  return <p>{useStudioAccess() ? "있음" : "없음"}</p>;
}

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
  mockWorkspaces.mockResolvedValue([]);
  mockEvents.mockResolvedValue([]);
});

it("운영 공간이 있으면 입구를 연다. 개인 공간만으로는 열지 않는다", async () => {
  mockWorkspaces.mockResolvedValue([{ type: "PERSONAL" }, { type: "ORGANIZATION" }]);
  render(<Probe />);
  expect(await screen.findByText("있음")).toBeInTheDocument();
});

it("초대받은 행사만 있어도 입구를 연다", async () => {
  mockWorkspaces.mockResolvedValue([{ type: "PERSONAL" }]);
  mockEvents.mockResolvedValue([{ eventId: "Ev1" }]);
  render(<Probe />);
  expect(await screen.findByText("있음")).toBeInTheDocument();
});

it("개인 사용자에게는 열지 않고, 답을 탭에 저장해 다시 묻지 않는다", async () => {
  mockWorkspaces.mockResolvedValue([{ type: "PERSONAL" }]);
  const { unmount } = render(<Probe />);
  await waitFor(() => expect(window.sessionStorage.getItem("harucut:studio-access")).toBe("no"));
  expect(screen.getByText("없음")).toBeInTheDocument();
  unmount();
  render(<Probe />);
  expect(mockWorkspaces).toHaveBeenCalledTimes(1);
});

it("둘 다 실패하면 저장하지 않는다 — 다음 화면에서 다시 묻는다", async () => {
  mockWorkspaces.mockRejectedValue(new Error("x"));
  mockEvents.mockRejectedValue(new Error("x"));
  render(<Probe />);
  await waitFor(() => expect(mockEvents).toHaveBeenCalled());
  await act(async () => {
    await Promise.resolve();
  });
  expect(window.sessionStorage.getItem("harucut:studio-access")).toBeNull();
  expect(screen.getByText("없음")).toBeInTheDocument();
});

it("한쪽 조회만 실패하면 없다고 기억하지 않는다 — 복구되면 다음 화면에서 입구가 나타난다", async () => {
  mockWorkspaces.mockRejectedValue(new Error("일시 실패"));
  render(<Probe />);
  await waitFor(() => expect(mockEvents).toHaveBeenCalled());
  await act(async () => {
    await Promise.resolve();
  });
  expect(window.sessionStorage.length).toBe(0);
});

it("한쪽 조회만 실패해도 다른 쪽에서 확인되면 입구를 연다", async () => {
  mockWorkspaces.mockRejectedValue(new Error("일시 실패"));
  mockEvents.mockResolvedValue([{ eventId: "E1" }]);
  render(<Probe />);
  expect(await screen.findByText("있음")).toBeInTheDocument();
});

it("공간을 만들거나 초대를 받으면 바로 열고, 로그아웃하면 지운다", async () => {
  mockWorkspaces.mockResolvedValue([{ type: "PERSONAL" }]);
  render(<Probe />);
  await waitFor(() => expect(window.sessionStorage.getItem("harucut:studio-access")).toBe("no"));
  act(() => rememberStudioAccess());
  expect(screen.getByText("있음")).toBeInTheDocument();
  act(() => forgetStudioAccess());
  expect(screen.getByText("없음")).toBeInTheDocument();
  expect(window.sessionStorage.getItem("harucut:studio-access")).toBeNull();
});
