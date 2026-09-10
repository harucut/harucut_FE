"use client";

import { useState } from "react";
import { useCallback } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";

type Props = {
  /** 다이얼로그 제목. 무엇을 바꾸는지 말한다. */
  title: string;
  /** 입력창 라벨. */
  label: string;
  placeholder?: string;
  /** 지금 값. 입력창의 초깃값이다. */
  initialValue: string;
  maxLength?: number;
  saving: boolean;
  /** 저장에 실패했을 때만. 다이얼로그를 닫지 않고 여기에 보여 준다. */
  error: string | null;
  onClose: () => void;
  onSubmit: (nextValue: string) => void;
};

/**
 * 값 하나를 고쳐 넣는 다이얼로그.
 *
 * 기록 이름과 닉네임이 이걸 같이 쓴다. 둘 다 **평소에는 읽는 값**이고 어쩌다 한 번
 * 고치는 값이라, 화면에 늘 입력창을 열어 두면 두 가지가 나빠진다. 읽어야 할 값이
 * 폼처럼 보이고, 정작 자리가 좁은 곳(격자 카드 안)에서는 이름 서너 글자밖에 안 보인다.
 *
 * 그래서 평소에는 값으로 두고, 고칠 때만 열어 이름 전체를 놓고 고친다.
 *
 * 실패해도 닫지 않는다. 뒤편 화면에 안내를 띄우면 열린 다이얼로그에 가려 보이지 않고,
 * 사용자는 방금 친 값을 잃은 채 무슨 일이 있었는지 모른다.
 *
 * 여는 쪽에서 **조건부로 렌더**한다(`{target ? <SingleFieldDialog .../> : null}`).
 * 열 때마다 새로 마운트돼야 입력창이 그때의 값에서 시작하고, 닫을 때 포커스가 열었던
 * 버튼으로 돌아온다(useModalDialog 의 언마운트 정리 경로).
 */
export function SingleFieldDialog({
  title,
  label,
  placeholder,
  initialValue,
  maxLength = 100,
  saving,
  error,
  onClose,
  onSubmit,
}: Props) {
  /*
    **저장 중에는 닫히지 않는다.**

    닫는 길이 셋이다 — 배경 누르기 · 취소 버튼 · Escape(useModalDialog). `PATCH` 가 도는 중에
    그중 하나로 닫히면 화면은 취소한 것처럼 보이지만 요청은 계속 간다. 성공하면 사용자가
    **보지 못한 채 값이 바뀌고**(닉네임·기록 이름), 실패하면 그 사유가 이미 닫힌 다이얼로그의
    상태로만 남아 아무에게도 안 보인다.

    요청 자체는 되돌릴 수 없으니 할 수 있는 일은 결과를 볼 자리를 지키는 것이다. 셋을
    한 함수로 모아 여기서 막는다 — `PasswordChangeDialog`·`ConfirmDialog` 와 같은 모양이다.

    배경 버튼에는 `disabled` 를 붙이지 않는다. 붙이면 저장 중에 눌릴 수 있는 컨트롤이 하나도
    남지 않아 `useModalDialog` 의 포커스 트랩이 죽는다(`ConfirmDialog` 에서 같은 이유로 뺐다).
    입력이 `disabled` 라 여기서는 더 그렇다.
  */
  const requestClose = useCallback(() => {
    if (saving) return;
    onClose();
  }, [onClose, saving]);
  const dialogRef = useModalDialog(true, requestClose);
  const [value, setValue] = useState(initialValue);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && !saving;
  const fieldId = "single-field-dialog-input";

  return (
    <div className="fixed inset-0 z-120 flex items-end justify-center bg-[rgba(10,24,45,0.42)] px-4 py-6 sm:items-center">
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
        aria-labelledby="single-field-dialog-title"
        className="hc-surface-card relative w-full max-w-sm rounded-3xl border p-5 shadow-(--hc-card-shadow)"
      >
        <h2 id="single-field-dialog-title" className="text-[18px] font-extrabold">
          {title}
        </h2>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) return;
            onSubmit(trimmed);
          }}
          className="mt-4"
        >
          <label
            htmlFor={fieldId}
            className="block text-[12px] font-medium text-(--hc-muted)"
          >
            {label}
          </label>
          {/*
            열리자마자 전체를 선택해 둔다. 대개는 기존 값을 고치는 게 아니라 통째로
            갈아 끼우므로, 지우는 일부터 시키지 않는다.
          */}
          <input
            id={fieldId}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            maxLength={maxLength}
            disabled={saving}
            placeholder={placeholder}
            className="hc-input mt-1.5 w-full rounded-xl border px-3.5 py-3 text-[14px] disabled:opacity-60"
          />

          {error ? (
            <p
              role="alert"
              className="mt-2 text-[12px] font-medium text-(--hc-danger)"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              className="hc-button-secondary flex-1 rounded-full border px-5 py-3 text-[13px] font-semibold disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="hc-button-primary flex-1 rounded-full px-5 py-3 text-[13px] font-semibold disabled:opacity-50"
            >
              {saving ? "저장 중" : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
