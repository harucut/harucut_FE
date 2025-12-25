"use client";

import { AuthField } from "@/components/auth/AuthField";
import { SIGNUP_EMAIL_FIELD } from "@/components/auth/authFields";

type Props = {
  emailLocked: boolean;

  emailError?: string | null;

  emailCode: string;
  setEmailCode: (v: string) => void;

  isSendingCode: boolean;
  isVerifyingCode: boolean;
  isEmailVerified: boolean;

  emailVerificationEmailError?: string | null;
  codeError?: string | null;

  sendCode: (email: string) => Promise<boolean>;
  verifyCode: (email: string, code: string) => Promise<boolean>;
};

export function EmailVerificationSection({
  emailLocked,
  emailError,

  emailCode,
  setEmailCode,
  isSendingCode,
  isVerifyingCode,
  isEmailVerified,

  emailVerificationEmailError,
  codeError,

  sendCode,
  verifyCode,
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      <AuthField
        {...SIGNUP_EMAIL_FIELD}
        required
        readOnly={emailLocked}
        error={emailError ?? emailVerificationEmailError}
      />

      <div className="flex gap-2">
        <input
          value={emailCode}
          onChange={(e) => setEmailCode(e.target.value)}
          disabled={emailLocked}
          placeholder="인증 코드"
          className="flex-1 rounded-2xl border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs outline-none placeholder:text-zinc-500 focus:border-emerald-500 disabled:opacity-50"
        />

        <button
          type="button"
          disabled={emailLocked || isSendingCode}
          onClick={async (ev) => {
            const form = ev.currentTarget.form;
            const fd = form ? new FormData(form) : null;
            const email = String(fd?.get("email") || "").trim();
            await sendCode(email);
          }}
          className="rounded-full border border-zinc-700 bg-zinc-900/40 px-3 py-2 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSendingCode ? "전송 중..." : "코드 전송"}
        </button>

        <button
          type="button"
          disabled={emailLocked || isVerifyingCode || !emailCode.trim()}
          onClick={async (ev) => {
            const form = ev.currentTarget.form;
            const fd = form ? new FormData(form) : null;
            const email = String(fd?.get("email") || "").trim();
            await verifyCode(email, emailCode);
          }}
          className="rounded-full border border-emerald-500/80 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isVerifyingCode ? "확인 중..." : "인증 확인"}
        </button>
      </div>

      {codeError ? (
        <p className="text-[11px] text-red-200">{codeError}</p>
      ) : null}

      {isEmailVerified ? (
        <p className="text-[11px] text-emerald-300">이메일 인증 완료!</p>
      ) : null}
    </div>
  );
}
