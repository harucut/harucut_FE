"use client";

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
  const dialogRef = useModalDialog(true, onClose);

  return (
    <div className="fixed inset-0 z-120 flex items-end justify-center bg-[rgba(10,24,45,0.42)] px-4 py-6 sm:items-center">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
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
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="hc-button-secondary flex-1 rounded-full border px-5 py-3 text-[13px] font-semibold disabled:opacity-50"
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
