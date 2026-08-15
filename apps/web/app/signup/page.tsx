"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { AuthField } from "@/components/auth/AuthField";
import { SocialLoginSection } from "@/components/auth/SocialLoginSection";
import {
  SIGNUP_BASE_FIELDS,
  type AuthFieldName,
} from "@/components/auth/authFields";
import { EmailCodeSection } from "@/components/auth/EmailCodeSection";
import {
  validateEmail,
  validatePassword,
  validateUsername,
} from "@/lib/authValidation";
import { signupWithEmail } from "@/lib/auth/authApi";
import { useRedirectIfAuthenticated } from "@/hooks/useRedirectIfAuthenticated";
import {
  buildPathWithRedirect,
  getSafeRedirectPath,
  resolveRedirectTarget,
} from "@/lib/redirect";
import { useEmailVerification } from "./_hooks/useEmailVerification";

type SignupFieldName = Extract<
  AuthFieldName,
  "email" | "password" | "confirmPassword" | "username"
>;

type SignupErrors = Partial<Record<SignupFieldName, string | null>> & {
  common?: string | null;
  consent?: string | null;
};

const CONSENT_ITEMS = [
  { href: "/terms", key: "terms", label: "서비스 이용약관 동의", required: true },
  {
    href: "/privacy",
    key: "privacy",
    label: "개인정보 수집·이용 동의",
    required: true,
  },
  {
    href: "/privacy",
    key: "marketing",
    label: "마케팅 정보 수신 동의",
    required: false,
  },
] as const;

type ConsentKey = (typeof CONSENT_ITEMS)[number]["key"];

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = getSafeRedirectPath(searchParams.get("redirectTo"));
  const redirectTarget = resolveRedirectTarget(redirectTo);
  const loginHref = buildPathWithRedirect("/login", redirectTo);

  useRedirectIfAuthenticated(redirectTarget);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [email, setEmail] = useState("");
  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>({
    privacy: false,
    terms: false,
    marketing: false,
  });

  const emailVerification = useEmailVerification();

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

    const emailError = validateEmail(emailFromState);
    if (emailError) nextErrors.email = emailError;

    const passwordError = validatePassword(password);
    if (passwordError) nextErrors.password = passwordError;

    if (!confirmPassword) {
      nextErrors.confirmPassword = "비밀번호 확인을 입력해 주세요.";
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = "비밀번호가 서로 일치하지 않습니다.";
    }

    const usernameError = validateUsername(username);
    if (usernameError) nextErrors.username = usernameError;

    if (!emailVerification.isEmailVerified) {
      nextErrors.email = "이메일 인증을 완료해 주세요.";
    } else if (verifiedEmail !== emailFromState) {
      nextErrors.email = "인증한 이메일과 현재 입력한 이메일이 달라요.";
    }

    if (!consents.terms || !consents.privacy) {
      nextErrors.consent =
        "서비스 이용약관과 개인정보 수집·이용에 동의해야 가입할 수 있어요.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setIsSubmitting(false);
      return;
    }

    try {
      // 마케팅 수신 동의(consents.marketing)는 UI/법적 고지용으로 수집한다.
      // 백엔드 register 계약(email·username·password)에 동의 필드가 아직 없어 전송하지 않는다.
      await signupWithEmail({
        email: verifiedEmail || emailFromState,
        password,
        username,
      });
      router.push(loginHref);
    } catch (error) {
      console.error(error);
      setErrors({
        common: "회원가입에 실패했어요. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPageShell
      title="회원가입"
      footer={
        <>
          <SocialLoginSection mode="signup" redirectTo={redirectTo} />
          <p className="mt-2 text-center text-[10px] leading-5 text-zinc-500">
            소셜 계정으로 가입하면{" "}
            <Link href="/terms" target="_blank" rel="noreferrer" className="underline underline-offset-4">
              서비스 이용약관
            </Link>
            과{" "}
            <Link href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-4">
              개인정보 처리방침
            </Link>
            에 동의하는 것으로 간주됩니다.
          </p>
          <p className="mt-2 text-center text-[14px] text-[color:var(--hc-muted)]">
            이미 계정이 있으신가요?{" "}
            <Link
              href={loginHref}
              className="font-medium text-[color:var(--hc-primary)] underline underline-offset-4"
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
          onEmailChange={emailVerification.handleEmailChange}
          code={emailVerification.emailCode}
          setCode={emailVerification.setEmailCode}
          isSending={emailVerification.isSendingCode}
          isVerifying={emailVerification.isVerifyingCode}
          isVerified={emailVerification.isEmailVerified}
          codeExpiresAt={emailVerification.codeExpiresAt}
          emailError={errors.email ?? emailVerification.emailError}
          codeError={emailVerification.codeError}
          onSend={emailVerification.sendCode}
          onVerify={emailVerification.verifyCode}
          verifiedText="이메일 인증이 완료되었어요."
        />

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

        <fieldset className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <legend className="sr-only">약관 동의</legend>
          {CONSENT_ITEMS.map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-2 text-[12px] text-zinc-300"
            >
              <input
                type="checkbox"
                checked={consents[item.key]}
                onChange={(e) =>
                  setConsents((current) => ({
                    ...current,
                    [item.key]: e.target.checked,
                  }))
                }
                className="h-4 w-4 accent-[color:var(--hc-primary)]"
              />
              <span>
                <span
                  className={
                    item.required
                      ? "text-[color:var(--hc-primary)]"
                      : "text-zinc-500"
                  }
                >
                  {item.required ? "[필수]" : "[선택]"}
                </span>{" "}
                {item.label}
              </span>
              <Link
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="ml-auto shrink-0 text-[11px] text-zinc-500 underline underline-offset-4"
              >
                보기
              </Link>
            </label>
          ))}
          {errors.consent ? (
            <p className="text-[11px] text-red-300">{errors.consent}</p>
          ) : null}
        </fieldset>

        <button
          type="submit"
          disabled={isSubmitting}
          className="hc-button-primary rounded-full py-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting ? "가입 중..." : "회원가입"}
        </button>
      </form>
    </AuthPageShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}
