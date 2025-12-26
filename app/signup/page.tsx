"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { AuthField } from "@/components/auth/AuthField";
import { SocialLoginSection } from "@/components/auth/SocialLoginSection";
import {
  SIGNUP_BASE_FIELDS,
  type AuthFieldName,
} from "@/components/auth/authFields";

import {
  validateEmail,
  validatePassword,
  validateUsername,
} from "@/lib/authValidation";
import { signupWithEmail } from "@/lib/auth/authApi";
import { useEmailVerification } from "./_hooks/useEmailVerification";
import { EmailCodeSection } from "@/components/auth/EmailCodeSection";

type SignupFieldName = Extract<
  AuthFieldName,
  "email" | "password" | "confirmPassword" | "username"
>;

type SignupErrors = Partial<Record<SignupFieldName, string | null>> & {
  common?: string | null;
};

export default function SignupPage() {
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [email, setEmail] = useState("");

  const emailVerification = useEmailVerification();

  const emailLocked = useMemo(
    () =>
      emailVerification.isEmailVerified &&
      Boolean(emailVerification.verifiedEmail),
    [emailVerification.isEmailVerified, emailVerification.verifiedEmail]
  );

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    const formData = new FormData(e.currentTarget);

    const emailFromState = email.trim();
    const verifiedEmail = (emailVerification.verifiedEmail ?? "").trim();

    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    const username = String(formData.get("username") || "").trim();

    const nextErrors: SignupErrors = {};

    const emailError = validateEmail(email);
    if (emailError) nextErrors.email = emailError;

    const passwordError = validatePassword(password);
    if (passwordError) nextErrors.password = passwordError;

    if (!confirmPassword) {
      nextErrors.confirmPassword = "비밀번호 확인을 입력해 주세요.";
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = "비밀번호가 일치하지 않습니다.";
    }

    const usernameError = validateUsername(username);
    if (usernameError) nextErrors.username = usernameError;

    if (!emailVerification.isEmailVerified) {
      nextErrors.email = "이메일 인증을 완료해 주세요.";
    } else if (verifiedEmail !== emailFromState) {
      nextErrors.email = "인증한 이메일과 입력한 이메일이 달라요.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setIsSubmitting(false);
      return;
    }

    try {
      await signupWithEmail({
        email: verifiedEmail || emailFromState,
        password,
        username,
      });
      router.push("/login");
    } catch (error) {
      console.error(error);
      setErrors({
        common: "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPageShell
      title="회원가입"
      description="이메일 인증 후 계정을 만들 수 있어요."
      footer={
        <>
          <SocialLoginSection mode="signup" />
          <p className="text-center text-[11px] text-zinc-400 mt-2">
            이미 계정이 있다면{" "}
            <Link
              href="/login"
              className="font-medium text-emerald-400 underline underline-offset-4"
            >
              로그인
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {errors.common ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
            {errors.common}
          </p>
        ) : null}

        <EmailCodeSection
          email={email}
          setEmail={setEmail}
          code={emailVerification.emailCode}
          setCode={emailVerification.setEmailCode}
          emailLocked={emailLocked}
          isSending={emailVerification.isSendingCode}
          isVerifying={emailVerification.isVerifyingCode}
          isVerified={emailVerification.isEmailVerified}
          emailError={errors.email ?? emailVerification.emailError}
          codeError={emailVerification.codeError}
          onSend={emailVerification.sendCode}
          onVerify={emailVerification.verifyCode}
          verifiedText="이메일 인증 완료!"
        />

        {/* 비밀번호 */}
        {SIGNUP_BASE_FIELDS.map((field) => (
          <AuthField
            key={field.id}
            id={field.id}
            name={field.name}
            type={field.type}
            label={field.label}
            placeholder={field.placeholder}
            autoComplete={field.autoComplete}
            required
            error={errors[field.name]}
          />
        ))}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-emerald-500 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "가입 중..." : "회원가입"}
        </button>
      </form>
    </AuthPageShell>
  );
}
