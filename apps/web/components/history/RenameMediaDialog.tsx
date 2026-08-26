"use client";

import { useState } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";

type Props = {
  /** 지금 이름. 입력창의 초깃값이다. */
  currentName: string;
  saving: boolean;
  /** 저장에 실패했을 때만. 다이얼로그를 닫지 않고 여기에 보여 준다. */
  error: string | null;
  onClose: () => void;
  onSubmit: (nextName: string) => void;
};

/** 서버 컬럼은 255자지만, 카드 한 줄에 들어갈 이름에 그만한 여유는 필요 없다. */
const MAX_NAME_LENGTH = 100;

/**
 * 기록 이름 바꾸기.
 *
 * 카드 안에서 고치던 것을 여기로 옮겼다. 격자 카드는 모바일에서 한 줄에 둘이라 폭이
 * 160px 남짓인데, 그 안에 입력창과 저장 버튼을 나란히 넣으면 이름이 서너 글자밖에
 * 보이지 않았다. 게다가 제목 자리가 입력창으로 바뀌는 순간 카드 높이가 튀어 같은 줄의
 * 옆 카드까지 밀렸다.
 *
 * 좁은 자리를 지키느라 다이얼로그를 피할 이유가 없는 경우다 — 이름은 자주 고치는 값이
 * 아니고, 고칠 때는 이름 전체가 보여야 한다.
 *
 * 실패해도 닫지 않는다. 뒤편 페이지에 안내를 띄우면 열린 다이얼로그에 가려 보이지 않고,
 * 사용자는 방금 친 이름을 잃은 채 무슨 일이 있었는지 모른다.
 */
export function RenameMediaDialog({
  currentName,
  saving,
  error,
  onClose,
  onSubmit,
}: Props) {
  const dialogRef = useModalDialog(true, onClose);
  const [name, setName] = useState(currentName);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && !saving;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(10,24,45,0.42)] px-4 py-6 sm:items-center">
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
        aria-labelledby="rename-media-title"
        className="hc-surface-card relative w-full max-w-sm rounded-3xl border p-5 shadow-[var(--hc-card-shadow)]"
      >
        <h2 id="rename-media-title" className="text-[18px] font-extrabold">
          이름 바꾸기
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
            htmlFor="rename-media-input"
            className="block text-[12px] font-medium text-[color:var(--hc-muted)]"
          >
            기록 이름
          </label>
          {/*
            열리자마자 전체를 선택해 둔다. 대개는 기존 이름을 고치는 게 아니라
            통째로 갈아 끼우므로, 지우는 일부터 시키지 않는다.
          */}
          <input
            id="rename-media-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            maxLength={MAX_NAME_LENGTH}
            disabled={saving}
            placeholder="예: 바다에서"
            className="hc-input mt-1.5 w-full rounded-xl border px-3.5 py-3 text-[14px] disabled:opacity-60"
          />

          {error ? (
            <p
              role="alert"
              className="mt-2 text-[12px] font-medium text-[color:var(--hc-danger)]"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="hc-button-secondary flex-1 rounded-full border px-5 py-3 text-[13px] font-semibold"
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
