import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiRequestError } from "@/lib/clientApi";
import { BoothScreen, BOOTH_IDLE_MS } from "@/components/participation/BoothScreen";
import type { PublicEvent } from "@/lib/event/types";

const api = {
  redeemBoothPairing: jest.fn(),
  getBoothMe: jest.fn(),
  getBoothCurrentRun: jest.fn(),
  closeBoothRun: jest.fn(),
  startBoothGuest: jest.fn(),
  submitConsents: jest.fn(),
};
jest.mock("@/lib/event/eventApi", () => ({
  redeemBoothPairing: (...a: unknown[]) => api.redeemBoothPairing(...a),
  getBoothMe: (...a: unknown[]) => api.getBoothMe(...a),
  getBoothCurrentRun: (...a: unknown[]) => api.getBoothCurrentRun(...a),
  closeBoothRun: (...a: unknown[]) => api.closeBoothRun(...a),
  startBoothGuest: (...a: unknown[]) => api.startBoothGuest(...a),
  submitConsents: (...a: unknown[]) => api.submitConsents(...a),
}));

// 촬영·전송은 개인 휴대폰 참가와 같은 컴포넌트다(그쪽 테스트가 본다). 여기서는 끝났다는 신호만 낸다.
jest.mock("@/components/participation/EventParticipation", () => {
  const actual = jest.requireActual("@/components/participation/EventParticipation");
  return {
    ...actual,
    CaptureAndSend: ({ onDone }: { onDone: (token: string, run: unknown) => void }) => (
      <button type="button" onClick={() => onDone("R".repeat(43), { captureRunId: "run-7", stateVersion: 4 })}>
        전송 끝
      </button>
    ),
  };
});

jest.mock("@/components/qr/QrCode", () => ({
  QrCode: ({ value, label }: { value: string; label: string }) => <div role="img" aria-label={label} data-value={value} />,
}));

function eventInfo(): PublicEvent {
  return {
    eventId: "evt-1",
    name: "졸업식 부스",
    status: "LIVE",
    captureOpen: true,
    byodEnabled: false,
    boothEnabled: true,
    experienceVersion: 1,
    allowedLayouts: ["CLASSIC"],
    frames: [{ frameVersionId: 31, layoutType: "CLASSIC", sortOrder: 1, isDefault: true }],
    consentItems: [{ code: "photo", version: 1, title: "사진 수집", required: true }],
  };
}

function pairDevice() {
  window.localStorage.setItem("harucut:event:booth-device", JSON.stringify({ token: "b-token", deviceId: "d-1", eventId: "evt-1" }));
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  api.getBoothMe.mockResolvedValue({ deviceId: "d-1", status: "ACTIVE", event: eventInfo() });
  api.getBoothCurrentRun.mockResolvedValue({ captureRunId: null, stateVersion: 0, status: "IDLE", job: null, resultToken: null });
  api.closeBoothRun.mockResolvedValue({});
  api.startBoothGuest.mockResolvedValue({ participantToken: "guest-1", participantId: "p-1", expiresAt: "x" });
  api.submitConsents.mockResolvedValue({ status: "ACTIVE" });
});

afterEach(() => jest.useRealTimers());

it("기기 자격이 없으면 연결 코드를 받아 기기 자격만 보관한다", async () => {
  api.redeemBoothPairing.mockResolvedValue({ boothToken: "b-new", deviceId: "d-2", eventId: "evt-1" });
  render(<BoothScreen />);

  fireEvent.change(screen.getByPlaceholderText("XXXX-XXXX"), { target: { value: "k7qm-3xrp" } });
  fireEvent.click(screen.getByRole("button", { name: "연결" }));

  await waitFor(() => expect(api.redeemBoothPairing).toHaveBeenCalledWith("K7QM-3XRP"));
  expect(await screen.findByRole("button", { name: "촬영 시작" })).toBeInTheDocument();
  expect(JSON.parse(window.localStorage.getItem("harucut:event:booth-device")!).token).toBe("b-new");
});

// R5 4절 — 재시작·새로고침 뒤 이전 손님의 회차를 이어 가거나 사진을 보여 주지 않는다.
it("켜질 때 남아 있는 회차가 있으면 닫기만 하고 대기 화면으로 간다", async () => {
  pairDevice();
  api.getBoothCurrentRun.mockResolvedValue({ captureRunId: "run-old", stateVersion: 9, status: "ACTIVE", job: { jobId: 1, status: "DONE" }, resultToken: "old" });
  render(<BoothScreen />);

  expect(await screen.findByRole("button", { name: "촬영 시작" })).toBeInTheDocument();
  expect(api.closeBoothRun).toHaveBeenCalledWith("b-token", "run-old", 9);
  expect(screen.queryByRole("img", { name: "사진 받기 QR" })).not.toBeInTheDocument();
});

it("손님마다 새 세션을 열고, 결과 QR 은 그 손님의 토큰으로만 그리고, 다음 손님에서 회차를 닫고 비운다", async () => {
  pairDevice();
  render(<BoothScreen />);

  fireEvent.click(await screen.findByRole("button", { name: "촬영 시작" }));
  fireEvent.click(await screen.findByRole("checkbox", { name: /사진 수집/ }));
  fireEvent.click(screen.getByRole("button", { name: "동의하고 계속" }));
  fireEvent.click(await screen.findByRole("button", { name: "전송 끝" }));

  const qr = await screen.findByRole("img", { name: "사진 받기 QR" });
  expect(qr.getAttribute("data-value")).toBe(`${window.location.origin}/r#${"R".repeat(43)}`);
  expect(api.submitConsents).toHaveBeenCalledWith("guest-1", "evt-1", [{ code: "photo", version: 1, decision: "AGREED" }]);

  fireEvent.click(screen.getByRole("button", { name: "다음 손님" }));
  expect(await screen.findByRole("button", { name: "촬영 시작" })).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "사진 받기 QR" })).not.toBeInTheDocument();
  await waitFor(() => expect(api.closeBoothRun).toHaveBeenCalledWith("b-token", "run-7", 4));
  // 손님 자격은 저장하지 않는다.
  expect(Object.keys(window.localStorage).filter((k) => k.startsWith("harucut:event:participant:"))).toHaveLength(0);
});

it("손을 떼고 시간이 지나면 안내 뒤 처음 화면으로 돌아간다", async () => {
  // 유휴 판정은 Date.now 와 interval 이다. 렌더 전부터 가짜 시계를 써야 둘 다 바뀐다.
  jest.useFakeTimers();
  pairDevice();
  render(<BoothScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "촬영 시작" }));
  await screen.findByRole("button", { name: "동의하고 계속" });

  await act(async () => {
    await jest.advanceTimersByTimeAsync(BOOTH_IDLE_MS - 10_000);
  });
  expect(screen.getByText(/곧 처음 화면으로 돌아가요/)).toBeInTheDocument();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(11_000);
  });
  expect(screen.getByRole("button", { name: "촬영 시작" })).toBeInTheDocument();
});

it("회수된 기기(BOOTH-003)는 자격을 버리고 연결 화면으로 간다", async () => {
  pairDevice();
  api.getBoothMe.mockRejectedValue(new ApiRequestError({ status: 403, code: "BOOTH-003" }));
  render(<BoothScreen />);
  expect(await screen.findByRole("button", { name: "연결" })).toBeInTheDocument();
  expect(window.localStorage.getItem("harucut:event:booth-device")).toBeNull();
});
