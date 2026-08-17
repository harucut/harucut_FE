"use client";

import { BadgeCheck, Clock3, Mail } from "lucide-react";
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
  // 타이머가 도는 동안엔 '인증 확인'만, 전송 전·만료 후엔 '코드 보내기'만 (번갈아 노출).
  const showVerify = hasSentCode && !isExpired;
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

      {/* 인증이 끝나면 한 줄이면 된다.
          예전에는 같은 말을 세 번 했다 — 방패 아이콘 배지, "이메일 인증이 완료되었어요",
          그리고 "인증 완료" 칩. 거기에 "이메일을 수정하면 인증 코드 입력 영역이 다시
          나타납니다"까지 붙었는데, 그건 사용자가 알아야 할 사실이 아니라 화면이 스스로를
          설명하는 말이었다. 이메일을 고치면 실제로 그렇게 되므로 미리 알려 줄 필요가 없다. */}
      {isVerified ? (
        <div className="rounded-2xl border border-[color:var(--hc-accent-soft-border)] bg-[color:var(--hc-accent-soft-bg)] px-3 py-2">
          <p className="text-[11px] font-medium text-[color:var(--hc-text)]">{verifiedText}</p>
        </div>
      ) : (
        <>
          {hasSentCode ? (
            <div
              className={`rounded-2xl border px-3 py-2 ${
                isExpired
                  ? "border-[color:var(--hc-danger-border)] bg-[color:var(--hc-danger-soft-bg)]"
                  : "border-[color:var(--hc-accent-soft-border)] bg-[color:var(--hc-accent-soft-bg)]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Clock3
                    size={14}
                    className={
                      isExpired ? "text-[color:var(--hc-danger)]" : "text-[color:var(--hc-primary-strong)]"
                    }
                  />
                  <p
                    className={`text-[11px] ${
                      isExpired ? "text-[color:var(--hc-danger)]" : "text-[color:var(--hc-text)]"
                    }`}
                  >
                    {isExpired
                      ? "인증 시간이 만료되었어요. 코드를 다시 보내 주세요."
                      : "인증 코드가 전송되었어요. 5분 안에 입력해 주세요."}
                  </p>
                </div>
                {!isExpired ? (
                  <span className="hc-button-secondary rounded-full border px-2 py-0.5 text-[11px] font-medium">
                    {formatRemainingTime(remainingSeconds)}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* 인증 코드 입력 + 단일 토글 버튼을 한 줄로. 전송 전·만료 후엔 '코드 보내기',
             타이머가 도는 동안엔 '인증 확인'만 노출(번갈아). radius·높이는 다른 입력칸과 동일. */}
          <div className="flex items-stretch gap-2">
            {/* 서버가 보내는 코드는 숫자가 아니라 영숫자 6자리다(예: VJG4K4).
                inputMode="numeric" 이었을 때는 휴대폰에서 숫자 키패드가 떠서 글자를 칠 수 없었다. */}
            <input
              value={code}
              // 대문자로 바꿔 담는 것은 보이기용이 아니라 보내는 값 자체다. CSS 로만 대문자로
              // 보이게 하면 소문자로 친 사람은 화면엔 맞게 보이는데 서버엔 다른 값이 간다.
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="인증 코드 입력"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              maxLength={6}
              className="hc-input h-9 min-w-0 flex-1 rounded-lg border px-3 text-xs disabled:opacity-50"
            />

            {showVerify ? (
              <button
                type="button"
                disabled={isVerifying || !code.trim()}
                onClick={async () => {
                  await onVerify(email.trim(), code.trim());
                }}
                className="hc-accent-chip inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-4 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <BadgeCheck size={14} />
                <span>{isVerifying ? "확인 중..." : "인증 확인"}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isSending}
                onClick={async () => {
                  await onSend(email.trim());
                }}
                className="hc-button-secondary inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-4 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Mail size={14} />
                <span>{sendButtonLabel}</span>
              </button>
            )}
          </div>

          {codeError ? (
            <p className="text-[11px] text-[color:var(--hc-danger)]">{codeError}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
