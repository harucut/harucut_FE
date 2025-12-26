"use client";

import { useCallback, useMemo, useState } from "react";
import { sendEmailAuthCode, verifyEmailAuthCode } from "@/lib/auth/authApi";
import { validateEmail } from "@/lib/authValidation";

export function useEmailVerification() {
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const isEmailVerified = useMemo(
    () => Boolean(verifiedEmail),
    [verifiedEmail]
  );

  const sendCode = useCallback(async (email: string) => {
    const err = validateEmail(email);
    if (err) {
      setEmailError(err);
      return false;
    }

    setEmailError(null);
    setCodeError(null);
    setIsSendingCode(true);
    try {
      await sendEmailAuthCode(email.trim());
      return true;
    } catch (e) {
      console.error(e);
      setEmailError(
        "인증 코드를 전송하지 못했어요. 잠시 후 다시 시도해 주세요."
      );
      return false;
    } finally {
      setIsSendingCode(false);
    }
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    const err = validateEmail(email);
    if (err) {
      setEmailError(err);
      return false;
    }
    if (!code.trim()) {
      setCodeError("인증 코드를 입력해 주세요.");
      return false;
    }

    setEmailError(null);
    setCodeError(null);
    setIsVerifyingCode(true);
    try {
      await verifyEmailAuthCode(email.trim(), code.trim());
      setVerifiedEmail(email.trim());
      return true;
    } catch (e) {
      console.error(e);
      setCodeError("인증 코드가 올바르지 않아요.");
      return false;
    } finally {
      setIsVerifyingCode(false);
    }
  }, []);

  const reset = useCallback(() => {
    setVerifiedEmail(null);
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

    sendCode,
    verifyCode,
    reset,
  };
}
