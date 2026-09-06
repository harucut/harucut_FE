"use client";

import { BadgeCheck, Clock3, Mail } from "lucide-react";
import { useEffect, useState } from "react";
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
  /** 인증을 마친 상태가 서버에서 만료되는 시각. 이 값이 있으면 인증 뒤에도 남은 시간을 보여 준다. */
  verifiedExpiresAt?: number | null;
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

/**
 * 마감까지 남은 초. **렌더할 때마다 지금 시각으로 다시 잰다.**
 *
 * 예전에는 `now` 를 state 에 담아 두고 1초마다 갱신했는데, 그 값을 컴포넌트가 처음 그려질 때
 * 한 번 재고 인터벌은 코드를 보낸 뒤에야 시작했다. 그래서 페이지를 열어 두고 8초 뒤에
 * 코드를 보내면 타이머가 05:00 이 아니라 **05:08** 에서 시작했다가 1초 뒤 04:58 로 튀었다.
 * 늦게 누를수록 더 벌어졌다. 저장해 둔 시각은 낡는다 — 잴 때 재면 낡을 일이 없다.
 *
 * 올림으로 잰다. 5분 마감을 건 직후 남은 시간은 299.9초인데, 내림이면 04:59 부터 시작한다.
 */
function secondsUntil(deadline: number | null) {
  if (!deadline) return 0;
  return Math.max(Math.ceil((deadline - Date.now()) / 1000), 0);
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
  verifiedExpiresAt = null,
  emailError,
  codeError,
  onSend,
  onVerify,
  verifiedText = "이메일 인증이 완료되었어요.",
}: Props) {
  // 인증 전에는 코드 시계(5분), 인증 뒤에는 인증 유효 시계(10분)가 돈다. 둘 다 없으면 멈춘다.
  const activeDeadline = isVerified ? verifiedExpiresAt : codeExpiresAt;

  // 이 state 는 값을 쓰려고 두는 게 아니라 1초마다 다시 그리게 하려고 둔다.
  // 남은 시간은 아래에서 그릴 때마다 직접 잰다(secondsUntil 주석 참고).
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!activeDeadline) return;

    const intervalId = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeDeadline]);

  const remainingSeconds = secondsUntil(codeExpiresAt);
  const verifiedRemainingSeconds = secondsUntil(verifiedExpiresAt);

  const hasSentCode = Boolean(codeExpiresAt);
  const isExpired = hasSentCode && remainingSeconds === 0;
  // 타이머가 도는 동안엔 '인증 확인'만, 전송 전·만료 후엔 '코드 보내기'만 (번갈아 노출).
  const showVerify = hasSentCode && !isExpired;
  const sendButtonLabel =
    isSending ? "전송 중…" : hasSentCode ? "코드 다시 보내기" : "코드 보내기";

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
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--hc-accent-soft-border)] bg-[color:var(--hc-accent-soft-bg)] px-3 py-2">
          <p className="text-[11px] font-medium text-[color:var(--hc-text)]">{verifiedText}</p>
          {/* 인증을 마쳐도 시계는 계속 돈다 — 서버가 인증 기록을 10분만 들고 있다.
              예전에는 여기서 카운트다운이 사라져서, 남은 칸을 채우다 시간을 넘긴 사람은
              가입 버튼을 눌러야 비로소 실패를 알았다. */}
          {verifiedExpiresAt ? (
            <span className="hc-button-secondary shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums">
              {formatRemainingTime(verifiedRemainingSeconds)} 안에 가입
            </span>
          ) : null}
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
              id="email-code"
              name="code"
              aria-label="인증 코드"
              aria-invalid={Boolean(codeError)}
              aria-describedby={codeError ? "email-code-error" : undefined}
              value={code}
              // 대문자로 바꿔 담는 것은 보이기용이 아니라 보내는 값 자체다. CSS 로만 대문자로
              // 보이게 하면 소문자로 친 사람은 화면엔 맞게 보이는데 서버엔 다른 값이 간다.
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="인증 코드 입력"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              autoCorrect="off"
              spellCheck={false}
              maxLength={6}
              className="hc-input h-11 min-w-0 flex-1 rounded-xl border px-3.5 font-mono text-[14px] tracking-[0.12em] placeholder:font-sans placeholder:tracking-normal disabled:opacity-50"
            />

            {showVerify ? (
              <button
                type="button"
                disabled={isVerifying || !code.trim()}
                onClick={async () => {
                  await onVerify(email.trim(), code.trim());
                }}
                className="hc-accent-chip inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-4 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                <BadgeCheck size={14} />
                <span>{isVerifying ? "확인 중…" : "인증 확인"}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isSending}
                onClick={async () => {
                  await onSend(email.trim());
                }}
                className="hc-button-secondary inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-4 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Mail size={14} />
                <span>{sendButtonLabel}</span>
              </button>
            )}
          </div>

          {codeError ? (
            <p id="email-code-error" role="alert" className="text-[12px] text-[color:var(--hc-danger)]">
              {codeError}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
