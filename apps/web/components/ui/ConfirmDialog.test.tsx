/**
 * 확인 다이얼로그가 **실행 중에 닫히지 않는지**, 그리고 그러는 동안 **키보드가 갇히지 않는지**
 * 지킨다.
 *
 * 이 다이얼로그가 묻는 것은 전부 되돌릴 수 없는 동작이다 — 사진 DELETE(기록 화면),
 * 프레임 DELETE(테마 편집기). 요청은 한번 나가면 취소할 수 없으니, 할 수 있는 일은
 * 결과를 볼 자리를 지키는 것뿐이다. `PasswordChangeDialog` 를 같은 이유로 먼저 고쳤고
 * 이 파일은 그 테스트와 짝이다.
 *
 * jsdom 은 Tab 순회를 구현하지 않는다. 그래서 keydown 만 흘린 뒤 `document.activeElement`
 * 로 판정한다. 또 jsdom 의 `offsetParent` 는 언제나 null 이라 `useModalDialog` 의 "보이는
 * 요소" 필터가 전부 걸러 버린다 — `useModalDialog.test.tsx` 와 같은 방식으로 흉내 낸다.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const originalOffsetParent = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetParent",
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement;
    },
  });
});

afterAll(() => {
  if (originalOffsetParent) {
    Object.defineProperty(HTMLElement.prototype, "offsetParent", originalOffsetParent);
  }
});

/**
 * `onClose`·`onConfirm` 은 **한 번만 만들어 계속 같은 것을 넘긴다.**
 *
 * 호출부가 `useCallback` 으로 안정화한 콜백을 넘기는 경우를 흉내 내려는 것이다. 렌더마다
 * 새 함수를 넘기면 `requestClose` 의 의존성이 뭐든 매번 새로 만들어져서, 의존성에서
 * `running` 을 빼도 스테일 클로저가 드러나지 않는다. 지금 두 호출부는 인라인 화살표라
 * 우연히 무사하지만 `ConfirmDialog` 는 공용 UI 라 언제 바뀔지 모른다.
 */
function renderDialog(props: { running: boolean }) {
  const onClose = jest.fn();
  const onConfirm = jest.fn();

  const element = (running: boolean) => (
    <ConfirmDialog
      title="이 사진을 지울까요?"
      description="지운 사진은 되돌릴 수 없어요."
      confirmLabel="지우기"
      runningLabel="지우는 중"
      running={running}
      destructive
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );

  const view = render(element(props.running));

  return {
    onClose,
    onConfirm,
    /** running 을 바꿔 다시 그린다. 콜백 정체성은 그대로다. */
    setRunning: (running: boolean) => view.rerender(element(running)),
  };
}

const cancelButton = () => screen.getByRole("button", { name: "취소" });
const backdropButton = () => screen.getByRole("button", { name: "닫기" });

describe("ConfirmDialog", () => {
  /*
    ── 회귀: 지우는 중에는 닫히지 않는다 ──

    닫는 길이 셋이다 — 배경 누르기 · 취소 버튼 · Escape(useModalDialog). 예전에는 `running`
    이 취소·확인 **버튼의 disabled 만** 껐고, 배경 버튼과 Escape 는 `onClose` 를 그대로
    불렀다. 느린 DELETE 가 도는 사이 그 둘 중 하나로 닫히면 화면에서는 취소한 것처럼
    보이지만 요청은 계속 간다. 사용자는 곧바로 이름 바꾸기나 **다른** 항목 삭제를 시작하고
    (기록), 저장을 누르기도 하는데(테마 편집기 — 저장 버튼은 `isDeleting` 을 안 본다),
    뒤늦게 도착한 응답이 목록에서 항목을 지우거나 `/theme` 로 화면을 옮겨 버린다. 실패해도
    그 사유는 이미 닫힌 다이얼로그 밖에서 뜬다.

    (같은 항목을 다시 지우는 길은 여기 이유가 아니다 — 두 호출부가 이미 자기 삭제 버튼을
    disabled 로 막는다.)

    세 길을 `requestClose` 하나로 모아 `running` 동안 전부 막는다.
  */
  it("실행 중에는 배경·취소·Escape 어느 쪽으로도 닫히지 않는다", () => {
    const { onClose, onConfirm } = renderDialog({ running: true });

    fireEvent.click(backdropButton());
    fireEvent.click(cancelButton());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    // 실행 버튼도 두 번 눌리지 않아야 한다 — DELETE 를 두 번 보내는 길이다.
    fireEvent.click(screen.getByRole("button", { name: "지우는 중" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "지우는 중" })).toBeDisabled();

    /*
      취소는 disabled 가 아니라 aria-disabled 다. 눌러도 소용없다는 것은 알리되 포커스
      대상으로는 남겨야 한다 — 둘 다 disabled 면 모달의 Tab 트랩이 빈 배열이 된다
      (아래 "Tab 이 포커스를 되끌어온다" 케이스가 그 자리를 지킨다).
    */
    expect(cancelButton()).toHaveAttribute("aria-disabled", "true");
    expect(cancelButton()).toBeEnabled();
  });

  /*
    반대쪽 못. 위 가드를 `running` 과 무관하게 걸어 버리면(또는 배경 버튼을 늘 막아 두면)
    다이얼로그를 아예 닫을 수 없게 된다 — 되돌릴 수 없는 삭제 앞에서 빠져나갈 길이 없는
    것이 더 나쁘다. 실행 중이 아닐 때는 셋 다 그대로 닫혀야 한다.
  */
  it("실행 중이 아니면 배경·취소·Escape 세 길 모두 그대로 닫힌다", () => {
    const { onClose } = renderDialog({ running: false });

    fireEvent.click(cancelButton());
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(backdropButton());
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  // 실행 중이 아닐 때 확인 버튼이 막히면 삭제 자체를 못 한다. 정상 경로도 같이 박아 둔다.
  it("실행 중이 아니면 확인 버튼이 onConfirm 을 부른다", () => {
    const { onConfirm } = renderDialog({ running: false });

    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  /*
    ── 전이를 태운다: running 은 false 로 열려서 true 로 올라간다 ──

    실제 화면에서 일어나는 순서는 이것 하나뿐이다. 다이얼로그는 항상 `running=false` 로
    열리고, 확인을 누른 그 순간에 true 가 된다. `running` 을 고정값으로 한 번만 마운트하는
    케이스만 있으면 전이에서만 깨지는 것들이 전부 통과한다 — 대표적으로 `requestClose` 의
    `useCallback` 의존성에서 `running` 을 빼는 것. 위의 안정된 콜백과 짝이 되어야 잡힌다.
  */
  it("실행 중으로 올라간 뒤에도 배경·취소·Escape 가 닫지 않는다", () => {
    const { onClose, setRunning } = renderDialog({ running: false });

    setRunning(true);

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(backdropButton());
    fireEvent.click(cancelButton());

    expect(onClose).not.toHaveBeenCalled();
  });

  /*
    ── 회귀: 가드는 임시여야 한다 ──

    위 가드는 `running` 이 **언젠가 내려온다**는 것을 전제로 걸려 있다. 그 전제가 깨지면
    (예전에는 두 삭제 요청에 종료 상한이 없어 회선이 멈추면 영영 안 내려왔다) 취소·배경·
    Escape 가 전부 영구 무동작이 되고, 사용자는 새로고침 말고 나갈 길이 없다. 상한 자체는
    호출 API 가 쥐고 있지만(lib/userMediaApi.ts · lib/remoteFrameApi.ts), 그 상한이 지나
    `running` 이 내려왔을 때 이 다이얼로그가 **다시 열어 주는지**는 여기서 지킨다 —
    가드를 한 번 걸린 뒤 계속 붙잡는 모양으로 바꾸면(ref 로 래치, 언마운트 전까지 유지)
    위의 세 케이스는 전부 통과한 채 갇힘만 되살아난다.
  */
  it("실행이 끝나 running 이 내려오면 배경·취소·Escape 가 다시 닫는다", () => {
    const { onClose, setRunning } = renderDialog({ running: false });

    setRunning(true);
    fireEvent.click(cancelButton());
    expect(onClose).not.toHaveBeenCalled();

    // 상한에 걸렸든 응답이 왔든, 호출부가 running 을 내린 뒤의 화면이다.
    setRunning(false);

    fireEvent.click(cancelButton());
    fireEvent.click(backdropButton());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  /*
    실행 중에도 다이얼로그 안에 포커스 가능한 컨트롤이 **최소 하나** 남아야 한다.

    한때 배경·취소·확인이 전부 disabled 라 `useModalDialog` 의 `focusables()` 가 빈 배열이
    됐다. 그러면 Tab 은 `items.length === 0` 가지에서 통째로 삼켜지고, 확인을 누른 순간
    body 로 떨어진 포커스를 되끌어오는 코드까지 닿지 못한다. 요청이 30초 상한에 걸릴 때까지는
    (lib/userMediaApi.ts · lib/remoteFrameApi.ts) 그동안 키보드 사용자가 갈 곳이 없어진다.

    `useModalDialog(true, …)` 를 `useModalDialog(!running, …)` 로 바꾸는 변이도 여기서
    죽는다 — 훅이 닫힌 것으로 알면 keydown 리스너 자체가 사라져 Tab 이 그냥 흘러간다.
  */
  it("실행 중으로 올라가도 Tab 이 포커스를 다이얼로그 안으로 되끌어온다", () => {
    const { setRunning } = renderDialog({ running: false });

    // 열릴 때 훅이 첫 컨트롤로 포커스를 넣는다.
    expect(document.activeElement).toBe(cancelButton());

    setRunning(true);

    /*
      확인 버튼이 disabled 로 바뀌면 브라우저는 거기 있던 포커스를 body 로 내려놓는다.
      jsdom 은 그 동작을 하지 않으니 손으로 만든다 — 회귀가 실제로 나타나는 상태다.
    */
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(document, { key: "Tab" });

    expect(document.activeElement).toBe(cancelButton());
  });
});
