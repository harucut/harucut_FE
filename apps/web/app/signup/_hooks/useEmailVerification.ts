"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { sendEmailAuthCode, verifyEmailAuthCode } from "@/lib/auth/authApi";
import { validateEmail } from "@/lib/authValidation";

/** 코드가 유효한 시간. 메일에도 "발송 시점부터 5분간 유효합니다"라고 적혀 나간다. */
const VERIFICATION_WINDOW_MS = 5 * 60 * 1000;

/**
 * 인증을 마친 상태가 서버에서 유지되는 시간.
 *
 * 코드 5분과는 별개의 시계다. 서버는 인증에 성공하면 Redis 에 `email:verified:<이메일>` 을
 * `VERIFIED` 로 넣고 **TTL 10분**을 건다(로컬 백엔드에서 실측: 인증 직후 TTL 599초).
 * 그 키가 사라진 뒤 가입을 시도하면 `AUTH-004`(400, "Failed to register email.")가 돌아온다.
 *
 * 예전에는 이 시계를 화면이 몰랐다. 인증을 마치면 카운트다운이 사라지고 "인증 완료"만 남아서,
 * 비밀번호·닉네임을 채우다 10분을 넘긴 사람은 가입 버튼을 눌러야 비로소 실패를 알았다.
 * 이제 남은 시간을 계속 보여 주고, 지나면 인증 상태를 스스로 풀어 다시 받게 한다.
 *
 * 서버보다 조금 일찍 끊는다 — 시계가 정확히 같을 수 없어서, 아슬아슬하게 통과한 요청이
 * 서버에서 거절되는 쪽이 더 나쁘다.
 */
const VERIFIED_WINDOW_MS = 10 * 60 * 1000;
const VERIFIED_SAFETY_MS = 15 * 1000;

/**
 * 유효시간이 지났을 때의 안내. 세 곳에서 같은 상황을 만난다 —
 * 시계가 다 돌았을 때, 제출 직전 검사, 그리고 서버가 AUTH-004 를 돌려줬을 때.
 * 같은 일에 다른 문구를 쓰지 않도록 한 곳에 둔다.
 */
export const VERIFICATION_EXPIRED_MESSAGE =
  "인증 유효시간이 지났어요. 인증을 다시 받아 주세요.";

export function useEmailVerification() {
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [verifiedExpiresAt, setVerifiedExpiresAt] = useState<number | null>(null);
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const isEmailVerified = useMemo(() => Boolean(verifiedEmail), [verifiedEmail]);

  const sendCode = useCallback(async (email: string) => {
    const normalizedEmail = email.trim();
    const err = validateEmail(normalizedEmail);

    if (err) {
      setEmailError(err);
      return false;
    }

    setEmailError(null);
    setCodeError(null);
    setIsSendingCode(true);

    try {
      await sendEmailAuthCode(normalizedEmail);
      setSentEmail(normalizedEmail);
      setCodeExpiresAt(Date.now() + VERIFICATION_WINDOW_MS);
      setEmailCode("");
      return true;
    } catch (error) {
      console.error(error);
      setEmailError("인증 코드를 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
      return false;
    } finally {
      setIsSendingCode(false);
    }
  }, []);

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      const normalizedEmail = email.trim();
      const normalizedCode = code.trim();
      const err = validateEmail(normalizedEmail);

      if (err) {
        setEmailError(err);
        return false;
      }

      if (!sentEmail || !codeExpiresAt) {
        setCodeError("먼저 인증 코드를 보내 주세요.");
        return false;
      }

      if (sentEmail !== normalizedEmail) {
        setCodeError("이메일이 변경되었어요. 인증 코드를 다시 보내 주세요.");
        return false;
      }

      if (Date.now() >= codeExpiresAt) {
        setCodeError("인증 시간이 만료되었어요. 코드를 다시 보내 주세요.");
        return false;
      }

      if (!normalizedCode) {
        setCodeError("인증 코드를 입력해 주세요.");
        return false;
      }

      setEmailError(null);
      setCodeError(null);
      setIsVerifyingCode(true);

      try {
        await verifyEmailAuthCode(normalizedEmail, normalizedCode);
        setVerifiedEmail(normalizedEmail);
        setVerifiedExpiresAt(Date.now() + VERIFIED_WINDOW_MS - VERIFIED_SAFETY_MS);
        return true;
      } catch (error) {
        console.error(error);
        setCodeError("인증 코드가 올바르지 않아요.");
        return false;
      } finally {
        setIsVerifyingCode(false);
      }
    },
    [codeExpiresAt, sentEmail],
  );

  const handleEmailChange = useCallback(
    (nextEmail: string) => {
      const normalizedNextEmail = nextEmail.trim();

      setEmailError(null);
      setCodeError(null);

      if (sentEmail && normalizedNextEmail !== sentEmail) {
        setSentEmail(null);
        setCodeExpiresAt(null);
        setEmailCode("");
      }

      if (verifiedEmail && normalizedNextEmail !== verifiedEmail) {
        setVerifiedEmail(null);
        setVerifiedExpiresAt(null);
      }
    },
    [sentEmail, verifiedEmail],
  );

  /**
   * 인증 유효시간이 지나면 스스로 푼다.
   *
   * 서버 키가 사라진 뒤에도 화면이 "인증 완료"로 남아 있으면, 사용자는 가입 버튼을 눌러
   * AUTH-004 를 받고 나서야 알게 된다. 그 전에 화면이 먼저 알려 준다.
   */
  useEffect(() => {
    if (!verifiedExpiresAt) return;

    const expire = () => {
      setVerifiedEmail(null);
      setVerifiedExpiresAt(null);
      setEmailError(VERIFICATION_EXPIRED_MESSAGE);
    };

    const remaining = verifiedExpiresAt - Date.now();
    if (remaining <= 0) {
      expire();
      return;
    }

    const timeoutId = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(timeoutId);
  }, [verifiedExpiresAt]);

  const reset = useCallback(() => {
    setVerifiedEmail(null);
    setVerifiedExpiresAt(null);
    setSentEmail(null);
    setCodeExpiresAt(null);
    setEmailCode("");
    setIsSendingCode(false);
    setIsVerifyingCode(false);
    setEmailError(null);
    setCodeError(null);
  }, []);

  return {
    verifiedEmail,
    verifiedExpiresAt,
    isEmailVerified,
    emailCode,
    setEmailCode,
    isSendingCode,
    isVerifyingCode,
    emailError,
    codeError,
    codeExpiresAt,
    sendCode,
    verifyCode,
    handleEmailChange,
    reset,
  };
}
