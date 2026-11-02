import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiRequestError } from "@/lib/clientApi";
import { BoothScreen, BOOTH_IDLE_MS, BOOTH_STATUS_POLL_MS } from "@/components/participation/BoothScreen";
import type { PublicEvent } from "@/lib/event/types";

const api = {
  redeemBoothPairing: jest.fn(),
  getBoothMe: jest.fn(),
  getBoothCurrentRun: jest.fn(),
  closeBoothRun: jest.fn(),
  startBoothGuest: jest.fn(),
  submitConsents: jest.fn(),
  getResult: jest.fn(),
};
jest.mock("@/lib/event/eventApi", () => ({
  getResult: (...a: unknown[]) => api.getResult(...a),
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
    CaptureAndSend: ({
      token,
      onDone,
      onRunOpened,
    }: {
      token: string;
      onDone: (token: string, run: unknown) => void;
      onRunOpened?: (run: unknown, token: string) => void;
    }) => (
      <>
        <button type="button" onClick={() => onRunOpened?.({ captureRunId: "run-7", stateVersion: 4 }, token)}>
          회차 열림
        </button>
        <button type="button" onClick={() => onRunOpened?.({ captureRunId: "run-old", stateVersion: 1 }, "guest-old")}>
          앞 손님 회차 열림
        </button>
        <button type="button" onClick={() => onDone("R".repeat(43), { captureRunId: "run-7", stateVersion: 4 })}>
          전송 끝
        </button>
      </>
    ),
  };
});

jest.mock("@/components/qr/QrCode", () => ({
  QrCode: ({ value, label }: { value: string; label: string }) => <div role="img" aria-label={label} data-value={value} />,
}));

const mockClearLocalUserData = jest.fn();
jest.mock("@/lib/localUserData", () => ({
  clearLocalUserData: () => mockClearLocalUserData(),
}));

const mockUnregisterPushDevice = jest.fn();
jest.mock("@/lib/pushDevices", () => ({
  unregisterPushDevice: () => mockUnregisterPushDevice(),
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
  // 대기 화면의 카메라 점검이 통과하는 환경. 카메라 자체는 CaptureAndSend 목으로 대신한다.
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: jest.fn() }, configurable: true });
  api.getBoothMe.mockResolvedValue({ deviceId: "d-1", status: "ACTIVE", event: eventInfo() });
  // 활성 회차가 없으면 서버는 data 키를 싣지 않는다.
  api.getBoothCurrentRun.mockResolvedValue(undefined);
  api.closeBoothRun.mockResolvedValue({});
  api.startBoothGuest.mockResolvedValue({ participantToken: "guest-1", participantId: "p-1", expiresAt: "x" });
  api.submitConsents.mockResolvedValue({ status: "ACTIVE" });
  api.getResult.mockResolvedValue({ status: "PENDING", eventName: "행사", thumbnailUrl: null, expiresAt: "2999-01-01T00:00:00Z" });
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
  api.getBoothCurrentRun.mockResolvedValue({ captureRunId: "run-old", stateVersion: 9, status: "ACTIVE", job: { jobId: 1, status: "DONE" } });
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
  expect(api.getResult).toHaveBeenCalledWith("R".repeat(43), expect.anything());

  // QR 은 넘기면 다시 볼 수 없다. 한 번 눌러서는 넘어가지 않는다.
  fireEvent.click(screen.getByRole("button", { name: "다음 손님" }));
  expect(screen.getByRole("img", { name: "사진 받기 QR" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /한 번 더 누르면 넘어가요/ }));
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

// P2B-4 — 부스 대기 화면은 주최자 문구(welcome)와 행사 색으로 그린다.
it("행사 테마의 대기 문구와 색으로 대기 화면을 그린다", async () => {
  pairDevice();
  api.getBoothMe.mockResolvedValue({
    deviceId: "d-1",
    status: "ACTIVE",
    event: { ...eventInfo(), theme: { colors: { accent: "#C8553D" }, copy: { welcome: "신랑 신부와 한 컷!" } } },
  });
  render(<BoothScreen />);
  expect(await screen.findByText("신랑 신부와 한 컷!")).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveStyle({ "--ev-accent": "#C8553D" });
});

describe("Codex 리뷰 반영(#523)", () => {
  // 전송 전에 손님이 떠나 유휴 종료되면, 서버 회차를 몰라서 닫지 못했다.
  it("촬영 중 유휴 종료에도 열린 서버 회차를 닫는다", async () => {
    jest.useFakeTimers();
    pairDevice();
    render(<BoothScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "촬영 시작" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /사진 수집/ }));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 계속" }));
    fireEvent.click(await screen.findByRole("button", { name: "회차 열림" }));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(BOOTH_IDLE_MS + 2_000);
    });
    expect(api.closeBoothRun).toHaveBeenCalledWith("b-token", "run-7", 4);
  });

  // 촬영 전에 켜 둔 부스는 운영자가 촬영을 열어도 새로고침 전까지 「촬영 시간이 아님」에 멈춰 있었다.
  it("대기 화면에서 행사 상태를 다시 물어 촬영이 열리면 시작 버튼을 보인다", async () => {
    jest.useFakeTimers();
    pairDevice();
    api.getBoothMe.mockResolvedValueOnce({ deviceId: "d-1", status: "ACTIVE", event: { ...eventInfo(), captureOpen: false } });
    render(<BoothScreen />);
    expect(await screen.findByText("지금은 촬영 시간이 아니에요.")).toBeInTheDocument();

    api.getBoothMe.mockResolvedValue({ deviceId: "d-1", status: "ACTIVE", event: eventInfo() });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(BOOTH_STATUS_POLL_MS);
    });
    expect(screen.getByRole("button", { name: "촬영 시작" })).toBeInTheDocument();
  });

});

describe("Codex 리뷰 반영(#541)", () => {
  // 늦게 끝난 앞 손님의 회차 열림이 지금 손님의 회차를 덮으면, 다음 손님에서 엉뚱한 회차를 닫는다.
  it("다른 손님의 회차 열림 응답은 지금 손님에게 붙이지 않는다", async () => {
    jest.useFakeTimers();
    pairDevice();
    render(<BoothScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "촬영 시작" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /사진 수집/ }));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 계속" }));
    fireEvent.click(await screen.findByRole("button", { name: "회차 열림" }));
    fireEvent.click(screen.getByRole("button", { name: "앞 손님 회차 열림" }));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(BOOTH_IDLE_MS + 2_000);
    });
    expect(api.closeBoothRun).toHaveBeenCalledWith("b-token", "run-7", 4);
    expect(api.closeBoothRun).not.toHaveBeenCalledWith("b-token", "run-old", 1);
  });

  // 대기 화면 폴링 응답이 30초 넘게 걸려 겹치면, 늦은 응답이 촬영 중인 화면을 대기로 되돌렸다.
  it("대기 화면을 떠난 뒤 도착한 상태 응답은 무시한다", async () => {
    jest.useFakeTimers();
    pairDevice();
    const closed = { deviceId: "d-1", status: "ACTIVE", event: { ...eventInfo(), captureOpen: false } };
    const open = { deviceId: "d-1", status: "ACTIVE", event: eventInfo() };
    let releaseSlow: (value: unknown) => void = () => {};
    api.getBoothMe
      .mockResolvedValueOnce(closed)
      .mockImplementationOnce(() => new Promise((resolve) => { releaseSlow = resolve; }))
      .mockResolvedValueOnce(open);
    render(<BoothScreen />);
    expect(await screen.findByText("지금은 촬영 시간이 아니에요.")).toBeInTheDocument();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(BOOTH_STATUS_POLL_MS * 2);
    });
    fireEvent.click(screen.getByRole("button", { name: "촬영 시작" }));
    expect(await screen.findByRole("button", { name: "동의하고 계속" })).toBeInTheDocument();

    await act(async () => releaseSlow(open));
    expect(screen.getByRole("button", { name: "동의하고 계속" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "촬영 시작" })).not.toBeInTheDocument();
  });
});

// R5 O27·O28: 앞 손님의 회차가 닫히지 못하고 남아도 다음 손님이 막히지 않는다.
it("남은 회차 때문에 손님을 못 받으면(BOOTH-004) 그 회차를 닫고 다시 시작한다", async () => {
  pairDevice();
  render(<BoothScreen />);
  const start = await screen.findByRole("button", { name: "촬영 시작" });
  api.startBoothGuest.mockRejectedValueOnce(new ApiRequestError({ status: 409, code: "BOOTH-004" }));
  api.getBoothCurrentRun.mockResolvedValueOnce({ captureRunId: "run-left", stateVersion: 7 });

  fireEvent.click(start);

  expect(await screen.findByRole("checkbox", { name: /사진 수집/ })).toBeInTheDocument();
  expect(api.closeBoothRun).toHaveBeenCalledWith("b-token", "run-left", 7);
  expect(api.startBoothGuest).toHaveBeenCalledTimes(2);
});

// R5 301줄: 다시 게시한 내용은 다음 손님부터 적용된다.
it("손님을 받기 전에 행사를 다시 읽어 새 동의 문구로 묻는다", async () => {
  pairDevice();
  render(<BoothScreen />);
  const start = await screen.findByRole("button", { name: "촬영 시작" });
  api.getBoothMe.mockResolvedValueOnce({
    deviceId: "d-1",
    status: "ACTIVE",
    event: { ...eventInfo(), consentItems: [{ code: "photo", version: 2, title: "새 사진 안내", required: true }] },
  });

  fireEvent.click(start);

  expect(await screen.findByRole("checkbox", { name: /새 사진 안내/ })).toBeInTheDocument();
});

it("카메라를 쓸 수 없는 기기면 손님을 받기 전에 알리고 시작을 막는다", async () => {
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
  pairDevice();
  render(<BoothScreen />);

  expect(await screen.findByRole("alert")).toHaveTextContent("카메라를 쓸 수 없어요");
  expect(screen.getByRole("button", { name: "촬영 시작" })).toBeDisabled();
});

it("연결 코드가 든 주소를 받으면 코드를 채우고 주소에서 지운다. 열린 탭에서 해시만 바뀌어도 받는다", async () => {
  render(<BoothScreen />);
  const input = screen.getByPlaceholderText("XXXX-XXXX");
  expect(input).toHaveValue("");

  await act(async () => {
    window.history.replaceState({}, "", "/booth#pair=K7QM-3XRP");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });

  expect(screen.getByPlaceholderText("XXXX-XXXX")).toHaveValue("K7QM-3XRP");
  expect(window.location.hash).toBe("");
});

describe("연결 화면의 개인 계정 로그아웃", () => {
  const originalFetch = global.fetch;
  /** 세션 확인은 통과, 로그아웃은 주어진 상태로 답한다. */
  function serve(logoutStatus: number) {
    const fetchMock = jest.fn(async (url: string) => {
      const status = url === "/api/auth/status" ? 200 : logoutStatus;
      return { ok: status >= 200 && status < 300, status };
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  beforeEach(() => {
    mockClearLocalUserData.mockResolvedValue(undefined);
    mockUnregisterPushDevice.mockResolvedValue(undefined);
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  // 촬영 보관물에는 계정 구분이 없다. 남기면 다음 계정이 /shoot/select 에서 앞사람 사진을 이어받는다.
  it("로그아웃하면 이 기기의 개인 사진까지 지운 뒤에 끝났다고 말한다", async () => {
    const fetchMock = serve(200);
    let finishClear = () => {};
    mockClearLocalUserData.mockReturnValue(new Promise<void>((resolve) => { finishClear = resolve; }));
    render(<BoothScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }));
    await waitFor(() => expect(mockClearLocalUserData).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("로그아웃했어요.")).not.toBeInTheDocument();

    await act(async () => finishClear());
    expect(screen.getByRole("status")).toHaveTextContent("로그아웃했어요.");
    expect(screen.queryByRole("button", { name: "로그아웃" })).not.toBeInTheDocument();
    // 푸시 해제는 쿠키가 있을 때, 곧 로그아웃보다 먼저 해야 한다.
    const logoutCall = fetchMock.mock.calls.findIndex(([url]) => url === "/api/client/logout");
    expect(mockUnregisterPushDevice.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[logoutCall]);
  });

  it("로그아웃이 실패하면 사진을 지우지 않고 다시 누르게 둔다", async () => {
    serve(502);
    render(<BoothScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("로그아웃하지 못했어요");
    expect(mockClearLocalUserData).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeEnabled();
  });

  it("이미 끊긴 세션(401)이어도 개인 사진은 지운다", async () => {
    serve(401);
    render(<BoothScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }));

    expect(await screen.findByRole("status")).toHaveTextContent("로그아웃했어요.");
    expect(mockClearLocalUserData).toHaveBeenCalledTimes(1);
  });
});

it("이미 연결된 기기가 새 코드를 받으면 말없이 옮기지 않고 묻는다", async () => {
  pairDevice();
  render(<BoothScreen />);
  await screen.findByRole("button", { name: "촬영 시작" });

  await act(async () => {
    window.history.replaceState({}, "", "/booth#pair=K7QM-3XRP");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });

  expect(screen.getByText(/새 연결 코드를 받았어요/)).toBeInTheDocument();
  expect(api.redeemBoothPairing).not.toHaveBeenCalled();
});
