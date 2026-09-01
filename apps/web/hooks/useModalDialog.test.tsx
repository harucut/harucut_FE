/**
 * 모달이 겹쳤을 때 **키보드의 임자가 누구인가**를 고정한다. 초기 포커스, Tab 트랩, Escape
 * 셋 다 화면 맨 위 하나만 갖는다.
 *
 * 이 훅은 keydown 을 `document` 에 capture 로 건다. 그래서 모달이 둘 열려 있으면 두 리스너가
 * 모든 키를 본다. 임자를 하나로 정하지 않으면 이렇게 어긋난다.
 *  - 포커스: 열림 effect 가 자기 첫 컨트롤로 무조건 옮기면, 약관 재동의(z-130) 뒤에 뒤늦게
 *    열린 게스트 안내(z-120)가 화면 뒤에서 포커스를 채간다. Tab 도 각자 처리하면 그 안에서만
 *    순환해, 보이는 약관 모달은 키보드로 손도 못 댄다.
 *  - Escape: `stopPropagation()` 이 같은 요소의 다른 리스너를 못 멈추므로 두 onClose 가 모두
 *    돌았다. **맨 위 하나만** 받아야 하고, 그 "맨 위"는 연 순서가 아니라 그려지는 순서다.
 * 루트 레이아웃에 게스트 인계 안내와 약관 재동의가 나란히 붙어 있고 둘 다 조회 결과로 저절로
 * 열리므로 실제로 겹치는 조합이다.
 *
 * 키는 항상 **지금 포커스를 쥔 요소**에서 누른다. 보이는 버튼에 직접 dispatch 하면 실제
 * `document.activeElement` 상태를 한 번도 태우지 못해, 포커스가 엉뚱한 모달에 갇힌 회귀를
 * 놓친다.
 *
 * jsdom 은 Tab 순회를 구현하지 않는다. 그래서 keydown 만 흘린 뒤 `document.activeElement` 와
 * preventDefault 여부로 판정한다. 또 jsdom 은 `offsetParent` 를 언제나 null 로 주기 때문에
 * 훅의 "보이는 요소" 필터가 전부 걸러 버린다 — `TermsReconsentDialog.test.tsx` 와 같은 방식으로
 * 부모 요소를 흉내 낸다.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useModalDialog } from "@/hooks/useModalDialog";

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

/** 실제 모달과 같은 껍데기. 약관 재동의처럼 닫히지 않는 것도 있어 onClose 기본값은 무동작. */
function Dialog({ name, onClose = () => undefined }: { name: string; onClose?: () => void }) {
  const dialogRef = useModalDialog(true, onClose);

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={name}>
      <button type="button">{name} 처음</button>
      <button type="button">{name} 가운데</button>
      <button type="button">{name} 마지막</button>
    </div>
  );
}

/**
 * 배경 위에 얹힌 모달. 실제 화면 구조와 같다 — z-index 는 훅이 쥔 요소가 아니라 그 위의
 * `fixed inset-0 z-[...]` 배경에 붙어 있다.
 *
 * jsdom 은 Tailwind 클래스를 적용하지 않아 `getComputedStyle` 의 zIndex 가 전부 빈 문자열이다.
 * 그래서 클래스로는 z-index 가지를 태울 수 없고, 필요할 때만 인라인 style 로 준다. 안 주면
 * 실제 화면에서 배경끼리 z-index 가 같은 경우(z-120 대 z-120)와 같아져 문서 순서로 갈린다.
 *
 * `isOpen` 이 false 면 통째로 사라진다 — 게스트 인계 안내가 그렇게 동작한다.
 */
function LayeredDialog({
  name,
  isOpen = true,
  zIndex,
  onClose = () => undefined,
}: {
  name: string;
  isOpen?: boolean;
  zIndex?: number;
  onClose?: () => void;
}) {
  const dialogRef = useModalDialog(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div style={zIndex === undefined ? undefined : { zIndex }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={name}>
        <button type="button">{name} 처음</button>
        <button type="button">{name} 가운데</button>
        <button type="button">{name} 마지막</button>
      </div>
    </div>
  );
}

/**
 * 지금 포커스를 쥔 요소에서 키를 누른다. 실제 키보드가 그렇게 동작한다.
 *
 * fireEvent 는 dispatchEvent 결과를 그대로 돌려준다 — preventDefault 가 걸리면 false.
 */
function pressKey(key: string, init: { shiftKey?: boolean } = {}) {
  const target = (document.activeElement ?? document.body) as HTMLElement;
  return { notPrevented: fireEvent.keyDown(target, { key, ...init }) };
}

const pressTab = (init: { shiftKey?: boolean } = {}) => pressKey("Tab", init);
const pressEscape = () => pressKey("Escape");

/**
 * 정리 함수의 포커스 인계는 rAF 한 프레임 뒤에 일어난다 — 닫히는 다이얼로그 DOM 이 사라지기
 * 전에 옮기면 브라우저가 포커스를 body 로 되돌린다. 그 한 프레임을 기다린다.
 */
async function nextFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/** 실제 화면 배치: 게스트 인계 안내(z-120)는 루트 레이아웃이라 문서 순서가 앞이고, 약관은 z-130. */
function stackedStage({ guestOpen, termsOpen }: { guestOpen: boolean; termsOpen: boolean }) {
  return (
    <>
      <button type="button">여는 버튼</button>
      <LayeredDialog name="게스트" isOpen={guestOpen} zIndex={120} />
      <LayeredDialog name="약관" isOpen={termsOpen} zIndex={130} />
    </>
  );
}

describe("useModalDialog", () => {
  it("열리면 첫 컨트롤로 포커스가 들어간다", () => {
    render(<Dialog name="촬영 방식" />);

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "촬영 방식 처음" }),
    );
  });

  it("모달이 둘 열려 있으면 맨 위 모달만 초기 포커스를 갖는다", () => {
    render(
      <>
        <Dialog name="게스트" />
        <Dialog name="약관" />
      </>,
    );

    // 배경 z-index 가 같으면 문서 순서가 갈라 준다 — 뒤에 오는 약관이 위에 얹힌다.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "약관 처음" }));
  });

  it("아래에 깔릴 모달이 뒤늦게 열려도 포커스를 뺏지 않는다", () => {
    const { rerender } = render(stackedStage({ guestOpen: false, termsOpen: true }));

    const termsMiddle = screen.getByRole("button", { name: "약관 가운데" });
    termsMiddle.focus();

    // 약관 재동의(z-130)를 읽는 사이 게스트 인계 안내(z-120)가 조회 결과로 도착한다.
    rerender(stackedStage({ guestOpen: true, termsOpen: true }));

    /*
      여기서 포커스를 끌어가면 화면 뒤에 가려진 안내에 포커스가 갇힌다 — 사용자 눈에는
      아무 것도 안 바뀌었는데 키보드만 사라진 셈이다. 읽던 자리도 그대로여야 한다.
    */
    expect(document.activeElement).toBe(termsMiddle);
  });

  it("아래에 깔린 모달로 포커스가 새면 Tab 이 맨 위 모달로 되돌린다", () => {
    render(stackedStage({ guestOpen: true, termsOpen: true }));

    const termsFirst = screen.getByRole("button", { name: "약관 처음" });
    expect(document.activeElement).toBe(termsFirst);

    /*
      아래 모달이 자체 트랩을 들고 있으면 여기서 자기 첫 컨트롤로 감아 돌린다 — 포커스가
      보이지 않는 모달 안에서 영원히 순환한다. 맨 위 모달이 회수해야 한다.
    */
    screen.getByRole("button", { name: "게스트 마지막" }).focus();
    expect(pressTab().notPrevented).toBe(false);
    expect(document.activeElement).toBe(termsFirst);

    // 가운데 컨트롤도 마찬가지다. 여기서 아무 일도 안 일어나면 Tab 이 통째로 멈춘 것이다.
    screen.getByRole("button", { name: "게스트 가운데" }).focus();
    expect(pressTab().notPrevented).toBe(false);
    expect(document.activeElement).toBe(termsFirst);
  });

  it("맨 위 모달이 닫히면 남은 아래 모달로 포커스를 넘긴다", async () => {
    const { rerender } = render(stackedStage({ guestOpen: false, termsOpen: false }));

    const opener = screen.getByRole("button", { name: "여는 버튼" });
    opener.focus();

    rerender(stackedStage({ guestOpen: false, termsOpen: true }));
    rerender(stackedStage({ guestOpen: true, termsOpen: true }));

    // 동의를 마치면 약관만 닫히고 게스트 인계 안내는 그대로 남는다.
    rerender(stackedStage({ guestOpen: true, termsOpen: false }));
    await nextFrame();

    /*
      열기 전 자리로 돌려주면 포커스가 모달 뒤쪽 화면으로 빠진다 — 안내는 열려 있는데 키보드로
      닿을 수 없다. 남은 것 중 맨 위가 새 임자다.
    */
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "게스트 처음" }));
  });

  it("아래 모달이 닫혀도 맨 위 모달이 포커스를 지킨다", async () => {
    const { rerender } = render(stackedStage({ guestOpen: false, termsOpen: false }));

    const opener = screen.getByRole("button", { name: "여는 버튼" });
    opener.focus();

    // 게스트 안내가 먼저 열려 포커스를 쥐고, 그 위로 약관 재동의가 얹힌다.
    rerender(stackedStage({ guestOpen: true, termsOpen: false }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "게스트 처음" }));

    rerender(stackedStage({ guestOpen: true, termsOpen: true }));
    const termsFirst = screen.getByRole("button", { name: "약관 처음" });
    expect(document.activeElement).toBe(termsFirst);

    rerender(stackedStage({ guestOpen: false, termsOpen: true }));
    await nextFrame();

    // 닫힌 쪽의 "열기 전 자리"로 되돌리면 보이는 약관 모달에서 포커스를 뺏는다.
    expect(document.activeElement).toBe(termsFirst);
  });

  it("맨 위 모달 안의 Tab 은 막지 않는다", () => {
    render(
      <>
        <Dialog name="게스트" />
        <Dialog name="약관" />
      </>,
    );

    const middle = screen.getByRole("button", { name: "약관 가운데" });
    middle.focus();

    const { notPrevented } = pressTab();

    // 양 끝이 아니면 브라우저 기본 순서가 그대로 돌아야 한다. 여기서 막히면 Tab 이 멈춘다.
    expect(notPrevented).toBe(true);
    expect(document.activeElement).toBe(middle);
  });

  it("맨 위 모달은 첫·마지막 컨트롤에서 Tab 을 감아 준다", () => {
    render(stackedStage({ guestOpen: true, termsOpen: true }));

    const firstItem = screen.getByRole("button", { name: "약관 처음" });
    const lastItem = screen.getByRole("button", { name: "약관 마지막" });

    // 양 끝에서 새어 나가면 아래 모달과 뒤쪽 화면으로 포커스가 넘어간다.
    lastItem.focus();
    expect(pressTab().notPrevented).toBe(false);
    expect(document.activeElement).toBe(firstItem);

    expect(pressTab({ shiftKey: true }).notPrevented).toBe(false);
    expect(document.activeElement).toBe(lastItem);
  });

  it("모달이 하나면 body 로 떨어진 포커스를 Tab 이 안으로 되돌린다", () => {
    render(<Dialog name="약관" />);

    // 제출 중 컨트롤이 한꺼번에 disabled 되면 브라우저가 포커스를 body 로 내려놓는다.
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    const { notPrevented } = pressTab();

    // 트랩이 그대로 걸려야 뒤쪽 화면으로 안 샌다.
    expect(notPrevented).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "약관 처음" }));
  });

  it("모달이 둘 열려 있으면 Escape 는 맨 위 모달만 받는다", () => {
    const closeGuest = jest.fn();
    const closeTerms = jest.fn();

    render(
      <>
        <Dialog name="게스트" onClose={closeGuest} />
        <Dialog name="약관" onClose={closeTerms} />
      </>,
    );

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "약관 처음" }));
    pressEscape();

    /*
      `stopPropagation()` 은 같은 요소(document)에 걸린 다른 리스너를 멈추지 않는다. 판정이
      없으면 아래 깔린 게스트 인계 안내의 clearNotice 까지 같이 돌아, 닫히지 않는 약관 모달
      뒤에서 저장/버리기 확인이 조용히 사라진다.
    */
    expect(closeTerms).toHaveBeenCalledTimes(1);
    expect(closeGuest).not.toHaveBeenCalled();
  });

  it("나중에 열려도 아래에 깔린 모달은 Escape 를 받지 않는다", () => {
    const clearNotice = jest.fn();
    const closeConfirm = jest.fn();

    // 게스트 인계 안내는 루트 레이아웃에 늘 붙어 있어 `{children}` 보다 앞에 그려진다.
    // 배경 z-index 가 같으므로(z-120 대 z-120) 페이지 모달이 그 위에 얹힌다.
    const stage = (guestOpen: boolean) => (
      <>
        <LayeredDialog name="게스트" isOpen={guestOpen} onClose={clearNotice} />
        <LayeredDialog name="확인" onClose={closeConfirm} />
      </>
    );

    const { rerender } = render(stage(false));
    // 페이지 모달이 떠 있는 동안 인계 안내가 뒤늦게 도착한다 — 연 순서로는 게스트가 맨 위다.
    rerender(stage(true));

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "확인 처음" }));
    pressEscape();

    // 보이는 모달이 닫히고, 뒤에 깔린 저장/버리기 확인은 살아 있어야 한다.
    expect(closeConfirm).toHaveBeenCalledTimes(1);
    expect(clearNotice).not.toHaveBeenCalled();
  });

  it("z-index 가 높은 모달이 열린 순서와 무관하게 Escape 를 받는다", () => {
    const closeTerms = jest.fn();
    const closeConfirm = jest.fn();

    const stage = (confirmOpen: boolean) => (
      <>
        <LayeredDialog name="약관" zIndex={130} onClose={closeTerms} />
        <LayeredDialog
          name="확인"
          isOpen={confirmOpen}
          zIndex={120}
          onClose={closeConfirm}
        />
      </>
    );

    const { rerender } = render(stage(false));
    // 나중에 열리고 문서 순서도 뒤지만, 배경 z-index 가 낮아 약관 밑에 깔린다.
    rerender(stage(true));

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "약관 처음" }));
    pressEscape();

    expect(closeTerms).toHaveBeenCalledTimes(1);
    expect(closeConfirm).not.toHaveBeenCalled();
  });

  it("맨 위 모달이 사라지면 그 아래 모달이 Escape 를 받는다", async () => {
    const closeGuest = jest.fn();

    // 열린 순서와 사라지는 순서가 다를 수 있다. 목록은 정체성으로 지워야 남은 것만 겨룬다.
    const { rerender } = render(
      <>
        <Dialog name="게스트" onClose={closeGuest} />
        <Dialog name="약관" />
      </>,
    );

    rerender(
      <>
        <Dialog name="게스트" onClose={closeGuest} />
      </>,
    );
    await nextFrame();

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "게스트 처음" }));
    pressEscape();

    expect(closeGuest).toHaveBeenCalledTimes(1);
  });

  it("항상 붙어 있는 오버레이가 여러 번 여닫혀도 Escape 는 한 번만 돈다", () => {
    const clearNotice = jest.fn();

    // 게스트 인계 안내는 언마운트되지 않고 `isOpen` 만 토글된다. 목록에 중복으로 쌓이면
    // 판정이 흔들리거나 리스너가 겹쳐 붙는다.
    const stage = (open: boolean) => (
      <LayeredDialog name="게스트" isOpen={open} onClose={clearNotice} />
    );

    const { rerender } = render(stage(true));
    rerender(stage(false));
    rerender(stage(true));
    rerender(stage(false));
    rerender(stage(true));

    pressEscape();

    expect(clearNotice).toHaveBeenCalledTimes(1);
  });

  it("모달이 하나면 Escape 가 그대로 닫는다", () => {
    const onClose = jest.fn();

    render(<Dialog name="촬영 방식" onClose={onClose} />);

    pressEscape();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
