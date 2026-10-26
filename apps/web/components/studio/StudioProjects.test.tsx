import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StudioProjects } from "@/components/studio/StudioProjects";

const api = {
  listProjects: jest.fn(),
  createProject: jest.fn(),
  updateProject: jest.fn(),
  getWorkspaceBrandDefaults: jest.fn(),
  updateWorkspaceBrandDefaults: jest.fn(),
  listProjectMembers: jest.fn(),
  putProjectMember: jest.fn(),
  removeProjectMember: jest.fn(),
};
const mockListMembers = jest.fn();
jest.mock("@/lib/studio/accessApi", () => ({
  ...jest.requireActual("@/lib/studio/accessApi"),
  listMembers: (...a: unknown[]) => mockListMembers(...a),
}));
jest.mock("@/lib/studio/projectsApi", () => ({
  ...jest.requireActual("@/lib/studio/projectsApi"),
  listProjects: (...a: unknown[]) => api.listProjects(...a),
  createProject: (...a: unknown[]) => api.createProject(...a),
  updateProject: (...a: unknown[]) => api.updateProject(...a),
  getWorkspaceBrandDefaults: (...a: unknown[]) => api.getWorkspaceBrandDefaults(...a),
  updateWorkspaceBrandDefaults: (...a: unknown[]) => api.updateWorkspaceBrandDefaults(...a),
  listProjectMembers: (...a: unknown[]) => api.listProjectMembers(...a),
  putProjectMember: (...a: unknown[]) => api.putProjectMember(...a),
  removeProjectMember: (...a: unknown[]) => api.removeProjectMember(...a),
}));
const mockVersions = jest.fn();
jest.mock("@/lib/studio/studioApi", () => ({
  ...jest.requireActual("@/lib/studio/studioApi"),
  listPickableFrameVersions: (...a: unknown[]) => mockVersions(...a),
  listWorkspaceFrames: async () => [],
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
    frames: null,
    consentItems: null,
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

// Codex 리뷰(#553): 공간이 켠 숨김을 프로젝트에서 새로 끄려면 「정하지 않음」과 「보이기(끔)」를 구분해야 한다.
it("브랜딩은 정하지 않음과 명시적 해제를 구분해, 새로 끈 값을 보낸다", async () => {
  api.updateProject.mockImplementation(async (id: string, patch: { brandDefaults: object }) => ({ ...SPRING, brandDefaults: patch.brandDefaults }));
  render(<StudioProjects workspaceId="Ws1" />);
  fireEvent.click(await screen.findByRole("button", { name: /프로젝트 기본값/ }));
  const form = screen.getByRole("form", { name: "프로젝트 기본값" });
  expect(within(form).getByLabelText("하루컷 표시")).toHaveValue("");
  expect(within(form).queryByLabelText("하루컷 표시 숨기기")).not.toBeInTheDocument();

  fireEvent.change(within(form).getByLabelText("하루컷 표시"), { target: { value: "off" } });
  fireEvent.change(within(form).getByLabelText("완성 사진의 로고"), { target: { value: "NONE" } });
  fireEvent.click(within(form).getByRole("button", { name: "기본값 저장" }));
  await waitFor(() => expect(api.updateProject).toHaveBeenCalled());
  expect(api.updateProject.mock.calls[0][1].brandDefaults.theme).toEqual({
    schemaVersion: 1,
    branding: { hideHarucutBranding: false, outputLogo: "NONE" },
  });
});

// 프로젝트 멤버(P3-2) — 공간의 운영 담당에게 이 프로젝트의 모든 행사를 맡긴다. 운영 권한과 사진 권한을 따로 고른다.
it("운영 담당에게 프로젝트 권한을 주고, 프로젝트에서 뺀다", async () => {
  mockListMembers.mockResolvedValue([
    { userId: "u-op", name: "운영 지수", role: "OPERATOR", joinedAt: "" },
    { userId: "u-ad", name: "관리 현", role: "ADMIN", joinedAt: "" },
  ]);
  api.listProjectMembers.mockResolvedValue([]);
  api.putProjectMember.mockResolvedValue({
    userId: "u-op",
    name: "운영 지수",
    operations: ["MANAGE_EVENT", "MANAGE_BOOTH"],
    permissions: ["VIEW_PHOTOS"],
    createdAt: "",
  });
  api.removeProjectMember.mockResolvedValue(undefined);
  render(<StudioProjects workspaceId="Ws1" />);

  const spring = (await screen.findByText("봄 웨딩")).closest("li")!;
  fireEvent.click(within(spring).getByRole("button", { name: /운영 담당/ }));
  const row = (await within(spring).findByText("운영 지수")).closest("li")!;
  expect(within(spring).queryByText("관리 현")).not.toBeInTheDocument();
  expect(api.listProjectMembers).toHaveBeenCalledWith("Pj1");

  fireEvent.click(within(row).getByRole("checkbox", { name: "부스 기기" }));
  fireEvent.click(within(row).getByRole("checkbox", { name: "행사 설정·게시" }));
  fireEvent.click(within(row).getByRole("checkbox", { name: "사진 보기" }));
  fireEvent.click(within(row).getByRole("button", { name: "저장" }));
  // 순서는 화면이 아니라 정해진 순서로 보낸다.
  await waitFor(() =>
    expect(api.putProjectMember).toHaveBeenCalledWith("Pj1", "u-op", ["MANAGE_EVENT", "MANAGE_BOOTH"], ["VIEW_PHOTOS"]),
  );
  expect(await within(row).findByText("멤버")).toBeInTheDocument();

  fireEvent.click(within(row).getByRole("button", { name: "프로젝트에서 빼기" }));
  await waitFor(() => expect(api.removeProjectMember).toHaveBeenCalledWith("Pj1", "u-op"));
  await waitFor(() => expect(within(row).queryByText("멤버")).not.toBeInTheDocument());
  expect(within(row).getByRole("checkbox", { name: "행사 설정·게시" })).not.toBeChecked();
});

// P3-1 에서 미룬 제공 프레임·동의 항목 기본값 — 목록째 내려간다. 동의 문구를 바꾼 항목만 version 을 올린다.
it("프로젝트 기본값에 제공 프레임과 동의 항목을 정해 보낸다", async () => {
  mockVersions.mockResolvedValue([
    { frameVersionId: 41, frameId: 7, versionNo: 2, frameType: "CLASSIC", title: "웨딩 세로", previewUrl: null, source: "WORKSPACE", publishedAt: "x" },
  ]);
  api.listProjects.mockResolvedValue([
    {
      ...SPRING,
      brandDefaults: { consentItems: [{ code: "photo", title: "사진 수집", body: "신랑신부가 받아요.", required: true, version: 3 }] },
    },
  ]);
  api.updateProject.mockImplementation(async (id: string, patch: { brandDefaults: object }) => ({ ...SPRING, brandDefaults: patch.brandDefaults }));
  render(<StudioProjects workspaceId="Ws1" />);

  fireEvent.click(await screen.findByRole("button", { name: /프로젝트 기본값/ }));
  const form = screen.getByRole("form", { name: "프로젝트 기본값" });
  expect(within(form).getAllByRole("checkbox", { name: "기본값으로 정하기" })[2]).toBeChecked();

  fireEvent.click(within(form).getAllByRole("checkbox", { name: "기본값으로 정하기" })[1]);
  fireEvent.click(await within(form).findByRole("checkbox", { name: /웨딩 세로/ }));
  // 편집기로 떠나는 「공간 프레임」 관리 칸은 기본값 화면에 없다.
  expect(within(form).queryByRole("button", { name: /만들기$/ })).not.toBeInTheDocument();

  fireEvent.change(within(form).getByLabelText("본문"), { target: { value: "신랑신부와 사진 업체가 받아요." } });
  fireEvent.click(within(form).getByRole("button", { name: "동의 항목 추가" }));
  fireEvent.change(within(form).getAllByLabelText("제목")[1], { target: { value: "공유 동의" } });
  fireEvent.click(within(form).getByRole("button", { name: "기본값 저장" }));

  await waitFor(() => expect(api.updateProject).toHaveBeenCalled());
  const sent = api.updateProject.mock.calls[0][1].brandDefaults;
  expect(sent.frames).toEqual([{ frameVersionId: 41, layoutType: "CLASSIC", isDefault: true, sortOrder: 1 }]);
  expect(sent.consentItems).toEqual([
    { code: "photo", title: "사진 수집", body: "신랑신부와 사진 업체가 받아요.", required: true, version: 4 },
    { code: "consent-2", title: "공유 동의", body: "", required: true, version: 1 },
  ]);
});
