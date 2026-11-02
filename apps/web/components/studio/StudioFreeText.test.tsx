import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { StudioFreeText, freeTextViolations } from "@/components/studio/StudioFreeText";
import type { FreeTextSettings } from "@/lib/event/freeText";

const mockStyles = jest.fn();
jest.mock("@/lib/event/eventApi", () => ({ getTextStyles: (...a: unknown[]) => mockStyles(...a) }));

let latest: FreeTextSettings = { enabled: false };
const STYLES = [{ id: "s1", label: "굵게", weight: 700, color: "#111111" }];

function Harness({ initial }: { initial: FreeTextSettings }) {
  const [value, setValue] = useState(initial);
  return (
    <StudioFreeText
      value={value}
      onChange={(next) => {
        latest = next;
        setValue(next);
      }}
      canvasAspect={0.5}
    />
  );
}

const ENABLED: FreeTextSettings = {
  enabled: true,
  box: { x: 0.1, y: 0.8, width: 0.5, height: 0.1 },
  styleIds: ["s1"],
  maxLength: 20,
  maxLines: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  latest = ENABLED;
  mockStyles.mockResolvedValue(STYLES);
});

/** jsdom 에는 PointerEvent 가 없어 좌표가 빠진다. 같은 이름의 마우스 이벤트에 pointerId 를 붙여 보낸다. */
function pointer(target: Element, type: string, init: { clientX?: number; clientY?: number } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, "pointerId", { value: 1 });
  fireEvent(target, event);
}

function surfaceRect() {
  const box = screen.getByRole("group", { name: /문구 칸/ });
  // jsdom 은 배치를 계산하지 않는다. 프레임 표면을 200×400 으로 둔다.
  (box.parentElement as HTMLElement).getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return box;
}

it("칸을 끌면 잡은 지점을 유지한 채 이동량만큼 움직이고, 프레임 밖으로 나가지 않는다", async () => {
  render(<Harness initial={ENABLED} />);
  await screen.findByLabelText("굵게");
  const box = surfaceRect();

  pointer(box, "pointerdown", { clientX: 50, clientY: 340 });
  // 잡기만 하면 움직이지 않는다 — 칸의 가운데로 튀지 않는다.
  expect(latest.enabled && latest.box.x).toBe(0.1);

  pointer(box, "pointermove", { clientX: 70, clientY: 300 });
  expect(latest.enabled && latest.box).toEqual({ x: 0.2, y: 0.7, width: 0.5, height: 0.1 });

  pointer(box, "pointermove", { clientX: 900, clientY: 9000 });
  expect(latest.enabled && latest.box).toEqual({ x: 0.5, y: 0.9, width: 0.5, height: 0.1 });

  pointer(box, "pointerup");
  pointer(box, "pointermove", { clientX: 0, clientY: 0 });
  expect(latest.enabled && latest.box.x).toBe(0.5);
});

it("화살표로 옮기고 Shift+화살표로 크기를 바꾼다", async () => {
  render(<Harness initial={ENABLED} />);
  await screen.findByLabelText("굵게");
  const box = screen.getByRole("group", { name: /문구 칸/ });
  fireEvent.keyDown(box, { key: "ArrowRight" });
  expect(latest.enabled && latest.box.x).toBe(0.11);
  fireEvent.keyDown(box, { key: "ArrowDown", shiftKey: true });
  expect(latest.enabled && latest.box.height).toBe(0.11);
});

it("숫자 칸은 고치는 동안 비울 수 있고, 떠나면 실제 값으로 돌아온다", async () => {
  render(<Harness initial={ENABLED} />);
  await screen.findByLabelText("굵게");
  const width = screen.getByLabelText("너비(%)");
  fireEvent.change(width, { target: { value: "" } });
  expect(width).toHaveValue(null);
  expect(latest.enabled && latest.box.width).toBe(0.5);
  fireEvent.blur(width);
  expect(width).toHaveValue(50);
});

it("글꼴 목록을 못 받으면 다시 시도할 수 있다", async () => {
  mockStyles.mockRejectedValueOnce(new Error("down"));
  render(<Harness initial={ENABLED} />);
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
  expect(await screen.findByLabelText("굵게")).toBeInTheDocument();
});

it("프레임 밖으로 나가는 칸은 위반으로 알린다", () => {
  expect(freeTextViolations({ ...ENABLED, box: { x: 0.8, y: 0.8, width: 0.5, height: 0.1 } } as FreeTextSettings)).toContain(
    "문구 칸이 프레임 밖으로 나가요.",
  );
});
