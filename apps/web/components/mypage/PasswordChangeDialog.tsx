"use client";

import { useState } from "react";
import { AuthField } from "@/components/auth/AuthField";
import { useModalDialog } from "@/hooks/useModalDialog";
import { validatePassword } from "@/lib/authValidation";

type Props = {
  saving: boolean;
  /** 서버가 거절했을 때. 다이얼로그를 닫지 않고 여기에 보여 준다. */
  error: string | null;
  onClose: () => void;
  onSubmit: (values: { oldPassword: string; newPassword: string }) => void;
};

type FieldErrors = {
  oldPassword?: string | null;
  newPassword?: string | null;
  confirmPassword?: string | null;
};

/**
 * 비밀번호 바꾸기.
 *
 * 예전에는 이 세 칸이 계정 정보 화면에 **늘 펼쳐져** 있었다. 마이페이지에서 가장 드문
 * 일인데 화면에서 가장 큰 자리를 차지했고, 빈 입력창 셋이 이메일·닉네임 같은 "읽는 값"
 * 사이에 끼어 무엇이 정보이고 무엇이 할 일인지 흐렸다. 브라우저 비밀번호 관리자가
 * 들어올 때마다 채우려 드는 것도 그 때문이었다.
 *
 * 목록에는 버튼 하나만 두고, 누를 때 여기서 받는다.
 *
 * 검증은 여기서 끝낸다 — 서버에 보내기 전에 알 수 있는 것(빈 칸, 길이, 확인 불일치)을
 * 왕복시킬 이유가 없고, 실패가 어느 칸 문제인지도 그 칸 아래에서 말해야 한다.
 */
export function PasswordChangeDialog({
  saving,
  error,
  onClose,
  onSubmit,
}: Props) {
  const dialogRef = useModalDialog(true, onClose);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const validate = (): FieldErrors | null => {
    if (!oldPassword) {
      return { oldPassword: "현재 비밀번호를 입력해 주세요." };
    }
    if (!newPassword) {
      return { newPassword: "새 비밀번호를 입력해 주세요." };
    }
    // 길이·문자 종류 규칙은 공용 validatePassword 하나로 본다. 여기서 8자 하한만 세던
    // 시절에는 21자가 그대로 서버로 갔고, 돌아온 400 의 사유가 영문(Bean Validation)이라
    // apiError 가 버려서 "입력값을 다시 확인해 주세요."만 떴다 — 서버는 8~20자다.
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return { newPassword: passwordError };
    }
    // 지금 것과 같으면 서버는 받아 주지만 바뀐 게 없다. 여기서 잡는 편이 친절하다.
    if (newPassword === oldPassword) {
      return { newPassword: "지금 쓰는 비밀번호와 달라야 해요." };
    }
    if (newPassword !== confirmPassword) {
      return { confirmPassword: "새 비밀번호가 서로 일치하지 않아요." };
    }
    return null;
  };

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
        aria-labelledby="password-change-title"
        className="hc-surface-card relative w-full max-w-sm rounded-3xl border p-5 shadow-[var(--hc-card-shadow)]"
      >
        <h2 id="password-change-title" className="text-[18px] font-extrabold">
          비밀번호 바꾸기
        </h2>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (saving) return;

            const nextErrors = validate();
            setFieldErrors(nextErrors ?? {});
            if (nextErrors) return;

            onSubmit({ oldPassword, newPassword });
          }}
          className="mt-4 flex flex-col gap-3"
        >
          <AuthField
            id="mypage-old-password"
            name="oldPassword"
            type="password"
            label="현재 비밀번호"
            placeholder="현재 비밀번호를 입력해 주세요"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            error={fieldErrors.oldPassword}
            disabled={saving}
          />
          <AuthField
            id="mypage-new-password"
            name="newPassword"
            type="password"
            label="새 비밀번호"
            placeholder="8~20자"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            error={fieldErrors.newPassword}
            disabled={saving}
          />
          <AuthField
            id="mypage-confirm-password"
            name="confirmPassword"
            type="password"
            label="새 비밀번호 확인"
            placeholder="새 비밀번호를 한 번 더 입력해 주세요"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={fieldErrors.confirmPassword}
            disabled={saving}
          />

          {error ? (
            <p
              role="alert"
              className="text-[12px] font-medium text-[color:var(--hc-danger)]"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="hc-button-secondary flex-1 rounded-full border px-5 py-3 text-[13px] font-semibold"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="hc-button-primary flex-1 rounded-full px-5 py-3 text-[13px] font-semibold disabled:opacity-50"
            >
              {saving ? "바꾸는 중" : "바꾸기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
