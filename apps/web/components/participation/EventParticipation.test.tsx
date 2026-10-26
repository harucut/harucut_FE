import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiRequestError } from "@/lib/clientApi";
import { EventParticipation } from "@/components/participation/EventParticipation";
import type { PublicEvent } from "@/lib/event/types";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

const api = {
  getPublicEvent: jest.fn(),
  startByodSession: jest.fn(),
  getParticipantSession: jest.fn(),
  submitConsents: jest.fn(),
  startCaptureRun: jest.fn(),
  submitEventCompose: jest.fn(),
  listParticipantResults: jest.fn(),
  reissueResultAccess: jest.fn(),
  getParticipantDownload: jest.fn(),
};
jest.mock("@/lib/event/eventApi", () => ({
  getPublicEvent: (...a: unknown[]) => api.getPublicEvent(...a),
  startByodSession: (...a: unknown[]) => api.startByodSession(...a),
  getParticipantSession: (...a: unknown[]) => api.getParticipantSession(...a),
  submitConsents: (...a: unknown[]) => api.submitConsents(...a),
  startCaptureRun: (...a: unknown[]) => api.startCaptureRun(...a),
  submitEventCompose: (...a: unknown[]) => api.submitEventCompose(...a),
  listParticipantResults: (...a: unknown[]) => api.listParticipantResults(...a),
  reissueResultAccess: (...a: unknown[]) => api.reissueResultAccess(...a),
  getParticipantDownload: (...a: unknown[]) => api.getParticipantDownload(...a),
}));

const mockUpload = jest.fn();
jest.mock("@/lib/event/captureUpload", () => ({
  uploadCaptureInput: (...a: unknown[]) => mockUpload(...a),
}));

let mockCameraState = "ready";
const mockCapture = jest.fn();
jest.mock("@/components/participation/useEventCamera", () => ({
  useEventCamera: () => ({
    videoRef: { current: null },
    state: mockCameraState,
    start: jest.fn(),
    stop: jest.fn(),
    capture: () => mockCapture(),
  }),
}));

function publicEvent(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    eventId: "evt-1",
    name: "민지·현우 결혼식",
    status: "LIVE",
    captureOpen: true,
    byodEnabled: true,
    boothEnabled: false,
    experienceVersion: 3,
    allowedLayouts: ["CLASSIC"],
    frames: [{ frameVersionId: 31, layoutType: "CLASSIC", sortOrder: 1, isDefault: true }],
    consentItems: [
      { code: "photo-collection", version: 2, title: "사진 수집·이용", required: true, body: "주최자가 30일 보관해요." },
      { code: "marketing", version: 1, title: "홍보 사용", required: false },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockCameraState = "ready";
  URL.createObjectURL = jest.fn(() => "blob:shot");
  URL.revokeObjectURL = jest.fn();
  Object.defineProperty(globalThis, "crypto", {
    value: { ...globalThis.crypto, randomUUID: () => "idem-1" },
    configurable: true,
  });
  api.getPublicEvent.mockResolvedValue(publicEvent());
  api.listParticipantResults.mockResolvedValue([]);
  api.startCaptureRun.mockResolvedValue({ captureRunId: "run-1", experienceVersion: 3, stateVersion: 1, expiresAt: "x" });
  mockCapture.mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
  mockUpload.mockImplementation(async ({ slotIndex }: { slotIndex: number }) => `asset-${slotIndex}`);
  api.submitEventCompose.mockResolvedValue({ jobId: 9, status: "PENDING", resultToken: "R".repeat(43), resultExpiresAt: "x" });
});

afterEach(() => jest.useRealTimers());

function storeSession() {
  window.localStorage.setItem(
    "harucut:event:participant:evt-1",
    JSON.stringify({ token: "p-token", participantId: "p-1", expiresAt: "2999-01-01T00:00:00Z" }),
  );
}

async function shootAll() {
  jest.useFakeTimers();
  for (let i = 1; i <= 4; i += 1) {
    fireEvent.click(screen.getByRole("button", { name: `${i}번째 사진 찍기` }));
    // 카운트다운은 초마다 렌더가 다음 타이머를 건다. 한 act 에 3초를 몰아 보내면 첫 1초만 지난다.
    for (let tick = 0; tick < 3; tick += 1) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1_000);
      });
    }
  }
  jest.useRealTimers();
}

it("없는 행사면 링크를 다시 확인하라고 안내한다", async () => {
  api.getPublicEvent.mockRejectedValue(new ApiRequestError({ status: 404, code: "GEN-031" }));
  render(<EventParticipation slug="nope-123" />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
});

it("참여하면 이 행사에만 자격을 보관하고, 필수 동의 전에는 넘어가지 않는다", async () => {
  api.startByodSession.mockResolvedValue({ participantToken: "p-new", participantId: "p-9", status: "RESTRICTED", expiresAt: "2999-01-01T00:00:00Z" });
  api.submitConsents.mockResolvedValue({ status: "ACTIVE" });
  render(<EventParticipation slug="wedding-1027" />);

  fireEvent.click(await screen.findByRole("button", { name: "참여하기" }));
  const submit = await screen.findByRole("button", { name: "동의하고 계속" });
  expect(JSON.parse(window.localStorage.getItem("harucut:event:participant:evt-1")!).token).toBe("p-new");
  expect(submit).toBeDisabled();
  expect(screen.getByText("주최자가 30일 보관해요.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("checkbox", { name: /사진 수집·이용/ }));
  fireEvent.click(submit);

  expect(await screen.findByRole("button", { name: "촬영 시작" })).toBeInTheDocument();
  expect(api.submitConsents).toHaveBeenCalledWith("p-new", "evt-1", [
    { code: "photo-collection", version: 2, decision: "AGREED" },
    { code: "marketing", version: 1, decision: "DECLINED" },
  ]);
});

it("저장된 자격이 유효하면 바로 이어 가고, 만료면(401) 그 행사의 자격만 버리고 처음으로 간다", async () => {
  storeSession();
  window.localStorage.setItem("harucut:event:participant:evt-other", JSON.stringify({ token: "x", participantId: "y", expiresAt: "2999-01-01T00:00:00Z" }));
  api.getParticipantSession.mockRejectedValue(new ApiRequestError({ status: 401, code: "PART-001" }));

  render(<EventParticipation slug="wedding-1027" />);

  expect(await screen.findByRole("button", { name: "참여하기" })).toBeInTheDocument();
  expect(window.localStorage.getItem("harucut:event:participant:evt-1")).toBeNull();
  expect(window.localStorage.getItem("harucut:event:participant:evt-other")).not.toBeNull();
});

it("프레임이 하나면 고르는 단계 없이 촬영으로 가고, 네 장을 올린 뒤 결과 링크(fragment)로 옮긴다", async () => {
  storeSession();
  api.getParticipantSession.mockResolvedValue({ status: "ACTIVE" });
  render(<EventParticipation slug="wedding-1027" />);

  fireEvent.click(await screen.findByRole("button", { name: "촬영 시작" }));
  expect(screen.queryByText("프레임을 골라 주세요")).not.toBeInTheDocument();
  await waitFor(() => expect(api.startCaptureRun).toHaveBeenCalledWith("p-token", "evt-1"));

  await shootAll();
  fireEvent.click(screen.getByRole("button", { name: "이 사진으로 만들기" }));

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/r#${"R".repeat(43)}`));
  expect(mockUpload.mock.calls.map((c) => c[0].slotIndex)).toEqual([0, 1, 2, 3]);
  expect(api.submitEventCompose).toHaveBeenCalledWith("p-token", "evt-1", {
    captureRunId: "run-1",
    frameVersionId: 31,
    sourceAssetIds: ["asset-0", "asset-1", "asset-2", "asset-3"],
    idempotencyKey: "idem-1",
  });
});

it("전송이 중간에 실패하면 다시 보낼 때 이미 올린 칸은 다시 올리지 않는다", async () => {
  storeSession();
  api.getParticipantSession.mockResolvedValue({ status: "ACTIVE" });
  mockUpload.mockImplementation(async ({ slotIndex }: { slotIndex: number }) => {
    if (slotIndex === 2 && mockUpload.mock.calls.filter((c) => c[0].slotIndex === 2).length === 1) {
      throw new ApiRequestError({ code: "CLIENT-004" });
    }
    return `asset-${slotIndex}`;
  });
  render(<EventParticipation slug="wedding-1027" />);
  fireEvent.click(await screen.findByRole("button", { name: "촬영 시작" }));
  await waitFor(() => expect(api.startCaptureRun).toHaveBeenCalled());
  await shootAll();

  fireEvent.click(screen.getByRole("button", { name: "이 사진으로 만들기" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이 사진으로 만들기" }));

  await waitFor(() => expect(mockPush).toHaveBeenCalled());
  expect(mockUpload.mock.calls.map((c) => c[0].slotIndex)).toEqual([0, 1, 2, 2, 3]);
});

it("회차가 끝났으면(PART-003) 새 회차를 열고 처음부터 다시 올린다", async () => {
  storeSession();
  api.getParticipantSession.mockResolvedValue({ status: "ACTIVE" });
  api.startCaptureRun
    .mockResolvedValueOnce({ captureRunId: "run-1", experienceVersion: 3, stateVersion: 1, expiresAt: "x" })
    .mockResolvedValueOnce({ captureRunId: "run-2", experienceVersion: 3, stateVersion: 1, expiresAt: "x" });
  api.submitEventCompose
    .mockRejectedValueOnce(new ApiRequestError({ status: 409, code: "PART-003" }))
    .mockResolvedValueOnce({ jobId: 9, status: "PENDING", resultToken: "R".repeat(43), resultExpiresAt: "x" });
  render(<EventParticipation slug="wedding-1027" />);
  fireEvent.click(await screen.findByRole("button", { name: "촬영 시작" }));
  await waitFor(() => expect(api.startCaptureRun).toHaveBeenCalledTimes(1));
  await shootAll();

  fireEvent.click(screen.getByRole("button", { name: "이 사진으로 만들기" }));

  await waitFor(() => expect(mockPush).toHaveBeenCalled());
  expect(mockUpload.mock.calls.map((c) => c[0].captureRunId)).toEqual([
    "run-1", "run-1", "run-1", "run-1", "run-2", "run-2", "run-2", "run-2",
  ]);
  expect(api.submitEventCompose.mock.calls[1][2].captureRunId).toBe("run-2");
});

// R5 「배포형 체험의 촬영 전용 규칙」 — 권한이 없어도 갤러리 불러오기로 대신하지 않는다.
it("카메라가 거부되면 권한 안내만 하고 파일 선택을 두지 않는다", async () => {
  storeSession();
  api.getParticipantSession.mockResolvedValue({ status: "ACTIVE" });
  mockCameraState = "denied";
  const { container } = render(<EventParticipation slug="wedding-1027" />);
  fireEvent.click(await screen.findByRole("button", { name: "촬영 시작" }));

  expect(await screen.findByText(/카메라를 쓸 수 있게 허용해 주세요/)).toBeInTheDocument();
  expect(container.querySelector('input[type="file"]')).toBeNull();
});

it("프레임이 여럿이면 서버가 준 목록만 순서대로 보여 준다", async () => {
  storeSession();
  api.getParticipantSession.mockResolvedValue({ status: "ACTIVE" });
  api.getPublicEvent.mockResolvedValue(
    publicEvent({
      allowedLayouts: ["CLASSIC", "GRID"],
      frames: [
        { frameVersionId: 41, layoutType: "GRID", sortOrder: 2, isDefault: false },
        { frameVersionId: 31, layoutType: "CLASSIC", sortOrder: 1, isDefault: true },
        { frameVersionId: 51, layoutType: "WIDE", sortOrder: 3, isDefault: false },
      ],
    }),
  );
  render(<EventParticipation slug="wedding-1027" />);
  fireEvent.click(await screen.findByRole("button", { name: "촬영 시작" }));

  expect(await screen.findByText("프레임을 골라 주세요")).toBeInTheDocument();
  const choices = screen.getAllByRole("button", { pressed: undefined }).filter((b) => b.hasAttribute("aria-pressed"));
  // 허용하지 않은 WIDE 는 서버가 실수로 보내도 그리지 않는다.
  expect(choices).toHaveLength(2);
  expect(choices[0]).toHaveAttribute("aria-pressed", "true");
});

// ADR-0008 §6-2 — 촬영 한도를 다 썼거나 이용권이 끝났으면(ENT-002) 찍기 전에 마감으로 보여 준다.
it("회차 시작이 한도로 막히면(ENT-002) 촬영 화면 대신 마감 안내를 보여 준다", async () => {
  storeSession();
  api.getParticipantSession.mockResolvedValue({ status: "ACTIVE" });
  api.startCaptureRun.mockRejectedValue(new ApiRequestError({ status: 409, code: "ENT-002" }));
  render(<EventParticipation slug="wedding-1027" />);
  fireEvent.click(await screen.findByRole("button", { name: "촬영 시작" }));

  expect(await screen.findByText("지금은 촬영이 마감됐어요. 이미 만든 사진은 그대로 받을 수 있어요.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "1번째 사진 찍기" })).not.toBeInTheDocument();
});

it("합성 접수가 한도로 막혀도(ENT-002) 다시 보내지 않고 마감 안내로 간다", async () => {
  storeSession();
  api.getParticipantSession.mockResolvedValue({ status: "ACTIVE" });
  api.submitEventCompose.mockRejectedValue(new ApiRequestError({ status: 409, code: "ENT-002" }));
  render(<EventParticipation slug="wedding-1027" />);
  fireEvent.click(await screen.findByRole("button", { name: "촬영 시작" }));
  await waitFor(() => expect(api.startCaptureRun).toHaveBeenCalled());
  await shootAll();

  fireEvent.click(screen.getByRole("button", { name: "이 사진으로 만들기" }));
  expect(await screen.findByText("지금은 촬영이 마감됐어요. 이미 만든 사진은 그대로 받을 수 있어요.")).toBeInTheDocument();
  expect(api.submitEventCompose).toHaveBeenCalledTimes(1);
});
