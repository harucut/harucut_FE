import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiRequestError } from "@/lib/clientApi";
import { StudioBoothDevices } from "@/components/studio/StudioBoothDevices";

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockReissue = jest.fn();
const mockRevoke = jest.fn();

jest.mock("@/lib/studio/studioApi", () => ({
  ...jest.requireActual("@/lib/studio/studioApi"),
  listBoothDevices: (...args: unknown[]) => mockList(...args),
  createBoothDevice: (...args: unknown[]) => mockCreate(...args),
  reissuePairingCode: (...args: unknown[]) => mockReissue(...args),
  revokeBoothDevice: (...args: unknown[]) => mockRevoke(...args),
}));

const NOW = Date.parse("2026-10-26T10:00:00Z");
const in10min = new Date(NOW + 10 * 60_000).toISOString();

function renderDevices() {
  render(<StudioBoothDevices eventId="Ev1" boothUrl="https://harucut.test/booth" />);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  mockList.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

it("기기를 추가하면 받은 연결 코드와 남은 시간을 보여 준다", async () => {
  mockCreate.mockResolvedValue({ deviceId: "d1", name: "입구 부스", status: "PENDING_PAIRING", pairingCode: "K7QM-3XPA", pairingExpiresAt: in10min });
  renderDevices();

  const input = await screen.findByLabelText("기기 이름");
  expect(screen.getByRole("button", { name: "기기 추가" })).toBeDisabled();
  fireEvent.change(input, { target: { value: "입구 부스" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "기기 추가" }));
  });

  expect(mockCreate).toHaveBeenCalledWith("Ev1", "입구 부스");
  expect(screen.getByText("K7QM-3XPA")).toBeInTheDocument();
  expect(screen.getByText("10분 00초 남음")).toBeInTheDocument();
  await act(async () => {
    jest.advanceTimersByTime(61_000);
  });
  expect(screen.getByText("8분 59초 남음")).toBeInTheDocument();
});

// 새 코드가 쓰이는 순간 지금 기기가 끊긴다 — 연결된 기기에서는 한 번 묻는다.
it("연결된 기기를 바꿀 때는 확인을 받고 새 코드를 받는다", async () => {
  mockList.mockResolvedValue([{ deviceId: "d1", name: "입구 부스", status: "ACTIVE" }]);
  mockReissue.mockResolvedValue({ deviceId: "d1", name: "입구 부스", status: "ACTIVE", pairingCode: "ABCD-EFGH", pairingExpiresAt: in10min });
  renderDevices();

  fireEvent.click(await screen.findByRole("button", { name: "다른 기기로 바꾸기" }));
  expect(mockReissue).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "새 코드 받기" }));
  });
  expect(mockReissue).toHaveBeenCalledWith("d1");
  expect(screen.getByText("ABCD-EFGH")).toBeInTheDocument();
});

it("해제는 확인 뒤에 하고, 해제된 기기에는 버튼을 두지 않는다", async () => {
  mockList.mockResolvedValue([{ deviceId: "d1", name: "입구 부스", status: "ACTIVE" }]);
  mockRevoke.mockResolvedValue({ deviceId: "d1", name: "입구 부스", status: "REVOKED" });
  renderDevices();

  fireEvent.click(await screen.findByRole("button", { name: "해제" }));
  await act(async () => {
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "해제" }));
  });
  expect(mockRevoke).toHaveBeenCalledWith("d1");
  await waitFor(() => expect(screen.getByText("해제됨")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "해제" })).not.toBeInTheDocument();
});

// 회수된 기기는 세지 않는다(백엔드 설정 기본 20대).
it("해제 안 된 기기가 20대면 추가를 막고 해제하면 자리가 난다고 알린다", async () => {
  mockList.mockResolvedValue([
    ...Array.from({ length: 20 }, (_, i) => ({ deviceId: `d${i}`, name: `부스 ${i}`, status: "ACTIVE" })),
    { deviceId: "old", name: "옛 부스", status: "REVOKED" },
  ]);
  renderDevices();
  expect(await screen.findByText(/20대까지 연결할 수 있어요/)).toBeInTheDocument();
  expect(screen.queryByLabelText("기기 이름")).not.toBeInTheDocument();
});

it("서버가 상한(BOOTH-006)으로 막으면 그 문구를 보여 준다", async () => {
  mockCreate.mockRejectedValue(new ApiRequestError({ status: 403, code: "BOOTH-006", apiMessage: "x" }));
  renderDevices();
  fireEvent.change(await screen.findByLabelText("기기 이름"), { target: { value: "입구" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "기기 추가" }));
  });
  expect(screen.getByRole("alert")).toHaveTextContent("부스 기기 수를 다 썼어요");
});
