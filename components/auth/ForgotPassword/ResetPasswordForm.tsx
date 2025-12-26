"use client";

import { AuthField } from "@/components/auth/AuthField";
import type { Errors } from "@/app/forgot-password/_hooks/useForgotPasswordFlow";

type Props = {
  newPassword: string;
  setNewPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;

  isSubmitting: boolean;
  errors: Errors;

  onSubmit: () => void;
  onRestart: () => void;
  onGoLogin: () => void;
};

export function ResetPasswordForm({
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  isSubmitting,
  errors,
  onSubmit,
  onRestart,
  onGoLogin,
}: Props) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
    >
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
        <p className="text-[10px] text-zinc-400">
          인증 완료. 새 비밀번호를 설정해 주세요.
        </p>
      </div>

      <AuthField
        id="newPassword"
        name="newPassword"
        type="password"
        label="새 비밀번호"
        autoComplete="new-password"
        placeholder="새 비밀번호"
        required
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        error={errors.newPassword}
      />

      <AuthField
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="새 비밀번호 확인"
        autoComplete="new-password"
        placeholder="새 비밀번호 확인"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={errors.confirmPassword}
      />

      {errors.common ? (
        <p className="text-[10px] text-red-400">{errors.common}</p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-1 inline-flex h-9 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {isSubmitting ? "변경 중..." : "비밀번호 변경하기"}
      </button>

      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        <button
          type="button"
          onClick={onRestart}
          className="text-zinc-400 hover:text-zinc-200"
        >
          처음부터 다시
        </button>
        <button
          type="button"
          onClick={onGoLogin}
          className="text-zinc-400 hover:text-zinc-200"
        >
          로그인으로
        </button>
      </div>
    </form>
  );
}
