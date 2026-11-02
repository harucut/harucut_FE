import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FrameVersionManager } from "@/components/studio/FrameVersionManager";

const LIVE_VERSION = { frameVersionId: 41, versionNo: 2, createdAt: "2026-10-26T10:00:00" };
const REVOKED_VERSION = {
  frameVersionId: 40,
  versionNo: 1,
  createdAt: "2026-10-20T10:00:00",
  revokedAt: "2026-11-01T10:00:00",
  revokedReason: "저작권 문의",
};

const load = jest.fn();
const revoke = jest.fn();
const restore = jest.fn();
const onChanged = jest.fn();

/** 여닫으면 jsdom 도 브라우저처럼 toggle 을 쏜다. */
function setOpen(container: HTMLElement, open: boolean) {
  (container.querySelector("details") as HTMLDetailsElement).open = open;
}
const open = (container: HTMLElement) => setOpen(container, true);
const close = (container: HTMLElement) => setOpen(container, false);
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

function setup(wrap?: (ui: React.ReactNode) => React.ReactNode) {
  const ui = <FrameVersionManager load={load} revoke={revoke} restore={restore} onChanged={onChanged} />;
  return render(<>{wrap ? wrap(ui) : ui}</>);
}

beforeEach(() => {
  jest.clearAllMocks();
  load.mockResolvedValue([LIVE_VERSION, REVOKED_VERSION]);
  revoke.mockResolvedValue(undefined);
  restore.mockResolvedValue(undefined);
});

it("평소에는 접어 두고, 펼 때마다 다시 받는다", async () => {
  const { container } = setup();
  expect(load).not.toHaveBeenCalled();
  open(container);
  expect(await screen.findByText("2번째 발행본")).toBeInTheDocument();
  expect(screen.getByText("1번째 발행본 · 회수됨")).toBeInTheDocument();
  expect(screen.getByText(/저작권 문의/)).toBeInTheDocument();
  // 접혀 있는 동안 발행한 것을 놓치지 않는다.
  load.mockResolvedValue([{ ...LIVE_VERSION, frameVersionId: 42, versionNo: 3 }, LIVE_VERSION]);
  close(container);
  await settle();
  expect(load).toHaveBeenCalledTimes(1);
  open(container);
  expect(await screen.findByText("3번째 발행본")).toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(2);
});

it("회수는 이유를 받아 보내고, 목록을 다시 받아 알린다", async () => {
  const { container } = setup();
  open(container);
  fireEvent.click(await screen.findByRole("button", { name: "회수" }));

  const dialog = await screen.findByRole("dialog", { name: "2번째 발행본을 회수할까요?" });
  const submit = within(dialog).getByRole("button", { name: "회수" });
  expect(submit).toBeDisabled();

  load.mockResolvedValue([{ ...LIVE_VERSION, revokedAt: "2026-11-02T10:00:00", revokedReason: "오류" }, REVOKED_VERSION]);
  fireEvent.change(within(dialog).getByLabelText("회수 이유"), { target: { value: "오류" } });
  fireEvent.click(submit);

  await waitFor(() => expect(revoke).toHaveBeenCalledWith(LIVE_VERSION, "오류"));
  expect(await screen.findByText("2번째 발행본 · 회수됨")).toBeInTheDocument();
  expect(onChanged).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("회수가 실패하면 대화상자에 남아 이유를 말한다", async () => {
  revoke.mockRejectedValue(new Error("down"));
  const { container } = setup();
  open(container);
  fireEvent.click(await screen.findByRole("button", { name: "회수" }));
  const dialog = await screen.findByRole("dialog", { name: "2번째 발행본을 회수할까요?" });
  fireEvent.change(within(dialog).getByLabelText("회수 이유"), { target: { value: "오류" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "회수" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("회수하지 못했어요");
  expect(onChanged).not.toHaveBeenCalled();
});

it("회수한 발행본을 되돌린다", async () => {
  const { container } = setup();
  open(container);
  fireEvent.click(await screen.findByRole("button", { name: "되돌리기" }));
  await waitFor(() => expect(restore).toHaveBeenCalledWith(REVOKED_VERSION));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  expect(load).toHaveBeenCalledTimes(2);
});

it("목록을 받지 못하면 알리고, 다시 열면 또 받는다", async () => {
  load.mockRejectedValueOnce(new Error("down"));
  const { container } = setup();
  open(container);
  expect(await screen.findByRole("alert")).toHaveTextContent("발행본을 불러오지 못했어요");
  close(container);
  await settle();
  open(container);
  expect(await screen.findByText("2번째 발행본")).toBeInTheDocument();
});

it("발행본이 없으면 없다고 말한다", async () => {
  load.mockResolvedValue([]);
  const { container } = setup();
  open(container);
  expect(await screen.findByText("아직 발행본이 없어요.")).toBeInTheDocument();
});

// 행사 설정 폼 안에서도 열린다. 회수가 설정 저장까지 부르면 안 되고, 폼이 겹쳐도 안 된다.
it("바깥 폼을 건드리지 않는다", async () => {
  const onOuterSubmit = jest.fn((event: React.FormEvent) => event.preventDefault());
  const { container } = setup((ui) => <form onSubmit={onOuterSubmit}>{ui}</form>);
  open(container);
  fireEvent.click(await screen.findByRole("button", { name: "회수" }));
  const dialog = await screen.findByRole("dialog", { name: "2번째 발행본을 회수할까요?" });
  expect(dialog.closest("form")).toBeNull();
  expect(container.contains(dialog)).toBe(false);

  fireEvent.change(within(dialog).getByLabelText("회수 이유"), { target: { value: "오류" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "회수" }));
  await waitFor(() => expect(revoke).toHaveBeenCalled());
  expect(onOuterSubmit).not.toHaveBeenCalled();
});

// 펴 둔 채 새 버전을 발행하면 방금 만든 발행본을 바로 회수할 수 있어야 한다(Codex #580).
it("펴 둔 채 새 발행본이 나오면 목록을 다시 받는다", async () => {
  load.mockResolvedValue([]);
  const props = { load, revoke, restore };
  const { container, rerender } = render(<FrameVersionManager {...props} revision={undefined} />);
  open(container);
  expect(await screen.findByText("아직 발행본이 없어요.")).toBeInTheDocument();

  load.mockResolvedValue([LIVE_VERSION]);
  rerender(<FrameVersionManager {...props} revision={2} />);
  expect(await screen.findByText("2번째 발행본")).toBeInTheDocument();
  expect(screen.queryByText("아직 발행본이 없어요.")).not.toBeInTheDocument();
});

it("접혀 있으면 새 발행본이 나와도 부르지 않는다", async () => {
  const props = { load, revoke, restore };
  const { rerender } = render(<FrameVersionManager {...props} revision={1} />);
  rerender(<FrameVersionManager {...props} revision={2} />);
  await settle();
  expect(load).not.toHaveBeenCalled();
});

it("먼저 보낸 요청이 나중에 끝나도 새 목록을 덮지 않는다", async () => {
  let finishFirst: (versions: unknown[]) => void = () => {};
  load.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)));
  load.mockResolvedValue([LIVE_VERSION]);
  const props = { load, revoke, restore };
  const { container, rerender } = render(<FrameVersionManager {...props} revision={1} />);
  open(container);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

  rerender(<FrameVersionManager {...props} revision={2} />);
  expect(await screen.findByText("2번째 발행본")).toBeInTheDocument();

  await act(async () => finishFirst([]));
  expect(screen.getByText("2번째 발행본")).toBeInTheDocument();
  expect(screen.queryByText("아직 발행본이 없어요.")).not.toBeInTheDocument();
});
