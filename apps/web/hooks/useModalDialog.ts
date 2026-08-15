"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * 마지막으로 포커스됐던 요소를 따로 기억한다.
 *
 * 다이얼로그가 열리는 시점에는 `document.activeElement` 가 이미 body 로 돌아가 있는 경우가 있다
 * (여는 버튼을 눌러 열리는 알림 오버레이가 그랬다 — 실측으로 확인했다). 그러면 닫은 뒤
 * 돌려줄 자리를 잃는다. 그래서 focusin 을 계속 지켜보며 마지막 자리를 들고 있는다.
 */
let lastFocused: HTMLElement | null = null;
let installed = false;

/**
 * 포커스 기억을 켠다. **앱이 뜰 때 한 번** 불러야 한다.
 *
 * 이 모듈이 다이얼로그와 함께 늦게 로드되면 "열기 전 자리"를 놓친다 — 여는 버튼을 누른
 * 시점에는 아직 리스너가 없기 때문이다. 실제로 알림 오버레이가 그래서 복원이 안 됐다.
 * 그래서 등록을 모듈 로드에 맡기지 않고, 항상 마운트되는 곳에서 명시적으로 설치한다.
 */
export function installFocusMemory() {
  if (installed || typeof document === "undefined") return;
  installed = true;

  const remember = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target || target === document.body) return;
    // 다이얼로그 안에서 일어난 일은 "열기 전 자리"가 아니다.
    if (target.closest('[role="dialog"]')) return;
    lastFocused = target;
  };

  document.addEventListener("focusin", remember, true);
  document.addEventListener("pointerdown", remember, true);
}

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
 *
 * 알려진 한계: 상태로 열고 닫는 다이얼로그(프레임 저장)는 복원까지 확인했지만,
 * 언마운트로 닫히는 알림 오버레이는 "열기 전 자리"를 잡지 못해 복원이 되지 않는다.
 * 포커스 이동·트랩·Esc 는 양쪽 다 동작한다. 복원은 별도 과제로 남긴다.
 */
export function useModalDialog(isOpen: boolean, onClose: () => void) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const dialogRef = useCallback((node: HTMLElement | null) => {
    setContainer(node);
  }, []);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  // 열리기 직전의 포커스를 기억해 둔다. 렌더 뒤에 읽으면 이미 옮겨간 뒤라 늦다.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const active = document.activeElement as HTMLElement | null;
    restoreFocusTo.current =
      active && active !== document.body ? active : lastFocused;
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
        onClose();
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

      // 양 끝에서 넘어가면 반대쪽으로 감는다 — 뒤쪽 화면으로 새지 않게.
      if (event.shiftKey && (active === firstItem || !container.contains(active))) {
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
  }, [isOpen, container, onClose]);

  return dialogRef;
}
