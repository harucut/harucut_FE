import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EventStudio } from "@/components/studio/EventStudio";
import { useThemeSession } from "@/lib/themeSessionStore";
import type { StudioEvent } from "@/lib/studio/studioApi";

const mockGetEvent = jest.fn();
const mockPush = jest.fn();
const mockListVersions = jest.fn();
const mockListFrames = jest.fn();
const mockPublishFrame = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));
const mockUpdate = jest.fn();
const mockRun = jest.fn();

jest.mock("@/components/layout/AppNav", () => ({ AppNav: () => null }));
jest.mock("@/lib/studio/studioApi", () => ({
  ...jest.requireActual("@/lib/studio/studioApi"),
  getEvent: (...args: unknown[]) => mockGetEvent(...args),
  updateEventSettings: (...args: unknown[]) => mockUpdate(...args),
  runEventAction: (...args: unknown[]) => mockRun(...args),
  listPickableFrameVersions: (...args: unknown[]) => mockListVersions(...args),
  listWorkspaceFrames: (...args: unknown[]) => mockListFrames(...args),
  publishFrameVersion: (...args: unknown[]) => mockPublishFrame(...args),
  listBoothDevices: async () => [],
}));
const mockUsage = jest.fn();
jest.mock("@/lib/studio/usageApi", () => ({ getEventUsage: (...a: unknown[]) => mockUsage(...a) }));
const mockThemeUpload = jest.fn();
jest.mock("@/lib/assetUploadApi", () => ({
  ...jest.requireActual("@/lib/assetUploadApi"),
  uploadAsset: (...a: unknown[]) => mockThemeUpload(...a),
}));
const mockEffective = jest.fn();
const mockProjects = jest.fn();
const mockWsDefaults = jest.fn();
jest.mock("@/lib/studio/projectsApi", () => ({
  ...jest.requireActual("@/lib/studio/projectsApi"),
  getEffectiveSettings: (...a: unknown[]) => mockEffective(...a),
  listProjects: (...a: unknown[]) => mockProjects(...a),
  getWorkspaceBrandDefaults: (...a: unknown[]) => mockWsDefaults(...a),
}));
jest.mock("@/lib/studio/accessApi", () => ({
  ...jest.requireActual("@/lib/studio/accessApi"),
  listEventGrants: async () => [],
}));

const VERSION_CLASSIC = {
  frameVersionId: 41,
  frameId: 7,
  versionNo: 2,
  frameType: "CLASSIC",
  title: "웨딩 세로",
  previewUrl: null,
  source: "WORKSPACE",
  publishedAt: "2026-10-26T00:00:00Z",
};
const VERSION_SYSTEM = { ...VERSION_CLASSIC, frameVersionId: 9, frameId: 201, versionNo: 1, title: "기본 세로", source: "SYSTEM" };

function apiError(code: string, data?: unknown) {
  return Object.assign(new Error(code), { code, data: { code, data } });
}

function event(overrides: Partial<StudioEvent> = {}): StudioEvent {
  return {
    eventId: "Ev1",
    workspaceId: "Ws1",
    status: "DRAFT",
    paused: false,
    captureOpen: false,
    settingsVersion: 3,
    currentExperienceVersion: null,
    joinUrlPath: "/e/wedding-1027",
    settings: {
      name: "민지 ♥ 준호 결혼식",
      slug: "wedding-1027",
      byodEnabled: true,
      boothEnabled: false,
      allowedLayouts: ["CLASSIC"],
      consentItems: [
        { code: "photo", title: "사진 수집·이용 동의", body: "신랑신부가 받아요.", required: true, version: 2 },
        { code: "share", title: "공유 동의", body: "행사 후 공유해요.", required: false, version: 1 },
      ],
      resultRetentionDays: 30,
    },
    ...overrides,
  };
}

async function renderStudio(initial = event()) {
  mockGetEvent.mockResolvedValue(initial);
  render(<EventStudio eventId="Ev1" />);
  await screen.findByRole("heading", { name: initial.settings.name ?? "" });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListVersions.mockResolvedValue([VERSION_CLASSIC, VERSION_SYSTEM]);
  mockListFrames.mockResolvedValue([{ frameId: 7, title: "웨딩 세로", frameType: "CLASSIC", components: [] }]);
  useThemeSession.getState().reset();
  mockEffective.mockRejectedValue(new Error("no sources"));
  mockProjects.mockResolvedValue([]);
  mockWsDefaults.mockResolvedValue({});
  mockUsage.mockResolvedValue({ composeQuota: 0, used: 0, reserved: 0, remaining: 0 });
});

it("참가 링크를 이 화면의 오리진에 붙여 QR 과 함께 보여 준다", async () => {
  await renderStudio();
  expect(screen.getByText(`${window.location.origin}/e/wedding-1027`)).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "행사 참가 링크 QR" })).toBeInTheDocument();
});

/*
  참가자 동의 기록은 「어느 버전의 문구」에 대한 것이다. 바꾼 문구에 옛 버전을 남기면 예전 동의가
  새 문구에 대한 것처럼 읽히고, 그대로인 문구에 새 버전을 매기면 기록이 가리키는 문구가 흐려진다.
*/
it("문구를 바꾼 동의 항목만 version 을 올려 저장한다", async () => {
  await renderStudio();
  mockUpdate.mockResolvedValue(event({ settingsVersion: 4 }));

  fireEvent.change(screen.getAllByLabelText("본문")[0], { target: { value: "신랑신부와 사진 업체가 받아요." } });
  fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  const [eventId, settingsVersion, settings] = mockUpdate.mock.calls[0];
  expect(eventId).toBe("Ev1");
  expect(settingsVersion).toBe(3);
  expect(settings.consentItems.map((c: { code: string; version: number }) => [c.code, c.version])).toEqual([
    ["photo", 3],
    ["share", 1],
  ]);
  // 바뀐 필드만 보낸다 — 상속받은 값을 행사 직접 값으로 굳히지 않는다(ADR-0009 §2-3).
  expect(Object.keys(settings)).toEqual(["consentItems"]);
});

it("다른 곳이 먼저 바꿨으면(EVENT-005) 묻고, 덮어쓰기를 고르면 서버 버전으로 다시 저장한다", async () => {
  await renderStudio();
  mockUpdate.mockRejectedValueOnce(apiError("EVENT-005", { currentSettingsVersion: 7 }));
  mockUpdate.mockResolvedValueOnce(event({ settingsVersion: 8 }));

  fireEvent.change(screen.getByLabelText("행사 이름"), { target: { value: "민지 ♥ 준호" } });
  fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
  fireEvent.click(await screen.findByRole("button", { name: "내 설정으로 덮어쓰기" }));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
  expect(mockUpdate.mock.calls[1][1]).toBe(7);
});

it("게시 검증에 걸리면(EVENT-003) 할 일을 설정 묶음별로 보여 준다", async () => {
  await renderStudio();
  mockRun.mockRejectedValueOnce(
    apiError("EVENT-003", {
      violations: [
        { field: "frames", reason: "제공 프레임이 하나 이상 있어야 한다" },
        { field: "allowedLayouts", reason: "CLASSIC 에 연결된 프레임이 없다" },
      ],
    }),
  );

  fireEvent.click(screen.getByRole("button", { name: "게시하기" }));

  expect(await screen.findByText("게시하려면 아래를 고쳐 주세요.")).toBeInTheDocument();
  expect(screen.getByText(/허용할 레이아웃을 하나 이상 고르고/)).toBeInTheDocument();
  expect(screen.getByText(/제공 프레임을 확인해 주세요/)).toBeInTheDocument();
  expect(screen.getByText("CLASSIC 에 연결된 프레임이 없다")).toBeInTheDocument();
});

// 저장 안 한 설정이 있는 채로 게시하면 운영자가 본 화면과 게시본이 다르다.
it("저장하지 않은 설정이 있으면 게시하지 못한다", async () => {
  await renderStudio();
  fireEvent.click(screen.getByLabelText("현장 부스"));
  expect(screen.getByRole("button", { name: "게시하기" })).toBeDisabled();
  expect(screen.getByText("바꾼 설정을 저장한 뒤 게시할 수 있어요.")).toBeInTheDocument();
});

it("게시한 뒤에는 참가 주소를 바꿀 수 없고, 운영 중이면 일시 중지·촬영 종료를 고른다", async () => {
  await renderStudio(event({ status: "LIVE", captureOpen: true, currentExperienceVersion: 1 }));
  expect(screen.getByLabelText("참가 주소")).toBeDisabled();
  expect(screen.getByLabelText("참가 주소")).toHaveAccessibleDescription("게시한 뒤에는 바꿀 수 없어요.");

  mockRun.mockResolvedValueOnce(event({ status: "LIVE", paused: true }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "일시 중지" }));
  });
  expect(mockRun).toHaveBeenCalledWith("Ev1", "pause");
  expect(screen.getByRole("button", { name: "다시 열기" })).toBeInTheDocument();
});

// 되돌릴 수 없는 전환이라 한 번 묻는다.
it("촬영 종료는 확인을 받은 뒤에 보낸다", async () => {
  await renderStudio(event({ status: "LIVE", captureOpen: true }));
  mockRun.mockResolvedValueOnce(event({ status: "CAPTURE_CLOSED" }));

  fireEvent.click(screen.getByRole("button", { name: "촬영 종료" }));
  expect(mockRun).not.toHaveBeenCalled();
  const dialog = await screen.findByRole("dialog");
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "촬영 종료" }));
  });
  await waitFor(() => expect(mockRun).toHaveBeenCalledWith("Ev1", "close-capture"));
});

it("처음 고른 프레임이 기본이 되고, 저장하면 고른 발행본을 보낸다", async () => {
  await renderStudio();
  mockUpdate.mockResolvedValue(event({ settingsVersion: 4 }));

  fireEvent.click(await screen.findByRole("checkbox", { name: /웨딩 세로/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /기본 세로/ }));
  expect(screen.getAllByRole("radio", { name: "기본" })[0]).toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  expect(mockUpdate.mock.calls[0][2].frames).toEqual([
    { frameVersionId: 41, layoutType: "CLASSIC", isDefault: true, sortOrder: 1 },
    { frameVersionId: 9, layoutType: "CLASSIC", isDefault: false, sortOrder: 2 },
  ]);
});

// 남기면 게시 검사가 「허용하지 않은 레이아웃의 프레임」으로 막는다.
it("허용 레이아웃을 빼면 그 판형의 프레임도 같이 뺀다", async () => {
  await renderStudio(
    event({
      settings: {
        ...event().settings,
        frames: [{ frameVersionId: 41, layoutType: "CLASSIC", isDefault: true, sortOrder: 1 }],
      },
    }),
  );
  mockUpdate.mockResolvedValue(event());

  fireEvent.click(screen.getByLabelText("세로 4컷"));
  fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  expect(mockUpdate.mock.calls[0][2]).toMatchObject({ allowedLayouts: [], frames: [] });
});

it("행사용 프레임 만들기는 편집기를 이 공간 맥락으로 열고 여기로 돌아오게 한다", async () => {
  await renderStudio();
  fireEvent.click(await screen.findByRole("button", { name: "세로 4컷 만들기" }));

  expect(useThemeSession.getState()).toMatchObject({
    frameId: "classic-4",
    remoteFrameId: null,
    workspaceId: "Ws1",
    returnTo: "/studio/events/Ev1",
  });
  expect(mockPush).toHaveBeenCalledWith("/theme/sticker");
});

// 편집기로 떠나면 저장 안 한 설정이 사라진다.
it("저장 안 한 설정이 있으면 프레임을 만들러 떠나지 않는다", async () => {
  await renderStudio();
  fireEvent.change(screen.getByLabelText("행사 이름"), { target: { value: "바뀐 이름" } });
  expect(await screen.findByRole("button", { name: "세로 4컷 만들기" })).toBeDisabled();
});

it("공간 프레임을 발행하면 고르기 목록을 다시 받는다", async () => {
  await renderStudio();
  mockPublishFrame.mockResolvedValue({ frameVersionId: 42, versionNo: 3 });
  fireEvent.click(await screen.findByRole("button", { name: "새 버전 발행" }));

  await waitFor(() => expect(mockPublishFrame).toHaveBeenCalledWith(7));
  await waitFor(() => expect(mockListVersions).toHaveBeenCalledTimes(2));
  expect(screen.getByText(/3번째 발행본을 만들었어요/)).toBeInTheDocument();
});

// 부스 관리는 저장된 설정에서 현장 부스를 켠 행사에만 보인다.
it("현장 부스를 켠 행사에만 부스 기기 관리를 보여 준다", async () => {
  await renderStudio(event({ settings: { ...event().settings, boothEnabled: true } }));
  expect(await screen.findByRole("heading", { name: "부스 기기" })).toBeInTheDocument();
});

it("현장 부스를 끈 행사에는 부스 기기 관리가 없다", async () => {
  await renderStudio();
  expect(screen.queryByRole("heading", { name: "부스 기기" })).not.toBeInTheDocument();
});

// P2B-4 — 행사 화면 꾸미기는 설정 저장과 같은 PATCH 로 간다. 빈 문구·빈 색은 빼고 보낸다.
it("꾸민 문구와 글꼴만 테마로 저장한다", async () => {
  await renderStudio();
  mockUpdate.mockResolvedValue(event({ settingsVersion: 4 }));

  fireEvent.change(screen.getByLabelText("처음 화면 · 부스 대기 화면"), { target: { value: "와 주셔서 고마워요" } });
  fireEvent.change(screen.getByLabelText("글꼴"), { target: { value: "GOWUN_DODUM" } });
  fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  expect(mockUpdate.mock.calls[0][2].theme).toEqual({
    schemaVersion: 1,
    font: "GOWUN_DODUM",
    copy: { welcome: "와 주셔서 고마워요" },
  });
});

it("이용권이 없으면 사용량 자리에 문의를 두고, 디자인을 바꾸면 게시 전에 미리 알린다", async () => {
  await renderStudio();
  expect(await screen.findByText("아직 이 행사에 적용된 이용권이 없어요.")).toBeInTheDocument();
  expect(mockUsage).toHaveBeenCalledWith("Ev1");

  fireEvent.change(screen.getByLabelText("글꼴"), { target: { value: "NANUM_MYEONGJO" } });
  expect(screen.getByText(/지금 이용권에는 행사 화면 디자인 기능이 없어요/)).toBeInTheDocument();
});

// ADR-0008 §7 — 보관 기간이 지나면 사진함에서도 지워진다. 이용권 상한이 있으면 그 안에서만 정한다.
it("보관 일수 설명에 사진이 지워진다는 것과 이용권 상한을 알린다", async () => {
  mockUsage.mockResolvedValue({
    entitlement: { scope: "WORKSPACE", validFrom: "2026-10-01T00:00:00Z", validTo: "2026-12-31T00:00:00Z", features: [] },
    composeQuota: 100,
    used: 0,
    reserved: 0,
    remaining: 100,
    retentionDays: 60,
  });
  await renderStudio();
  const input = screen.getByLabelText("보관 일수");
  await waitFor(() => expect(input).toHaveAttribute("max", "60"));
  expect(input).toHaveAccessibleDescription(/지나면 사진이 지워져요.*지금 이용권으로는 60일까지/);
});

// Codex 리뷰(#544): 업로드 중 저장하면 저장 응답이 업로드 결과(자산 ID)를 덮어 이미지가 사라진다.
it("행사 화면 이미지를 올리는 동안에는 설정 저장을 막는다", async () => {
  let finish: (value: unknown) => void = () => {};
  mockThemeUpload.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await renderStudio();
  fireEvent.change(screen.getByLabelText(/^행사 이름/), { target: { value: "새 이름" } });
  fireEvent.change(screen.getByLabelText("로고 올리기"), {
    target: { files: [new File(["x"], "logo.png", { type: "image/png" })] },
  });
  expect(await screen.findByRole("button", { name: "이미지 올리는 중…" })).toBeDisabled();

  await act(async () => finish({ assetId: "AsLogo", key: "k", url: "https://s3/logo.png" }));
  expect(screen.getByRole("button", { name: "설정 저장" })).toBeEnabled();
});

// ADR-0009 §2 — 공간·프로젝트 기본값을 받은 값은 출처를 보이고, 「기본값 따르기」는 그 필드를 null 로 보낸다.
it("상속받은 값의 출처를 보이고, 기본값 따르기는 그 필드만 null 로 보낸다", async () => {
  mockEffective.mockResolvedValue({
    settings: {},
    sources: { name: "EVENT", allowedLayouts: "PROJECT", resultRetentionDays: "EVENT", consentItems: "EVENT" },
  });
  mockProjects.mockResolvedValue([{ projectId: "Pj1", workspaceId: "Ws1", name: "봄 웨딩", archived: false, createdAt: "x", brandDefaults: { resultRetentionDays: 60 } }]);
  mockUpdate.mockResolvedValue(event({ settingsVersion: 4 }));
  await renderStudio(event({ settings: { ...event().settings, projectId: "Pj1" } }));

  expect(await screen.findByText("프로젝트 기본값")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "기본값 따르기" })[0]);
  expect(screen.getByText("저장하면 기본값을 따라요")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  expect(mockUpdate.mock.calls[0][2]).toEqual({ resultRetentionDays: null });
});

it("초안 행사는 프로젝트를 고를 수 있고, 게시한 행사는 막는다", async () => {
  mockProjects.mockResolvedValue([
    { projectId: "Pj1", workspaceId: "Ws1", name: "봄 웨딩", archived: false, createdAt: "x" },
    { projectId: "Pj2", workspaceId: "Ws1", name: "지난 시즌", archived: true, createdAt: "x" },
  ]);
  mockUpdate.mockResolvedValue(event({ settingsVersion: 4 }));
  await renderStudio();
  const select = await screen.findByLabelText("프로젝트");
  expect(within(select).queryByRole("option", { name: /지난 시즌/ })).not.toBeInTheDocument();
  fireEvent.change(select, { target: { value: "Pj1" } });
  fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  expect(mockUpdate.mock.calls[0][2]).toEqual({ projectId: "Pj1" });
});
