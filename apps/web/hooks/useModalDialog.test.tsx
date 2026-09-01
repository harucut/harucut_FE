/**
 * 모달이 둘 열렸을 때 Tab 이 통째로 멈추던 회귀를 막는다.
 *
 * 이 훅은 keydown 을 `document` 에 capture 로 건다. 그래서 모달이 둘 열려 있으면 두 리스너가
 * 모든 Tab 을 본다. "밖으로 떨어진 포커스를 안으로 끌어온다"는 가지가 방향 구분 없이 돌게 된
 * 뒤로는, 서로가 상대의 포커스를 "밖"으로 보고 각자 preventDefault → 자기 첫 컨트롤로 당겼다.
 * 순 결과는 제자리이고 브라우저 기본 이동은 막혀서, 제출 버튼까지 갈 방법이 없어진다.
 * 루트 레이아웃에 게스트 인계 안내와 약관 재동의가 나란히 붙어 있고 둘 다 조회 결과로 저절로
 * 열리므로 실제로 겹치는 조합이다.
 *
 * jsdom 은 Tab 순회를 구현하지 않는다. 그래서 포커스를 손으로 놓고 keydown 만 흘린 뒤
 * `document.activeElement` 와 preventDefault 여부로 판정한다. 또 jsdom 은 `offsetParent` 를
 * 언제나 null 로 주기 때문에 훅의 "보이는 요소" 필터가 전부 걸러 버린다 —
 * `TermsReconsentDialog.test.tsx` 와 같은 방식으로 부모 요소를 흉내 낸다.
 */
import { fireEvent, render, screen } from "@testing-library/react";
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

// fireEvent 는 dispatchEvent 결과를 그대로 돌려준다 — preventDefault 가 걸리면 false.
function pressTab(target: HTMLElement) {
  return { notPrevented: fireEvent.keyDown(target, { key: "Tab" }) };
}

describe("useModalDialog", () => {
  it("모달이 둘 열려 있어도 나중 모달 안의 Tab 은 막지 않는다", () => {
    render(
      <>
        <Dialog name="게스트" />
        <Dialog name="약관" />
      </>,
    );

    const middle = screen.getByRole("button", { name: "약관 가운데" });
    middle.focus();

    const { notPrevented } = pressTab(middle);

    // 브라우저 기본 순서가 그대로 돌아야 한다. 여기서 막히면 Tab 이 아무 일도 하지 않는다.
    expect(notPrevented).toBe(true);
    // 앞 모달이 자기 첫 컨트롤로 채가지도, 뒤 모달이 되끌어오지도 않는다.
    expect(document.activeElement).toBe(middle);
  });

  it("모달이 둘 열려 있어도 먼저 열린 모달 안의 Tab 은 막지 않는다", () => {
    render(
      <>
        <Dialog name="게스트" />
        <Dialog name="약관" />
      </>,
    );

    const middle = screen.getByRole("button", { name: "게스트 가운데" });
    middle.focus();

    const { notPrevented } = pressTab(middle);

    expect(notPrevented).toBe(true);
    // 나중에 열린 모달이 포커스를 자기 쪽으로 끌어가면 안 된다.
    expect(document.activeElement).toBe(middle);
  });

  it("모달이 하나면 body 로 떨어진 포커스를 Tab 이 안으로 되돌린다", () => {
    render(<Dialog name="약관" />);

    // 제출 중 컨트롤이 한꺼번에 disabled 되면 브라우저가 포커스를 body 로 내려놓는다.
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    const { notPrevented } = pressTab(document.body);

    // body 는 어느 다이얼로그에도 속하지 않는다 — 트랩이 그대로 걸려야 뒤쪽 화면으로 안 샌다.
    expect(notPrevented).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "약관 처음" }));
  });
});
