"use client";

import { AuthField } from "@/components/auth/AuthField";
import { EMAIL_FIELD } from "@/components/auth/authFields";

type Props = {
  // state
  email: string;
  setEmail: (v: string) => void;

  code: string;
  setCode: (v: string) => void;

  // behavior
  emailLocked: boolean;
  isSending: boolean;
  isVerifying: boolean;
  isVerified: boolean;

  // errors
  emailError?: string | null;
  codeError?: string | null;

  // actions
  onSend: (email: string) => Promise<boolean>;
  onVerify: (email: string, code: string) => Promise<boolean>;

  // text
  verifiedText?: string;
};

export function EmailCodeSection({
  email,
  setEmail,
  code,
  setCode,
  emailLocked,
  isSending,
  isVerifying,
  isVerified,
  emailError,
  codeError,
  onSend,
  onVerify,
  verifiedText = "이메일 인증 완료!",
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      <AuthField
        {...EMAIL_FIELD}
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        readOnly={emailLocked}
        error={emailError}
      />

      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="인증 코드"
          className="flex-1 rounded-2xl border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs outline-none placeholder:text-zinc-500 focus:border-emerald-500 disabled:opacity-50"
        />

        <button
          type="button"
          disabled={isSending}
          onClick={async () => {
            await onSend(email.trim());
          }}
          className="rounded-full border border-zinc-700 bg-zinc-900/40 px-3 py-2 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSending ? "전송 중..." : "코드 전송"}
        </button>

        <button
          type="button"
          disabled={isVerifying || !code.trim()}
          onClick={async () => {
            await onVerify(email.trim(), code.trim());
          }}
          className="rounded-full border border-emerald-500/80 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isVerifying ? "확인 중..." : "인증 확인"}
        </button>
      </div>

      {codeError ? (
        <p className="text-[11px] text-red-200">{codeError}</p>
      ) : null}

      {isVerified ? (
        <p className="text-[11px] text-emerald-300">{verifiedText}</p>
      ) : null}
    </div>
  );
}
