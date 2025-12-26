"use client";

import { EmailCodeSection } from "../EmailCodeSection";
import type { Errors } from "@/app/forgot-password/_hooks/useForgotPasswordFlow";

type Props = {
  email: string;
  setEmail: (v: string) => void;

  code: string;
  setCode: (v: string) => void;

  emailLocked: boolean;

  isSubmitting: boolean;
  errors: Errors;

  onVerify: () => void;
  onResend: () => void;
  onRestart: () => void;
  onGoLogin: () => void;
};

export function VerifyCodeForm({
  email,
  setEmail,
  code,
  setCode,
  emailLocked,
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
        emailError={errors.email}
        codeError={errors.code}
        onSend={async () => {
          onResend();
          return true;
        }}
        onVerify={async () => {
          onVerify();
          return true;
        }}
        verifiedText="인증 완료!"
      />

      {errors.common ? (
        <p className="text-[10px] text-red-400">{errors.common}</p>
      ) : null}

      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        <button
          type="button"
          onClick={onRestart}
          className="text-zinc-400 hover:text-zinc-200"
        >
          초기화
        </button>
        <button
          type="button"
          onClick={onGoLogin}
          className="text-zinc-400 hover:text-zinc-200"
        >
          로그인으로 돌아가기
        </button>
      </div>
    </form>
  );
}
