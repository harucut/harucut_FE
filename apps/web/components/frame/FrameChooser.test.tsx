/**
 * 링크로 지정한 프레임을 **찾기도 전에** 진행하지 않는지 본다.
 *
 * `?remoteFrameId=` 딥링크로 들어온 회원은 목록이 도착하기 전에도 확인 버튼을 누를 수
 * 있었다. 그 순간 선택된 원격 프레임은 아직 null 이라 번호가 조용히 버려지고, 사용자는
 * 링크가 가리킨 프레임 대신 기본 레이아웃으로 촬영을 시작했다. 되돌리는 자리는 촬영이
 * 다 끝난 뒤라 가장 비싸다.
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

const CONFIRM_LABEL = "촬영 시작하기";
const LOADING_NOTICE = "링크에 담긴 프레임을 불러오는 중이에요.";

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

describe("FrameChooser 원격 프레임 조회 중 진행", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
  });

  it("주소에 번호가 있고 목록이 오는 중이면 진행을 막는다", () => {
    mockSearchParams = new URLSearchParams("remoteFrameId=7");
    const { onConfirm, confirm } = renderChooser({ isLoading: true, frames: [] });

    expect(confirm()).toBeDisabled();
    fireEvent.click(confirm());
    // 번호를 버린 채 기본 레이아웃으로 출발하지 않는다.
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(LOADING_NOTICE)).toBeInTheDocument();
  });

  it("목록이 도착하면 그 번호를 실어 진행한다", () => {
    mockSearchParams = new URLSearchParams("remoteFrameId=7");
    const { onConfirm, confirm } = renderChooser({
      isLoading: false,
      frames: [frame({ frameId: 7 })],
    });

    expect(confirm()).toBeEnabled();
    expect(screen.queryByText(LOADING_NOTICE)).not.toBeInTheDocument();
    fireEvent.click(confirm());
    expect(onConfirm).toHaveBeenCalledWith({
      frameId: "classic-4",
      remoteFrameId: 7,
    });
  });

  // 막는 것은 "기다리면 답이 나오는" 경우뿐이다. 번호가 없으면 기다릴 것도 없다.
  it("주소에 번호가 없으면 목록이 오는 중이어도 진행을 막지 않는다", () => {
    const { onConfirm, confirm } = renderChooser({ isLoading: true, frames: [] });

    expect(confirm()).toBeEnabled();
    expect(screen.queryByText(LOADING_NOTICE)).not.toBeInTheDocument();
    fireEvent.click(confirm());
    expect(onConfirm).toHaveBeenCalledWith({
      frameId: "classic-4",
      remoteFrameId: null,
    });
  });

  // 조회가 끝났는데 없는 번호였다면 그때는 안내로 넘어간다 — 계속 막고 있지 않는다.
  it("조회가 끝나고 번호를 못 찾으면 안내를 띄우고 진행은 열어 둔다", () => {
    mockSearchParams = new URLSearchParams("remoteFrameId=7");
    const { onConfirm, confirm } = renderChooser({
      isLoading: false,
      frames: [],
      missingRemoteFrameNotice: <p>링크에 담긴 전용 프레임을 불러오지 못했어요.</p>,
    });

    expect(
      screen.getByText("링크에 담긴 전용 프레임을 불러오지 못했어요."),
    ).toBeInTheDocument();
    expect(confirm()).toBeEnabled();
    fireEvent.click(confirm());
    expect(onConfirm).toHaveBeenCalledWith({
      frameId: "classic-4",
      remoteFrameId: null,
    });
  });

  /*
    막는 것은 **주소가 준 번호를 아직 못 찾은 동안**뿐이다.

    "번호가 있고 조회 중"까지만 보면 목록에서 손으로 고른 프레임도 같이 걸린다 — 목록
    새로고침이 한 번 돌 때마다 이미 손에 든 선택이 잠기고, 링크로 들어온 적도 없는
    사람에게 "링크에 담긴 프레임"이라고 말하게 된다.
  */
  it("목록에서 손으로 고른 프레임은 목록이 다시 도는 중이어도 막지 않는다", () => {
    const { onConfirm, confirm, rerender } = renderChooser({
      isLoading: false,
      frames: [frame({ frameId: 9, title: "내가 만든 프레임" })],
    });

    fireEvent.click(screen.getByRole("button", { name: /내가 만든 프레임/ }));
    // 새로고침이 도는 중(목록 자체는 그대로 남는다).
    rerender({ isLoading: true });

    expect(screen.queryByText(LOADING_NOTICE)).not.toBeInTheDocument();
    expect(confirm()).toBeEnabled();
    fireEvent.click(confirm());
    expect(onConfirm).toHaveBeenCalledWith({
      frameId: "classic-4",
      remoteFrameId: 9,
    });
  });

  // 주소가 준 번호도 한 번 찾고 나면 다시 막지 않는다.
  it("주소의 번호를 이미 찾았으면 다시 도는 중이어도 막지 않는다", () => {
    mockSearchParams = new URLSearchParams("remoteFrameId=7");
    const { onConfirm, confirm, rerender } = renderChooser({
      isLoading: false,
      frames: [frame({ frameId: 7 })],
    });

    rerender({ isLoading: true });

    expect(screen.queryByText(LOADING_NOTICE)).not.toBeInTheDocument();
    expect(confirm()).toBeEnabled();
    fireEvent.click(confirm());
    expect(onConfirm).toHaveBeenCalledWith({
      frameId: "classic-4",
      remoteFrameId: 7,
    });
  });

  // 화면이 스스로 막아 둔 것(예: /theme 의 "불러오는 중...")은 그대로 살아 있어야 한다.
  it("바깥이 넘긴 비활성은 그대로 둔다", () => {
    const { confirm } = renderChooser({ confirmDisabled: true });

    expect(confirm()).toBeDisabled();
  });
});
