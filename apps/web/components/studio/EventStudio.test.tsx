import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EventStudio } from "@/components/studio/EventStudio";
import type { StudioEvent } from "@/lib/studio/studioApi";

const mockGetEvent = jest.fn();
const mockUpdate = jest.fn();
const mockRun = jest.fn();

jest.mock("@/components/layout/AppNav", () => ({ AppNav: () => null }));
jest.mock("@/lib/studio/studioApi", () => ({
  ...jest.requireActual("@/lib/studio/studioApi"),
  getEvent: (...args: unknown[]) => mockGetEvent(...args),
  updateEventSettings: (...args: unknown[]) => mockUpdate(...args),
  runEventAction: (...args: unknown[]) => mockRun(...args),
}));

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
  // 이 화면이 다루지 않는 프레임은 보내지 않는다 — 보낸 필드만 바뀐다.
  expect(settings).not.toHaveProperty("frames");
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
