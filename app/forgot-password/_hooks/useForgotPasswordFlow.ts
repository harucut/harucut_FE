"use client";

import { useCallback, useMemo, useState } from "react";
import { validateEmail, validatePassword } from "@/lib/authValidation";
import {
  requestPasswordResetCode,
  resetPassword,
  verifyPasswordResetCode,
} from "@/lib/auth/passwordResetApi";

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

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [emailLocked, setEmailLocked] = useState(false);

  const description = useMemo(() => {
    if (step === "VERIFY_CODE") return "가입한 이메일로 인증을 해주세요.";
    return "새 비밀번호를 두 번 입력해 주세요.";
  }, [step]);

  const sendCode = useCallback(async () => {
    setErrors({});
    setIsSubmitting(true);

    const trimmed = email.trim();
    const emailErr = validateEmail(trimmed);
    if (emailErr) {
      setErrors({ email: emailErr });
      setIsSubmitting(false);
      return false;
    }

    try {
      await requestPasswordResetCode(trimmed);
      setEmailLocked(true);
      return true;
    } catch (e) {
      console.error(e);
      setErrors({
        common: "인증 코드 전송에 실패했어요. 잠시 후 다시 시도해 주세요.",
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [email]);

  const verifyCode = useCallback(async () => {
    setErrors({});
    setIsSubmitting(true);

    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();

    const emailErr = validateEmail(trimmedEmail);
    if (emailErr) {
      setErrors({ email: emailErr });
      setIsSubmitting(false);
      return false;
    }
    if (!trimmedCode) {
      setErrors({ code: "인증 코드를 입력해 주세요." });
      setIsSubmitting(false);
      return false;
    }

    try {
      const token = await verifyPasswordResetCode(trimmedEmail, trimmedCode);
      setResetToken(token);
      setStep("RESET_PASSWORD");
      return true;
    } catch (e) {
      console.error(e);
      setErrors({
        common:
          "인증에 실패했어요. 이메일/코드를 다시 확인하거나 코드를 재발급 받아주세요.",
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [email, code]);

  const submitNewPassword = useCallback(async () => {
    setErrors({});
    setIsSubmitting(true);

    if (!resetToken) {
      setErrors({
        common: "resetToken이 없어요. 처음부터 다시 진행해 주세요.",
      });
      setIsSubmitting(false);
      return false;
    }

    const pwErr = validatePassword(newPassword);
    if (pwErr) {
      setErrors({ newPassword: pwErr });
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
    } catch (e) {
      console.error(e);
      setErrors({
        common:
          "비밀번호 변경에 실패했어요. 인증을 다시 진행하거나 잠시 후 재시도해 주세요.",
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [resetToken, newPassword, confirmPassword]);

  const restart = useCallback(() => {
    setStep("VERIFY_CODE");
    setErrors({});
    setIsSubmitting(false);
    setEmail("");
    setCode("");
    setResetToken(null);
    setNewPassword("");
    setConfirmPassword("");
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
