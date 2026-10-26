import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StudioMultiExports } from "@/components/studio/StudioMultiExports";
import { ApiRequestError } from "@/lib/clientApi";
import type { StudioEvent } from "@/lib/studio/studioApi";

const mockCreate = jest.fn();
const mockList = jest.fn();
const mockDownload = jest.fn();
const mockProjects = jest.fn();

jest.mock("@/lib/studio/photosApi", () => ({
  ...jest.requireActual("@/lib/studio/photosApi"),
  createMultiExport: (...a: unknown[]) => mockCreate(...a),
  listMultiExports: (...a: unknown[]) => mockList(...a),
  getMultiExportDownload: (...a: unknown[]) => mockDownload(...a),
}));
jest.mock("@/lib/studio/projectsApi", () => ({
  ...jest.requireActual("@/lib/studio/projectsApi"),
  listProjects: (...a: unknown[]) => mockProjects(...a),
}));

function ev(eventId: string, name: string, projectId: string | null = null): StudioEvent {
  return {
    eventId,
    workspaceId: "Ws1",
    status: "LIVE",
    paused: false,
    captureOpen: true,
    settingsVersion: 1,
    currentExperienceVersion: 1,
    joinUrlPath: `/e/${eventId}`,
    settings: { name, projectId },
  };
}

const EVENTS = [ev("Ev1", "봄 웨딩 A", "Pj1"), ev("Ev2", "봄 웨딩 B", "Pj1"), ev("Ev3", "팝업 행사")];
const SPRING = { projectId: "Pj1", workspaceId: "Ws1", name: "봄 시즌", archived: false, createdAt: "x" };

beforeEach(() => {
  jest.clearAllMocks();
  mockProjects.mockResolvedValue([SPRING]);
  mockList.mockResolvedValue([]);
});

// 여러 행사 묶음(ADR-0009 §6) — 담을 행사를 명시해 보낸다. 범위를 바꾸면 그 범위의 행사만 고른다.
it("공간 범위에서 고른 행사로 묶고, 프로젝트로 바꾸면 그 프로젝트 행사만 보인다", async () => {
  mockCreate.mockResolvedValue({ exportId: "Ex1", status: "PENDING", photoCount: 120, createdAt: "x", scope: "WORKSPACE" });
  render(<StudioMultiExports workspaceId="Ws1" canUseWorkspace events={EVENTS} />);

  await waitFor(() => expect(mockList).toHaveBeenCalledWith({ kind: "workspace", workspaceId: "Ws1" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "팝업 행사" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "봄 웨딩 A" }));
  fireEvent.click(screen.getByRole("button", { name: "고른 행사 사진 묶기 (2)" }));

  // 화면 순서로 보낸다.
  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ kind: "workspace", workspaceId: "Ws1" }, ["Ev1", "Ev3"]));
  expect(await screen.findByText("120장을 묶고 있어요. 다 되면 아래에서 받을 수 있어요.")).toBeInTheDocument();

  await screen.findByRole("option", { name: "봄 시즌" });
  fireEvent.change(screen.getByLabelText("범위"), { target: { value: "Pj1" } });
  await waitFor(() => expect(mockList).toHaveBeenCalledWith({ kind: "project", projectId: "Pj1" }));
  expect(screen.queryByRole("checkbox", { name: "팝업 행사" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "모두 고르기" }));
  expect(screen.getByRole("button", { name: "고른 행사 사진 묶기 (2)" })).toBeEnabled();
});

// 권한 없는 행사는 서버가 조용히 빼지 않고 막는다 — 어느 행사인지 이름으로 알려야 고칠 수 있다.
it("사진 묶음 권한이 없는 행사가 있으면(PHOTO-001) 그 행사 이름을 알린다", async () => {
  mockCreate.mockRejectedValue(
    new ApiRequestError({ status: 403, code: "PHOTO-001", apiMessage: "x", data: { code: "PHOTO-001", data: { eventIds: ["Ev2"] } } }),
  );
  render(<StudioMultiExports workspaceId="Ws1" canUseWorkspace events={EVENTS} />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "모두 고르기" }));
  fireEvent.click(screen.getByRole("button", { name: /고른 행사 사진 묶기/ }));

  expect(await screen.findByRole("alert")).toHaveTextContent("(봄 웨딩 B)");
});

// 운영 담당은 공간 범위를 쓰지 못한다 — 멤버인 프로젝트로 시작하고, 없으면 그렇다고 알린다.
it("운영 담당은 프로젝트 범위로만 쓰고, 맡은 프로젝트가 없으면 안내만 보인다", async () => {
  const { unmount } = render(<StudioMultiExports workspaceId="Ws1" canUseWorkspace={false} events={EVENTS.slice(0, 2)} />);
  await waitFor(() => expect(mockList).toHaveBeenCalledWith({ kind: "project", projectId: "Pj1" }));
  expect(within(screen.getByLabelText("범위")).queryByRole("option", { name: "공간 전체" })).not.toBeInTheDocument();
  unmount();

  mockProjects.mockResolvedValue([]);
  mockList.mockClear();
  render(<StudioMultiExports workspaceId="Ws1" canUseWorkspace={false} events={EVENTS.slice(0, 2)} />);
  expect(await screen.findByText("맡은 프로젝트가 있어야 여러 행사 사진을 한 번에 묶을 수 있어요.")).toBeInTheDocument();
  expect(mockList).not.toHaveBeenCalled();
});

it("다 된 묶음을 받고, 행사마다 담긴 장수를 보인다", async () => {
  mockList.mockResolvedValue([
    {
      exportId: "Ex9",
      status: "DONE",
      photoCount: 30,
      sizeBytes: 3 * 1024 * 1024,
      createdAt: "x",
      scope: "WORKSPACE",
      events: [
        { eventId: "Ev1", name: "봄 웨딩 A", photoCount: 10 },
        { eventId: "Ev3", name: "팝업 행사", photoCount: 20 },
      ],
    },
  ]);
  mockDownload.mockResolvedValue({ url: "https://example.com/zip", expiresAt: "x" });
  render(<StudioMultiExports workspaceId="Ws1" canUseWorkspace events={EVENTS} />);

  expect(await screen.findByText("봄 웨딩 A 10장 · 팝업 행사 20장")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "받기" }));
  await waitFor(() => expect(mockDownload).toHaveBeenCalledWith({ kind: "workspace", workspaceId: "Ws1" }, "Ex9"));
});

it("행사는 한 번에 200개까지만 담는다", async () => {
  const many = Array.from({ length: 201 }, (_, i) => ev(`Ev${i + 100}`, `행사 ${i + 1}`));
  render(<StudioMultiExports workspaceId="Ws1" canUseWorkspace events={many} />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "모두 고르기" }));
  expect(screen.getByRole("alert")).toHaveTextContent("한 번에 행사 200개까지 담을 수 있어요.");
  expect(screen.getByRole("button", { name: "고른 행사 사진 묶기 (201)" })).toBeDisabled();
});
