"use client";

import { useCallback } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";

type Props = {
  /** 무엇을 하려는지. 질문이 아니라 할 일을 적는다("사진을 지울까요?"). */
  title: string;
  /** 되돌릴 수 없다면 여기서 말한다. */
  description?: string;
  /** 실행 버튼 문구. "확인"보다 무엇이 일어나는지 적는다("지우기"). */
  confirmLabel: string;
  /** 진행 중 문구. 생략하면 confirmLabel 을 그대로 쓴다. */
  runningLabel?: string;
  running: boolean;
  /** 되돌릴 수 없는 동작이면 실행 버튼을 위험색으로 그린다. */
  destructive?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * 되돌릴 수 없는 동작을 한 번 더 묻는다.
 *
 * `window.confirm` 을 쓰지 않는 이유 — 브라우저 기본 창은 우리 문구 서식을 못 쓰고
 * (무엇이 지워지는지 이름을 굵게 보여 줄 수 없다), 무엇보다 **모바일 사파리에서 탭 전체를
 * 멈춘다.** 진행 중 상태를 그릴 수도 없어서 느린 요청에서는 두 번 누르게 된다.
 *
 * `SingleFieldDialog` 와 같은 규약을 쓴다 — 여는 쪽에서 조건부로 렌더하면
 * 열 때 포커스가 안으로 들어오고 닫을 때 열었던 버튼으로 돌아간다(useModalDialog).
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  runningLabel,
  running,
  destructive = false,
  onClose,
  onConfirm,
}: Props) {
  /*
    **실행 중에는 닫히지 않는다.**

    닫는 길이 셋이다 — 배경 누르기 · 취소 버튼 · Escape(useModalDialog). 예전에는
    `running` 이 **버튼 두 개의 disabled 만** 껐고, 배경 버튼과 Escape 는 `onClose` 를
    그대로 불렀다. 이 다이얼로그가 묻는 것은 전부 되돌릴 수 없는 DELETE 라, 느린 요청이
    도는 사이 그 둘 중 하나로 닫히면 화면에서는 취소한 것처럼 보이지만 요청은 계속 간다.
    사용자는 그 자리에서 이름 바꾸기나 **다른** 항목 삭제를 시작하고(기록), 저장을 누르기도
    하는데(테마 편집기 — 저장 버튼은 `isSaving` 만 보고 `isDeleting` 은 안 본다), 뒤늦게 도착한 응답이 목록에서 항목을 지우거나 `/theme` 로
    화면을 옮겨 버린다. 실패해도 그 사유는 이미 닫힌 다이얼로그 밖에서 뜬다.

    **같은 항목 재삭제는 여기 이유가 아니다** — 두 호출부가 이미 막는다(history/page.tsx 의
    `disabled={deletingId === item.mediaId}`, ThemeEditorPage.tsx 의
    `disabled={isDeleting || isSaving}`). 한때 여기 적혀 있었는데 코드와 어긋난 말이었다.

    요청 자체를 취소할 수는 없으므로(fetch 를 끊어도 서버는 이미 처리한다) 할 수 있는
    일은 결과를 볼 자리를 지키는 것이다. 셋을 한 함수로 모아 여기서 막는다 —
    `PasswordChangeDialog` 를 같은 이유로 먼저 고쳤고 모양을 맞춰 둔다.

    가드는 `running` 일 때만이다. 무조건 막으면 되돌릴 수 없는 삭제 앞에서 빠져나갈
    길이 없어져 더 나쁘다.

    **그래서 `running` 은 반드시 끝나야 한다 — 상한을 거는 자리는 여기가 아니라 호출부다.**
    한때 두 삭제 요청 어디에도 종료 상한이 없었다(fetch 는 스스로 끝나지 않고 clientApi 에도
    기본 타임아웃이 없다). 회선이 응답 없이 멈추면 `running` 이 안 내려와 이 가드가
    영구화됐고, 취소·배경·Escape 가 전부 무동작이 되어 포커스가 죽은 취소 버튼에 갇혔다 —
    새로고침 말고는 앱을 쓸 수 없다. 지금은 두 API 가 30초 상한을 걸고 끊기면 호출부가
    `running` 을 내리며 사유를 보여 준다(lib/userMediaApi.ts · lib/remoteFrameApi.ts).
    새 호출부를 붙일 때도 조건은 같다. 끝나지 않을 수 있는 `running` 을 넘기면 이
    다이얼로그는 감옥이 된다.
  */
  const requestClose = useCallback(() => {
    if (running) return;
    onClose();
  }, [onClose, running]);
  const dialogRef = useModalDialog(true, requestClose);

  return (
    <div className="fixed inset-0 z-120 flex items-end justify-center bg-[rgba(10,24,45,0.42)] px-4 py-6 sm:items-center">
      {/*
        배경에는 `disabled` 를 걸지 않는다 — 눌림은 `requestClose` 가 막고, 결과는 같다.
        실행 중에 화면에서 누를 수 있는 것을 하나도 남기지 않는 데 굳이 한몫할 이유가 없다.

        다만 이것만으로는 모달 트랩이 살아나지 않는다. `useModalDialog` 의 `focusables()` 는
        `dialogRef` 가 붙은 **아래 카드 안쪽만** 훑는데(useModalDialog.ts), 이 배경 버튼은
        그 밖에 있다. 트랩을 붙잡는 것은 아래 취소 버튼의 aria-disabled 쪽이다.
      */}
      <button
        type="button"
        aria-label="닫기"
        onClick={requestClose}
        className="absolute inset-0"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? "confirm-dialog-desc" : undefined}
        className="hc-surface-card relative w-full max-w-sm rounded-3xl border p-5 shadow-(--hc-card-shadow)"
      >
        <h2 id="confirm-dialog-title" className="text-[18px] font-extrabold">
          {title}
        </h2>

        {description ? (
          <p
            id="confirm-dialog-desc"
            className="mt-2 text-[13px] leading-[1.6] text-(--hc-muted)"
          >
            {description}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          {/*
            disabled 가 아니라 aria-disabled 다 — `TermsReconsentDialog` 와 같은 이유에,
            여기서는 트랩까지 걸려 있다.

            취소와 확인을 **둘 다** disabled 로 두면 `useModalDialog` 의 `focusables()` 가
            빈 배열이 되고, Tab 은 `items.length === 0` 가지에서 통째로 삼켜진다. 확인을
            누른 순간 브라우저가 body 로 내려놓은 포커스를 되끌어오는 코드는 훅에 이미
            있는데(`!container.contains(active)` 가지), 빈 배열이면 거기까지 닿지 못한다.
            그래서 하나는 포커스 가능한 채로 남긴다.

            `PasswordChangeDialog` 가 취소까지 disabled 로 두고도 트랩이 사는 이유는
            AuthField 의 "비밀번호 보기" 토글이 saving 과 무관하게 살아 있어서다 — 우연이지
            설계가 아니다. 여기에는 그런 컨트롤이 없다.

            눌림은 `requestClose` 가 막는다. 실행 버튼은 disabled 를 그대로 둔다 — 되돌릴 수
            없는 DELETE 가 두 번 나가지 않는다는 브라우저 차원의 보장이 포커스 자리보다
            무겁고, 포커스는 다음 Tab 에 이 취소 버튼으로 돌아온다.
          */}
          <button
            type="button"
            onClick={requestClose}
            aria-disabled={running}
            className="hc-button-secondary flex-1 rounded-full border px-5 py-3 text-[13px] font-semibold aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={running}
            /*
              위험 버튼을 --hc-danger 로 **채우지** 않는다. 이 토큰은 라이트에서 진한
              빨강(#b42318)이지만 다크에서는 밝은 분홍(#ffb4ab)이라, 같은 글자색을 얹으면
              한쪽 테마에서 반드시 대비가 무너진다. 대비 안전한 글자색 토큰은 없다.
              그래서 이 레포가 danger 를 쓰는 방식 그대로 — 테두리와 글자에만 쓴다.
            */
            className={`flex-1 rounded-full px-5 py-3 text-[13px] font-semibold disabled:opacity-50 ${
              destructive
                ? "border border-(--hc-danger-border) bg-(--hc-danger-soft-bg) text-(--hc-danger)"
                : "hc-button-primary"
            }`}
          >
            {running ? (runningLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
