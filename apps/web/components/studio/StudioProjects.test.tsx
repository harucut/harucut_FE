import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StudioProjects } from "@/components/studio/StudioProjects";

const api = {
  listProjects: jest.fn(),
  createProject: jest.fn(),
  updateProject: jest.fn(),
  getWorkspaceBrandDefaults: jest.fn(),
  updateWorkspaceBrandDefaults: jest.fn(),
};
jest.mock("@/lib/studio/projectsApi", () => ({
  ...jest.requireActual("@/lib/studio/projectsApi"),
  listProjects: (...a: unknown[]) => api.listProjects(...a),
  createProject: (...a: unknown[]) => api.createProject(...a),
  updateProject: (...a: unknown[]) => api.updateProject(...a),
  getWorkspaceBrandDefaults: (...a: unknown[]) => api.getWorkspaceBrandDefaults(...a),
  updateWorkspaceBrandDefaults: (...a: unknown[]) => api.updateWorkspaceBrandDefaults(...a),
}));
jest.mock("@/lib/assetUploadApi", () => ({ uploadAsset: jest.fn(), getAsset: jest.fn() }));

const SPRING = { projectId: "Pj1", workspaceId: "Ws1", name: "봄 웨딩", archived: false, createdAt: "x", brandDefaults: {} };

beforeEach(() => {
  jest.clearAllMocks();
  api.listProjects.mockResolvedValue([SPRING]);
  api.getWorkspaceBrandDefaults.mockResolvedValue({ resultRetentionDays: 60 });
});

it("프로젝트를 만들고, 이름을 바꾸고, 보관한다", async () => {
  api.createProject.mockResolvedValue({ ...SPRING, projectId: "Pj2", name: "가을 행사" });
  api.updateProject.mockImplementation(async (id: string, patch: object) => ({ ...SPRING, projectId: id, ...patch }));
  render(<StudioProjects workspaceId="Ws1" />);

  fireEvent.change(await screen.findByLabelText("새 프로젝트 이름"), { target: { value: "가을 행사" } });
  fireEvent.click(screen.getByRole("button", { name: "프로젝트 만들기" }));
  expect(await screen.findByText("가을 행사")).toBeInTheDocument();
  expect(api.createProject).toHaveBeenCalledWith("Ws1", "가을 행사");

  const spring = screen.getByText("봄 웨딩").closest("li")!;
  fireEvent.click(within(spring).getByRole("button", { name: "이름 바꾸기" }));
  fireEvent.change(within(spring).getByLabelText("프로젝트 이름"), { target: { value: "봄 웨딩 2026" } });
  fireEvent.click(within(spring).getByRole("button", { name: "저장" }));
  await waitFor(() => expect(api.updateProject).toHaveBeenCalledWith("Pj1", { name: "봄 웨딩 2026" }));

  fireEvent.click(within(screen.getByText("봄 웨딩 2026").closest("li")!).getByRole("button", { name: "보관" }));
  await waitFor(() => expect(api.updateProject).toHaveBeenCalledWith("Pj1", { archived: true }));
  expect(await screen.findByText("보관됨")).toBeInTheDocument();
});

// 정하지 않은 필드는 null(그 키를 지움) — 위 단계·서버 기본값을 따른다.
it("공간 기본값은 정한 것만 보내고, 정하지 않음으로 돌린 필드는 지운다", async () => {
  api.updateWorkspaceBrandDefaults.mockImplementation(async () => ({ byodEnabled: true }));
  render(<StudioProjects workspaceId="Ws1" />);
  fireEvent.click(await screen.findByRole("button", { name: /공간 기본값/ }));
  const form = screen.getByRole("form", { name: "공간 기본값" });
  expect(within(form).getByLabelText("결과 보관 일수")).toHaveValue(60);

  fireEvent.change(within(form).getByLabelText("개인 휴대폰 참가"), { target: { value: "on" } });
  fireEvent.change(within(form).getByLabelText("결과 보관 일수"), { target: { value: "" } });
  fireEvent.click(within(form).getByRole("button", { name: "기본값 저장" }));

  await waitFor(() => expect(api.updateWorkspaceBrandDefaults).toHaveBeenCalled());
  expect(api.updateWorkspaceBrandDefaults.mock.calls[0][1]).toEqual({
    byodEnabled: true,
    boothEnabled: null,
    allowedLayouts: null,
    resultRetentionDays: null,
    theme: null,
  });
  expect(await within(form).findByText(/공간 기본값을 저장했어요/)).toBeInTheDocument();
});

// Codex 리뷰(#553): 기본값 저장을 기다리는 동안 바꾼 입력이 응답으로 덮이면 안 된다 — 저장 중에는 편집을 잠근다.
it("기본값을 저장하는 동안에는 입력을 잠근다", async () => {
  api.updateWorkspaceBrandDefaults.mockImplementation(() => new Promise(() => {}));
  render(<StudioProjects workspaceId="Ws1" />);
  fireEvent.click(await screen.findByRole("button", { name: /공간 기본값/ }));
  const form = screen.getByRole("form", { name: "공간 기본값" });
  fireEvent.change(within(form).getByLabelText("개인 휴대폰 참가"), { target: { value: "on" } });
  fireEvent.click(within(form).getByRole("button", { name: "기본값 저장" }));
  await waitFor(() => expect(within(form).getByLabelText("결과 보관 일수")).toBeDisabled());
  expect(within(form).getByLabelText("개인 휴대폰 참가")).toBeDisabled();
});

// Codex 리뷰(#553): 프로젝트가 공간의 숨김을 끈 재정의(false)는 다른 칸을 저장해도 남아야 한다.
it("프로젝트 기본값의 명시적인 브랜딩 해제는 다른 칸을 저장해도 보낸다", async () => {
  api.listProjects.mockResolvedValue([
    { ...SPRING, brandDefaults: { theme: { schemaVersion: 1, branding: { hideHarucutBranding: false } } } },
  ]);
  api.updateProject.mockImplementation(async (id: string, patch: { brandDefaults: object }) => ({ ...SPRING, brandDefaults: patch.brandDefaults }));
  render(<StudioProjects workspaceId="Ws1" />);
  fireEvent.click(await screen.findByRole("button", { name: /프로젝트 기본값/ }));
  const form = screen.getByRole("form", { name: "프로젝트 기본값" });
  fireEvent.change(within(form).getByLabelText("결과 보관 일수"), { target: { value: "90" } });
  fireEvent.click(within(form).getByRole("button", { name: "기본값 저장" }));
  await waitFor(() => expect(api.updateProject).toHaveBeenCalled());
  const patch = api.updateProject.mock.calls[0][1].brandDefaults;
  expect(patch.resultRetentionDays).toBe(90);
  expect(patch.theme).toEqual({ schemaVersion: 1, branding: { hideHarucutBranding: false } });
});
