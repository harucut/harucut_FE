"use client";

import { BadgeCheck, Clock3, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AuthField } from "@/components/auth/AuthField";
import { EMAIL_FIELD } from "@/components/auth/authFields";

type Props = {
  email: string;
  setEmail: (v: string) => void;
  onEmailChange?: (v: string) => void;
  emailLocked?: boolean;
  code: string;
  setCode: (v: string) => void;
  isSending: boolean;
  isVerifying: boolean;
  isVerified: boolean;
  codeExpiresAt?: number | null;
  emailError?: string | null;
  codeError?: string | null;
  onSend: (email: string) => Promise<boolean>;
  onVerify: (email: string, code: string) => Promise<boolean>;
  verifiedText?: string;
};

function formatRemainingTime(remainingSeconds: number) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function EmailCodeSection({
  email,
  setEmail,
  onEmailChange,
  emailLocked = false,
  code,
  setCode,
  isSending,
  isVerifying,
  isVerified,
  codeExpiresAt = null,
  emailError,
  codeError,
  onSend,
  onVerify,
  verifiedText = "이메일 인증이 완료되었어요.",
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!codeExpiresAt || isVerified) return;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [codeExpiresAt, isVerified]);

  const remainingSeconds = useMemo(() => {
    if (!codeExpiresAt) return 0;
    return Math.max(Math.floor((codeExpiresAt - now) / 1000), 0);
  }, [codeExpiresAt, now]);

  const hasSentCode = Boolean(codeExpiresAt);
  const isExpired = hasSentCode && remainingSeconds === 0;
  const sendButtonLabel =
    isSending ? "전송 중..." : hasSentCode ? "코드 다시 보내기" : "코드 보내기";

  return (
    <div className="flex flex-col gap-2.5">
      <AuthField
        {...EMAIL_FIELD}
        required
        value={email}
        onChange={(e) => {
          const nextValue = e.target.value;
          setEmail(nextValue);
          onEmailChange?.(nextValue);
        }}
        readOnly={emailLocked}
        error={emailError}
      />

      {isVerified ? (
        <div className="rounded-2xl border border-[color:var(--hc-border)] bg-[linear-gradient(180deg,rgba(239,246,255,0.96),rgba(219,234,254,0.78))] px-3 py-3 shadow-[0_16px_36px_var(--hc-shadow)]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-[rgba(37,99,235,0.12)] p-2 text-[color:var(--hc-primary)]">
              <ShieldCheck size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium text-[color:var(--hc-text)]">
                  {verifiedText}
                </p>
                <span className="rounded-full border border-[rgba(37,99,235,0.22)] bg-[rgba(37,99,235,0.08)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--hc-primary)]">
                  인증 완료
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-[color:var(--hc-muted)]">
                이메일을 수정하면 인증 코드 입력 영역이 다시 나타납니다.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {hasSentCode ? (
            <div
              className={`rounded-2xl border px-3 py-2 ${
                isExpired
                  ? "border-red-500/30 bg-red-500/10"
                  : "border-[rgba(37,99,235,0.18)] bg-[rgba(37,99,235,0.08)]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Clock3
                    size={14}
                    className={
                      isExpired ? "text-red-200" : "text-[color:var(--hc-primary)]"
                    }
                  />
                  <p
                    className={`text-[10px] ${
                      isExpired ? "text-red-200" : "text-[color:var(--hc-text)]"
                    }`}
                  >
                    {isExpired
                      ? "인증 시간이 만료되었어요. 코드를 다시 보내 주세요."
                      : "인증 코드가 전송되었어요. 5분 안에 입력해 주세요."}
                  </p>
                </div>
                {!isExpired ? (
                  <span className="rounded-full border border-[rgba(37,99,235,0.18)] bg-white/70 px-2 py-0.5 text-[10px] font-medium text-[color:var(--hc-primary)]">
                    {formatRemainingTime(remainingSeconds)}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="인증 코드 입력"
              inputMode="numeric"
              className="flex-1 rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] px-3 py-2 text-xs text-[color:var(--hc-text)] outline-none placeholder:text-[color:var(--hc-muted)] focus:border-[color:var(--hc-primary)] disabled:opacity-50"
            />

            <button
              type="button"
              disabled={isSending}
              onClick={async () => {
                await onSend(email.trim());
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] px-3 py-2 text-[11px] text-[color:var(--hc-text)] hover:bg-[color:var(--hc-background-tint)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Mail size={14} />
              <span>{sendButtonLabel}</span>
            </button>

            <button
              type="button"
              disabled={isVerifying || !code.trim() || isExpired}
              onClick={async () => {
                await onVerify(email.trim(), code.trim());
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(37,99,235,0.24)] bg-[rgba(37,99,235,0.1)] px-3 py-2 text-[11px] text-[color:var(--hc-primary)] hover:bg-[rgba(37,99,235,0.16)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <BadgeCheck size={14} />
              <span>{isVerifying ? "확인 중..." : "인증 확인"}</span>
            </button>
          </div>

          {codeError ? (
            <p className="text-[11px] text-red-200">{codeError}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
