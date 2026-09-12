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
        <p className="text-[11px] text-zinc-400">
          인증이 완료되었어요. 새 비밀번호를 입력해 주세요.
        </p>
      </div>

      <AuthField
        id="newPassword"
        name="newPassword"
        type="password"
        label="새 비밀번호"
        autoComplete="new-password"
        placeholder="새 비밀번호를 입력해 주세요"
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
        placeholder="새 비밀번호를 한 번 더 입력해 주세요"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={errors.confirmPassword}
      />

      {errors.common ? (
        <p role="alert" className="text-[12px] text-(--hc-danger)">{errors.common}</p>
      ) : null}

      {/* 로그인·회원가입 CTA 와 같은 h-12 · 15px · 800. 이 화면만 36px·11px 였다. */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="hc-button-primary mt-1 inline-flex h-12 items-center justify-center rounded-full text-[15px] font-extrabold disabled:opacity-50"
      >
        {isSubmitting ? "변경 중…" : "비밀번호 변경하기"}
      </button>

      <div className="flex items-center justify-between gap-3 text-[13px]">
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex min-h-11 items-center px-1 text-(--hc-muted) transition hover:text-(--hc-text)"
        >
          처음부터 다시
        </button>
        <button
          type="button"
          onClick={onGoLogin}
          className="inline-flex min-h-11 items-center px-1 text-(--hc-muted) underline underline-offset-4 transition hover:text-(--hc-text)"
        >
          로그인으로 이동
        </button>
      </div>
    </form>
  );
}
