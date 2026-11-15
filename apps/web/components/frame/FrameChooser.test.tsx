/**
 * 프레임 고르기의 확인 버튼이 무엇을 싣고 가는지 본다.
 *
 * 저장한 프레임은 목록에서 눌러서만 고른다(2026-11-14). 예전의 `?remoteFrameId=` 주소 지정은 만드는 곳이
 * 없는 길이라 걷어냈다 — 그 주소가 와도 고른 것으로 치지 않는다. 목록이 다시 도는 중에도 손에 든 선택은
 * 막지 않고, 목록에서 빠진 번호는 싣지 않는다(저장 단계에서 404 로 촬영본이 날아갔다).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { FrameChooser } from "@/components/frame/FrameChooser";
import type { RemoteFrame } from "@/lib/api-types";

let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/components/frame/FramePreview", () => ({
  FramePreview: () => <div data-testid="frame-preview" />,
}));

const CONFIRM_LABEL = "이 프레임으로 찍기";

function frame(over: Partial<RemoteFrame> = {}): RemoteFrame {
  return {
    frameId: 7,
    title: "행사 프레임",
    frameType: "CLASSIC",
    components: [],
    ...over,
  };
}

type ChooserProps = Partial<Parameters<typeof FrameChooser>[0]>;

function renderChooser(over: ChooserProps = {}) {
  const onConfirm = jest.fn();
  const element = (extra: ChooserProps = {}) => (
    <FrameChooser
      frames={[]}
      isLoading={false}
      error={null}
      onRefresh={jest.fn()}
      confirmLabel={CONFIRM_LABEL}
      onConfirm={onConfirm}
      {...over}
      {...extra}
    />
  );
  const view = render(element());
  const confirm = () => screen.getByRole("button", { name: CONFIRM_LABEL });
  // 목록 새로고침처럼 **선택은 그대로 두고** 바깥 상태만 바뀌는 경우를 만든다.
  return {
    onConfirm,
    confirm,
    rerender: (extra: ChooserProps) => view.rerender(element(extra)),
  };
}

describe("FrameChooser 확인 버튼", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
  });

  it("목록이 오는 중이어도 기본 구성으로 진행할 수 있다", () => {
    const { onConfirm, confirm } = renderChooser({ isLoading: true, frames: [] });

    expect(confirm()).toBeEnabled();
    fireEvent.click(confirm());
    expect(onConfirm).toHaveBeenCalledWith({ frameId: "classic-4", remoteFrameId: null });
  });

  it("주소에 저장 프레임 번호가 와도 고른 것으로 치지 않는다", () => {
    mockSearchParams = new URLSearchParams("remoteFrameId=7");
    const { onConfirm, confirm } = renderChooser({ frames: [frame({ frameId: 7 })] });

    expect(screen.getByRole("button", { name: /행사 프레임/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText(/링크에 담긴/)).not.toBeInTheDocument();
    fireEvent.click(confirm());
    expect(onConfirm).toHaveBeenCalledWith({ frameId: "classic-4", remoteFrameId: null });
  });

  it("목록에서 고른 프레임은 목록이 다시 도는 중이어도 그 번호를 싣고 간다", () => {
    const { onConfirm, confirm, rerender } = renderChooser({
      frames: [frame({ frameId: 9, title: "내가 만든 프레임" })],
    });

    fireEvent.click(screen.getByRole("button", { name: /내가 만든 프레임/ }));
    // 새로고침이 도는 중(목록 자체는 그대로 남는다).
    rerender({ isLoading: true });

    expect(confirm()).toBeEnabled();
    fireEvent.click(confirm());
    expect(onConfirm).toHaveBeenCalledWith({ frameId: "classic-4", remoteFrameId: 9 });
  });

  it("고른 프레임이 새로고침에서 빠지면 번호를 싣지 않는다", () => {
    const { onConfirm, confirm, rerender } = renderChooser({
      frames: [frame({ frameId: 9, title: "내가 만든 프레임" })],
    });

    fireEvent.click(screen.getByRole("button", { name: /내가 만든 프레임/ }));
    // 다른 기기에서 지워 목록에서 빠졌다.
    rerender({ frames: [] });

    fireEvent.click(confirm());
    expect(onConfirm).toHaveBeenCalledWith({ frameId: "classic-4", remoteFrameId: null });
  });

  // 화면이 스스로 막아 둔 것(예: /theme 의 "불러오는 중…")은 그대로 살아 있어야 한다.
  it("바깥이 넘긴 비활성은 그대로 둔다", () => {
    const { confirm } = renderChooser({ confirmDisabled: true });

    expect(confirm()).toBeDisabled();
  });
});

// 저장한 프레임의 촬영 전 확인(2026-11-15, app/shoot). 까닭은 확인 단추 바로 위 한 줄, 확인하는 동안은 단추가 잠긴다.
describe("FrameChooser 촬영 전 확인 표시", () => {
  it("쓸 수 없는 까닭을 단추 위에 말하고, 확인하는 동안은 「확인 중…」으로 잠근다", () => {
    const { rerender } = renderChooser({ confirmNotice: "고른 프레임을 찾을 수 없어요. 다른 프레임을 골라 주세요." });
    expect(screen.getByRole("alert")).toHaveTextContent("고른 프레임을 찾을 수 없어요.");

    rerender({ confirmNotice: null, confirmBusy: true });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "확인 중…" })).toBeDisabled();
  });

  it("다른 프레임을 고르면 바깥에 알린다 — 앞서 고른 프레임의 안내를 거두게", () => {
    const onSelectionChange = jest.fn();
    renderChooser({ frames: [frame()], onSelectionChange });
    fireEvent.click(screen.getByRole("button", { name: /행사 프레임/ }));
    expect(onSelectionChange).toHaveBeenCalled();
  });
});
