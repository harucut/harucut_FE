"use client";

import { EmailCodeSection } from "../EmailCodeSection";
import type { Errors } from "@/app/forgot-password/_hooks/useForgotPasswordFlow";

type Props = {
  email: string;
  setEmail: (v: string) => void;
  code: string;
  setCode: (v: string) => void;
  emailLocked: boolean;
  codeExpiresAt: number | null;
  isSubmitting: boolean;
  errors: Errors;
  onVerify: () => Promise<boolean>;
  onResend: () => Promise<boolean>;
  onRestart: () => void;
  onGoLogin: () => void;
};

export function VerifyCodeForm({
  email,
  setEmail,
  code,
  setCode,
  emailLocked,
  codeExpiresAt,
  isSubmitting,
  errors,
  onVerify,
  onResend,
  onRestart,
  onGoLogin,
}: Props) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onVerify();
      }}
      className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
    >
      <EmailCodeSection
        email={email}
        setEmail={setEmail}
        code={code}
        setCode={setCode}
        emailLocked={emailLocked}
        isSending={isSubmitting}
        isVerifying={isSubmitting}
        isVerified={false}
        codeExpiresAt={codeExpiresAt}
        emailError={errors.email}
        codeError={errors.code}
        onSend={async () => {
          return onResend();
        }}
        onVerify={async () => {
          return onVerify();
        }}
      />

      {errors.common ? (
        <p role="alert" className="text-[12px] text-(--hc-danger)">{errors.common}</p>
      ) : null}

      {/* 아직 아무것도 하지 않았으면 되돌릴 것도 없다 — 코드를 보낸 뒤에만 '처음부터'가 뜬다. */}
      <div className="flex items-center justify-between gap-3 text-[13px]">
        {emailLocked || codeExpiresAt ? (
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex min-h-11 items-center px-1 text-(--hc-muted) transition hover:text-(--hc-text)"
          >
            처음부터 다시
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onGoLogin}
          className="inline-flex min-h-11 items-center px-1 text-(--hc-muted) underline underline-offset-4 transition hover:text-(--hc-text)"
        >
          로그인으로 돌아가기
        </button>
      </div>
    </form>
  );
}
