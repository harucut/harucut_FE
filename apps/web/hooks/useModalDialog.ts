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
    const first = focusables()[0];
    if (first) first.focus();
    else {
      container.setAttribute("tabindex", "-1");
      container.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
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
        풀린 상태다.
      */
      if (!container.contains(active)) {
        /*
          단, 다른 모달이 쥔 포커스는 뺏지 않는다.

          이 훅은 document 에 capture 리스너를 건다. 모달이 둘 열려 있으면 서로에게 상대의
          포커스는 늘 "밖"이라, 두 리스너가 차례로 preventDefault 하고 각자 자기 첫 컨트롤로
          끌어당긴다 — 순 결과는 제자리고 Tab 이 완전히 멈춘다. 루트 레이아웃에 게스트 인계
          안내와 약관 재동의 모달이 나란히 있고 둘 다 조회 결과로 저절로 열리므로 실제로
          겹친다. body 는 어느 다이얼로그에도 속하지 않으니 위 disabled 경우는 그대로 걸린다.
        */
        if (active instanceof Element && active.closest('[role="dialog"][aria-modal="true"]')) {
          return;
        }

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

      // 열기 전 자리로 포커스를 돌려준다. 이 정리 함수는 isOpen 이 false 가 될 때뿐 아니라
      // 컴포넌트가 통째로 사라질 때도 돈다 — 알림 오버레이처럼 언마운트로 닫히는 다이얼로그는
      // "닫힘 상태 렌더"가 아예 없어서, 상태 변화만 보면 복원이 실행되지 않는다.
      const target = restoreFocusTo.current;
      restoreFocusTo.current = null;
      if (!target) return;

      // 다음 프레임에 되돌린다. 정리 함수는 다이얼로그 DOM 이 아직 제거되기 전에 도는데,
      // 그 자리에서 포커스를 옮겨도 곧이어 포커스된 노드가 사라지면서 브라우저가 body 로
      // 되돌려 버린다(실측에서 그랬다). 제거가 끝난 뒤에 옮긴다.
      requestAnimationFrame(() => {
        if (document.contains(target)) target.focus();
      });
    };
  }, [isOpen, container]);

  return dialogRef;
}
