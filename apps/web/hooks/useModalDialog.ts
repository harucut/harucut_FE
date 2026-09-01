"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * 마지막으로 포커스됐던 요소를 따로 기억한다.
 *
 * 다이얼로그가 열리는 시점에는 `document.activeElement` 가 이미 body 로 돌아가 있는 경우가 있다
 * (여는 버튼을 눌러 열리는 알림 오버레이가 그랬다 — 실측으로 확인했다). 그러면 닫은 뒤
 * 돌려줄 자리를 잃는다. 그래서 focusin 을 계속 지켜보며 마지막 자리를 들고 있는다.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * 지금 열려 있는 다이얼로그 목록. **키보드는 이 중 화면 맨 위 하나만 갖는다** — Escape 도,
 * 열릴 때의 초기 포커스도, Tab 트랩도.
 *
 * 이 훅은 keydown 을 `document` 에 capture 로 건다. `stopPropagation()` 은 **같은 요소에
 * 걸린 다른 리스너를 멈추지 않는다.** 그래서 모달이 둘 열려 있으면 Escape 한 번에 두 훅의
 * onClose 가 모두 돌았다. 루트 레이아웃의 게스트 인계 안내(z-120)와 약관 재동의(z-130)가
 * 조회 결과로 나란히 열리는데, 약관 쪽은 닫을 수 없는 다이얼로그라 onClose 가 무동작이다 —
 * 화면에서는 아무 일도 없는데 뒤에 있던 저장/버리기 확인만 조용히 사라졌다. `GuestTrialBridge`
 * 의 `handoffPromptedRef` 때문에 새로고침 전에는 다시 뜨지도 않는다.
 *
 * **맨 위는 연 순서가 아니라 그려지는 순서다.** 게스트 인계 안내는 루트 레이아웃에 늘 붙어
 * 있고 `isOpen` 만 토글되므로, 페이지 모달이 떠 있는 동안 알림이 오면 나중에 열린다. 그런데
 * 두 배경은 z-index 가 같고(z-120) 이 오버레이는 `{children}` 보다 앞에 그려지니, 화면에서는
 * 페이지 모달 **뒤에** 깔린다. 연 순서로 판정하면 보이지 않는 쪽이 Escape 를 먹고 정작 보이는
 * 모달은 닫히지 않는다 — 원래 버그를 다른 얼굴로 되살리는 셈이다. 어느 조회가 먼저 끝났는지에
 * 판정이 흔들리지 않도록, 키가 눌린 시점에 (실효 z-index, 문서 순서)로 비교한다.
 *
 * **포커스도 같은 임자를 따른다.** 한때 이 판정을 Escape 에만 걸었더니, 열림 effect 는 여전히
 * 자기 첫 컨트롤로 포커스를 무조건 끌어갔고 Tab 도 다이얼로그마다 각자 처리했다. 약관
 * 재동의(z-130)가 떠 있는데 게스트 인계 안내(z-120)가 뒤늦게 열리면 포커스가 화면 뒤에 가려진
 * 안내 안으로 빨려 들어가고, "다른 모달이 쥔 포커스는 뺏지 않는다"는 Tab 쪽 예외 때문에 거기서
 * 계속 순환했다 — 보이는 약관 모달을 키보드로는 손도 못 댄다. `aria-modal="true"` 를 선언한
 * 이상 맨 위 하나 말고는 없는 셈 쳐야 한다. 임자가 하나면 서로 preventDefault 하며 포커스를
 * 당기던 교착도 같이 사라진다.
 *
 * 등록은 열릴 때, 해제는 정리에서 한다. 항목은 열 때마다 새로 만드는 객체라 **정체성으로**
 * 지운다 — 같은 컨테이너가 여닫히기를 반복해도(게스트 인계 안내가 그렇다) 목록이 어긋나지 않고,
 * 열린 순서와 사라지는 순서가 달라도 남은 것만 정확히 남는다.
 */
type OpenDialog = {
  container: HTMLElement;
  /** 이 다이얼로그 안으로 포커스를 넣는다. 위에 있던 것이 닫히면 물려받는 쪽이 이걸 쓴다. */
  focusInside: () => void;
};

const openDialogs: OpenDialog[] = [];

/**
 * 컨테이너가 실제로 얹히는 z-index.
 *
 * 숫자는 훅이 쥔 요소가 아니라 그 위의 `fixed inset-0 z-[...]` 배경에 붙어 있다. 그래서
 * 숫자 z-index 를 가진 가장 가까운 조상까지 올라가 읽는다. `auto` 는 쌓임 순서를 끌어올리지
 * 않으니 0 으로 본다.
 */
function stackingOrder(element: HTMLElement): number {
  let node: HTMLElement | null = element;

  while (node) {
    const value = Number.parseInt(window.getComputedStyle(node).zIndex, 10);
    if (Number.isFinite(value)) return value;
    node = node.parentElement;
  }

  return 0;
}

/** a 가 b 보다 위에 그려지는가. z-index 가 같으면 문서 순서상 뒤에 오는 쪽이 위다. */
function paintsAbove(a: HTMLElement, b: HTMLElement): boolean {
  const orderA = stackingOrder(a);
  const orderB = stackingOrder(b);

  if (orderA !== orderB) return orderA > orderB;
  return (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/**
 * 지금 화면 맨 위에 그려지는 다이얼로그. 열린 것이 없으면 null.
 *
 * DOM 에서 이미 빠진 컨테이너는 겨루지 않는다. 언마운트로 닫히는 다이얼로그는 정리가 도는
 * 시점과 노드가 사라지는 시점이 어긋날 수 있어, 그대로 두면 화면에 없는 것이 맨 위로 뽑힌다.
 */
function topmostDialog(): OpenDialog | null {
  let top: OpenDialog | null = null;

  for (const dialog of openDialogs) {
    if (!dialog.container.isConnected) continue;
    if (!top || paintsAbove(dialog.container, top.container)) top = dialog;
  }

  return top;
}

/**
 * `aria-modal="true"` 를 선언한 다이얼로그가 실제로 모달처럼 동작하게 만든다.
 *
 * 선언만 하고 규약을 안 지키면 스크린리더·키보드 사용자에게는 오히려 거짓말이 된다.
 * 세 가지가 빠져 있었다.
 *  - 열려도 포커스가 다이얼로그로 안 옮겨가서, 키보드 사용자는 Tab 을 수십 번 눌러야 닿았다.
 *  - Tab 이 뒤쪽 화면으로 새어 나가 보이지 않는 요소에 포커스가 갔다.
 *  - Esc 로 닫을 수 없고, 닫아도 포커스가 열기 전 자리로 돌아오지 않았다.
 *
 * 반환하는 ref 를 다이얼로그 컨테이너에 붙이면 된다.
 */
export function useModalDialog(isOpen: boolean, onClose: () => void) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const dialogRef = useCallback((node: HTMLElement | null) => {
    setContainer(node);
  }, []);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  /*
    onClose 는 ref 로 읽는다.

    호출부는 대개 `onClose={() => setTarget(null)}` 처럼 인라인 화살표를 넘긴다. 그 값은
    렌더마다 새 함수라, 아래 effect 의 의존성에 넣으면 **렌더할 때마다 정리 → 재실행**이
    된다. 정리는 포커스를 열기 전 자리로 되돌리도록 예약하고 새 실행은 첫 컨트롤로 옮기므로,
    다이얼로그 안에서 체크박스 하나만 눌러도 포커스가 맨 앞으로 튀거나 다음 프레임에
    모달 뒤쪽으로 빠진다. 약관 재동의처럼 항목이 여럿인 화면에서 키보드·스크린리더 사용자가
    그 자리에서 막힌다.

    최신 콜백은 필요하되 재구독은 하지 않는다.
  */
  const onCloseRef = useRef(onClose);
  // 렌더 중에 ref 를 건드리면 React Compiler 가 막는다. 렌더가 끝난 뒤에 갈아 끼운다.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // 열리기 직전의 포커스를 기억해 둔다. 렌더 뒤에 읽으면 이미 옮겨간 뒤라 늦다.
  useLayoutEffect(() => {
    if (!isOpen) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !container) return;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );

    // 첫 컨트롤로 옮긴다. 없으면 컨테이너 자체에 준다(제목을 읽어 주도록).
    const focusInside = () => {
      const first = focusables()[0];
      if (first) {
        first.focus();
        return;
      }
      container.setAttribute("tabindex", "-1");
      container.focus();
    };

    const self: OpenDialog = { container, focusInside };
    openDialogs.push(self);
    const isTopmost = () => topmostDialog() === self;

    /*
      맨 위로 열렸을 때만 포커스를 가져온다.

      아래에 깔릴 다이얼로그가 나중에 열리는 조합이 실제로 있다 — 약관 재동의(z-130)가 떠 있는
      사이 게스트 인계 안내(z-120)가 조회 결과로 도착한다. 그때 포커스를 끌어가면 화면 뒤에
      가려진 안내에 포커스가 갇힌다. 이쪽 차례는 위엣것이 닫힐 때 정리 함수가 넘겨준다.
    */
    if (isTopmost()) focusInside();

    const onKeyDown = (event: KeyboardEvent) => {
      /*
        겹쳐 있으면 맨 위 다이얼로그만 키를 받는다. 아래에 깔린 것은 못 본 척한다.

        Tab 까지 이 판정에 넣는 이유: 임자를 하나로 두지 않으면 아래 다이얼로그가 자기 안에서
        포커스를 계속 감아 돌려, 보이는 위 다이얼로그로 나갈 방법이 없다. 트랩을 잃는 것이
        아니다 — 맨 위 다이얼로그가 자기 밖으로 떨어진 포커스를 모두 되끌어오므로, 뒤쪽 화면도
        아래 다이얼로그도 포커스를 오래 쥐지 못한다.
      */
      if (!isTopmost()) return;

      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      /*
        다이얼로그 밖으로 떨어진 포커스는 방향과 무관하게 안으로 끌어온다.

        제출 중처럼 안의 컨트롤이 한꺼번에 disabled 되면 브라우저가 포커스를 body 로
        내려놓는다. 예전에는 Shift+Tab 만 이 경우를 봐서, 그 상태의 Tab 은 문서 처음부터
        다시 훑으며 모달 뒤쪽 요소로 새어 나갔다 — `aria-modal` 을 선언해 놓고 트랩이
        풀린 상태다. 아래에 깔린 다이얼로그에 남아 있던 포커스도 여기서 회수한다.
      */
      if (!container.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? lastItem : firstItem).focus();
        return;
      }

      // 양 끝에서 넘어가면 반대쪽으로 감는다 — 뒤쪽 화면으로 새지 않게.
      if (event.shiftKey && active === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);

      const stacked = openDialogs.lastIndexOf(self);
      if (stacked !== -1) openDialogs.splice(stacked, 1);

      // 열기 전 자리로 포커스를 돌려준다. 이 정리 함수는 isOpen 이 false 가 될 때뿐 아니라
      // 컴포넌트가 통째로 사라질 때도 돈다 — 알림 오버레이처럼 언마운트로 닫히는 다이얼로그는
      // "닫힘 상태 렌더"가 아예 없어서, 상태 변화만 보면 복원이 실행되지 않는다.
      const target = restoreFocusTo.current;
      restoreFocusTo.current = null;

      // 다음 프레임에 옮긴다. 정리 함수는 다이얼로그 DOM 이 아직 제거되기 전에 도는데,
      // 그 자리에서 포커스를 옮겨도 곧이어 포커스된 노드가 사라지면서 브라우저가 body 로
      // 되돌려 버린다(실측에서 그랬다). 제거가 끝난 뒤에 옮긴다.
      requestAnimationFrame(() => {
        /*
          아직 열려 있는 다이얼로그가 있으면 포커스는 그중 맨 위로 넘긴다.

          겹쳐 있던 위엣것이 닫히면 아래 다이얼로그가 새 임자가 된다. 열기 전 자리로 돌려주면
          포커스가 모달 뒤쪽 화면으로 빠져, 남은 다이얼로그는 열려 있는데 키보드로는 닿을 수
          없다. 반대로 아래엣것이 먼저 닫힌 경우에는 이미 위엣것이 포커스를 쥐고 있으므로
          건드리지 않는다 — 그대로 복원하면 보이는 다이얼로그에서 포커스를 뺏는 꼴이다.
        */
        const next = topmostDialog();
        if (next) {
          if (!next.container.contains(document.activeElement)) next.focusInside();
          return;
        }

        if (target && document.contains(target)) target.focus();
      });
    };
  }, [isOpen, container]);

  return dialogRef;
}
