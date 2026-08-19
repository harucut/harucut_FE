"use client";

import { useCallback, useMemo, useState } from "react";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { validateEmail, validatePassword } from "@/lib/authValidation";
import {
  requestPasswordResetCode,
  resetPassword,
  verifyPasswordResetCode,
} from "@/lib/auth/passwordResetApi";

const VERIFICATION_WINDOW_MS = 5 * 60 * 1000;

export type Step = "VERIFY_CODE" | "RESET_PASSWORD";

export type Errors = {
  email?: string | null;
  code?: string | null;
  newPassword?: string | null;
  confirmPassword?: string | null;
  common?: string | null;
};

export function useForgotPasswordFlow() {
  const [step, setStep] = useState<Step>("VERIFY_CODE");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [emailLocked, setEmailLocked] = useState(false);

  const description = useMemo(() => {
    if (step === "VERIFY_CODE") {
      return "가입한 이메일로 받은 인증 코드를 입력해 주세요.";
    }

    return "새 비밀번호를 설정해 주세요.";
  }, [step]);

  const sendCode = useCallback(async () => {
    setErrors({});
    setIsSubmitting(true);

    const normalizedEmail = email.trim();
    const emailError = validateEmail(normalizedEmail);

    if (emailError) {
      setErrors({ email: emailError });
      setIsSubmitting(false);
      return false;
    }

    try {
      await requestPasswordResetCode(normalizedEmail);
      setEmailLocked(true);
      setCode("");
      setCodeExpiresAt(Date.now() + VERIFICATION_WINDOW_MS);
      return true;
    } catch (error) {
      console.error(error);
      // 가입되지 않은 계정(AUTH-020), 소셜 전용 계정, 재요청 쿨다운(AUTH-040, 429)이
      // 전부 이 한 문장으로 뭉개지고 있었다. 서버 코드에 맞는 문구를 우선한다.
      setErrors({
        common: getUserFacingApiErrorMessage(
          error,
          "인증 코드를 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
        ),
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [email]);

  const verifyCode = useCallback(async () => {
    setErrors({});
    setIsSubmitting(true);

    const normalizedEmail = email.trim();
    const normalizedCode = code.trim();
    const emailError = validateEmail(normalizedEmail);

    if (emailError) {
      setErrors({ email: emailError });
      setIsSubmitting(false);
      return false;
    }

    if (!codeExpiresAt) {
      setErrors({ code: "먼저 인증 코드를 받아 주세요." });
      setIsSubmitting(false);
      return false;
    }

    if (Date.now() >= codeExpiresAt) {
      setErrors({ code: "인증 시간이 만료되었어요. 코드를 다시 보내 주세요." });
      setIsSubmitting(false);
      return false;
    }

    if (!normalizedCode) {
      setErrors({ code: "인증 코드를 입력해 주세요." });
      setIsSubmitting(false);
      return false;
    }

    try {
      const token = await verifyPasswordResetCode(normalizedEmail, normalizedCode);
      setResetToken(token);
      setCodeExpiresAt(null);
      setStep("RESET_PASSWORD");
      return true;
    } catch (error) {
      console.error(error);
      setErrors({
        common: getUserFacingApiErrorMessage(
          error,
          "인증에 실패했어요. 이메일과 코드를 다시 확인해 주세요.",
        ),
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [code, codeExpiresAt, email]);

  const submitNewPassword = useCallback(async () => {
    setErrors({});
    setIsSubmitting(true);

    if (!resetToken) {
      setErrors({
        common: "인증 정보가 없어요. 처음부터 다시 진행해 주세요.",
      });
      setIsSubmitting(false);
      return false;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setErrors({ newPassword: passwordError });
      setIsSubmitting(false);
      return false;
    }

    if (!confirmPassword) {
      setErrors({ confirmPassword: "새 비밀번호 확인을 입력해 주세요." });
      setIsSubmitting(false);
      return false;
    }

    if (newPassword !== confirmPassword) {
      setErrors({ confirmPassword: "비밀번호가 서로 일치하지 않아요." });
      setIsSubmitting(false);
      return false;
    }

    try {
      await resetPassword(resetToken, newPassword);
      return true;
    } catch (error) {
      console.error(error);
      setErrors({
        common: getUserFacingApiErrorMessage(
          error,
          "비밀번호 변경에 실패했어요. 잠시 후 다시 시도해 주세요.",
        ),
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [confirmPassword, newPassword, resetToken]);

  const restart = useCallback(() => {
    setStep("VERIFY_CODE");
    setErrors({});
    setIsSubmitting(false);
    setEmail("");
    setCode("");
    setResetToken(null);
    setCodeExpiresAt(null);
    setNewPassword("");
    setConfirmPassword("");
    setEmailLocked(false);
  }, []);

  return {
    step,
    description,
    isSubmitting,
    errors,

    email,
    setEmail,
    code,
    setCode,
    emailLocked,
    codeExpiresAt,

    sendCode,
    verifyCode,

    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    submitNewPassword,

    restart,
  };
}
