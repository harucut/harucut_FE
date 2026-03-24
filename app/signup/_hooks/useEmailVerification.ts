"use client";

import { useCallback, useMemo, useState } from "react";
import { sendEmailAuthCode, verifyEmailAuthCode } from "@/lib/auth/authApi";
import { validateEmail } from "@/lib/authValidation";

const VERIFICATION_WINDOW_MS = 5 * 60 * 1000;

export function useEmailVerification() {
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
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
      }
    },
    [sentEmail, verifiedEmail],
  );

  const reset = useCallback(() => {
    setVerifiedEmail(null);
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
