"use client";

import { useState } from "react";
import { AuthField } from "@/components/auth/AuthField";
import { useModalDialog } from "@/hooks/useModalDialog";

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

/** 서버가 이 API 에 거는 유일한 제약. `ChangePasswordRequest.newPassword` 의 `@Size`. */
const NEW_PASSWORD_LENGTH = { min: 8, max: 20 } as const;

/**
 * 새 비밀번호 길이 검사. **여기서 보는 것은 길이뿐이다.**
 *
 * 이 API 의 서버 규칙은 `@NotBlank` + `@Size(8, 20)` 이 전부고 `@Pattern` 이 없다
 * (`ChangePasswordRequest`, 실행 중인 jar 실측). 가입용 공용 `validatePassword()` 를
 * 그대로 쓰면 문자 화이트리스트가 따라와 **서버가 받아 주는 비밀번호를 화면이 막는다** —
 * 실측 2026-09-02, `abcd~1234`(물결표)·`비밀번호12345678` 둘 다 200 GEN-000 이다.
 * 로그인 화면에 가입 규칙을 걸던 것과 같은 종류의 실수라 반복하지 않는다.
 *
 * 길이는 반대로 여기서 잡아야 한다. 넘겨 보내면 400 GEN-003 이 오는데 그 사유가 영문
 * (`size must be between 8 and 20`)이라 `apiError` 가 버리고 "입력값을 다시 확인해
 * 주세요."만 남는다 — 어느 칸이 왜 틀렸는지 화면에서 사라진다.
 *
 * 서버가 나중에 문자 제한을 실제로 걸면 그때 공용 가입 규칙을 다시 가져온다.
 */
function validateNewPasswordLength(password: string): string | null {
  if (password.length < NEW_PASSWORD_LENGTH.min) {
    return `비밀번호는 최소 ${NEW_PASSWORD_LENGTH.min}자 이상이어야 합니다.`;
  }
  if (password.length > NEW_PASSWORD_LENGTH.max) {
    return `비밀번호는 ${NEW_PASSWORD_LENGTH.max}자 이하여야 합니다.`;
  }
  return null;
}

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
 *
 * **다만 서버가 정하지 않은 규칙까지 여기서 세우지 않는다.** 가입용 공용
 * `validatePassword()` 는 문자 화이트리스트까지 보는데, 이 API 는 그렇지 않다 —
 * 아래 `NEW_PASSWORD_LENGTH` 주석 참고.
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
    const lengthError = validateNewPasswordLength(newPassword);
    if (lengthError) {
      return { newPassword: lengthError };
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
        aria-labelledby="password-change-title"
        className="hc-surface-card relative w-full max-w-sm rounded-3xl border p-5 shadow-(--hc-card-shadow)"
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
            placeholder={`${NEW_PASSWORD_LENGTH.min}~${NEW_PASSWORD_LENGTH.max}자`}
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
              className="text-[12px] font-medium text-(--hc-danger)"
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
