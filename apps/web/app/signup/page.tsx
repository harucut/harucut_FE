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
import {
  getApiErrorDetails,
  getUserFacingApiErrorMessage,
} from "@/lib/apiError";
import { useRedirectIfAuthenticated } from "@/hooks/useRedirectIfAuthenticated";
import {
  buildPathWithRedirect,
  getSafeRedirectPath,
  resolveRedirectTarget,
} from "@/lib/redirect";
import { useActiveTerms } from "@/hooks/useActiveTerms";
import { TermsConsentFieldset } from "@/components/terms/TermsConsentFieldset";
import { setPendingTermsConsent } from "@/lib/pendingTermsConsent";
import {
  useEmailVerification,
  VERIFICATION_EXPIRED_MESSAGE,
} from "./_hooks/useEmailVerification";

type SignupFieldName = Extract<
  AuthFieldName,
  "email" | "password" | "confirmPassword" | "username"
>;

type SignupErrors = Partial<Record<SignupFieldName, string | null>> & {
  common?: string | null;
  consent?: string | null;
};

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
  // 어떤 약관이 있고 무엇이 필수인지는 **서버가 정한다**(관리자가 등록한 활성 약관).
  // 코드를 여기 박아 두면 관리자가 약관을 하나 더 만든 순간 화면에서 사라진다.
  const activeTerms = useActiveTerms();
  const [consents, setConsents] = useState<Record<string, boolean>>({});

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
    } else if (
      emailVerification.verifiedExpiresAt &&
      Date.now() >= emailVerification.verifiedExpiresAt
    ) {
      // 서버는 인증 기록을 10분만 들고 있다. 지났으면 요청을 보내 봐야 AUTH-004 로 돌아오니
      // 여기서 끊는다. 유효시간이 지나면 훅이 알아서 인증을 풀지만, 탭이 뒤에 있으면
      // 타이머가 늦게 깨어날 수 있어 제출 시점에 한 번 더 본다.
      emailVerification.reset();
      nextErrors.email = VERIFICATION_EXPIRED_MESSAGE;
    }

    // 필수 약관은 서버가 표시한 것만 필수다. 목록이 바뀌어도 여기 고칠 것이 없다.
    const missingRequired = activeTerms.items.filter(
      (item) => item.required && !consents[item.code],
    );
    if (missingRequired.length > 0) {
      nextErrors.consent = `${missingRequired
        .map((item) => item.title)
        .join(", ")}에 동의해야 가입할 수 있어요.`;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setIsSubmitting(false);
      return;
    }

    // 이 동의의 주인. 보관물에 같이 넣어 로그인한 계정과 대조하게 한다.
    const signupEmail = verifiedEmail || emailFromState;

    try {
      await signupWithEmail({
        email: signupEmail,
        password,
        username,
      });

      // 동의를 여기서 바로 보낼 수는 없다. `POST /api/auth/terms/consents` 는 인증이
      // 필요한데 우리 가입은 계정만 만들고 로그인시키지 않는다. 그래서 사용자가 고른 값을
      // 가입 이메일과 함께 보관해 두고, 로그인 직후 TermsConsentBridge 가 계정을 대조한
      // 뒤 서버 장부에 기록한다.
      //
      // 보관은 **가입이 성공한 뒤에만** 한다. 요청보다 앞서 남기면 가입이 깨졌을 때 선택만
      // 기기에 남고, 다음에 이 기기에서 로그인한 다른 계정의 법적 이력으로 붙는다.
      //
      // 보관에 실패해도 가입은 그대로 진행한다 — 필수 약관은 어차피 재동의 화면이 다시 받고,
      // 여기서 막으면 사용자는 이유도 모른 채 가입이 안 되는 화면을 만난다.
      if (activeTerms.fromServer) {
        setPendingTermsConsent(
          activeTerms.items.map((item) => ({
            code: item.code,
            agreed: Boolean(consents[item.code]),
          })),
          signupEmail,
        );
      }

      router.push(loginHref);
    } catch (error) {
      console.error(error);

      // 서버가 준 코드를 버리지 않는다. 예전에는 무엇이 틀렸든 "잠시 후 다시 시도해 주세요"
      // 하나로 뭉갰는데, 원인마다 사용자가 해야 할 일이 다르다 — 이미 쓰는 이메일(AUTH-030)은
      // 다른 이메일을 써야 하고, 인증 만료(AUTH-004)는 다시 인증해야 한다. "잠시 후 다시"는
      // 둘 다에게 틀린 안내다(기다린다고 풀리지 않는다).
      const { code } = getApiErrorDetails(error);
      const message = getUserFacingApiErrorMessage(
        error,
        "회원가입에 실패했어요. 잠시 후 다시 시도해 주세요.",
      );

      if (code === "AUTH-004") {
        // 서버는 이 이메일이 인증되지 않았다고 본다. 화면만 "인증 완료"로 남겨 두면
        // 사용자는 같은 버튼을 계속 누르게 된다. 인증 상태를 풀어 다시 받게 한다.
        emailVerification.reset();
        setErrors({ email: VERIFICATION_EXPIRED_MESSAGE });
      } else if (code === "AUTH-030") {
        setErrors({ email: message });
      } else {
        setErrors({ common: message });
      }
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
          {/* 로그인 페이지의 대응 문구와 같은 토큰을 쓴다. 하드코딩 text-zinc-500 은 다크에서 어긋났다. */}
          <p className="mt-2 text-center text-[13px] leading-6 text-(--hc-muted)">
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
          <p className="mt-2 text-center text-[14px] text-(--hc-muted)">
            이미 계정이 있으신가요?{" "}
            <Link
              href={loginHref}
              className="inline-flex min-h-11 items-center px-1 font-medium text-(--hc-primary-strong) underline underline-offset-4"
            >
              로그인
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {errors.common ? (
          <p role="alert" className="rounded-xl border border-(--hc-danger-border) bg-(--hc-danger-soft-bg) px-3.5 py-2.5 text-[13px] leading-[1.6] text-(--hc-danger)">
            {errors.common}
          </p>
        ) : null}

        <EmailCodeSection
          email={email}
          setEmail={setEmail}
          // 제출에서 붙인 이메일 오류(AUTH-004·AUTH-030)는 이 폼의 state 라, 사용자가 이메일을
          // 고치거나 다시 인증해도 저절로 사라지지 않는다. 두 지점에서 직접 걷어낸다.
          onEmailChange={(next) => {
            setErrors((prev) => ({ ...prev, common: null, email: null }));
            emailVerification.handleEmailChange(next);
          }}
          code={emailVerification.emailCode}
          setCode={emailVerification.setEmailCode}
          isSending={emailVerification.isSendingCode}
          isVerifying={emailVerification.isVerifyingCode}
          isVerified={emailVerification.isEmailVerified}
          codeExpiresAt={emailVerification.codeExpiresAt}
          verifiedExpiresAt={emailVerification.verifiedExpiresAt}
          emailError={errors.email ?? emailVerification.emailError}
          codeError={emailVerification.codeError}
          onSend={emailVerification.sendCode}
          onVerify={async (verifyEmail, verifyCode) => {
            const ok = await emailVerification.verifyCode(verifyEmail, verifyCode);
            if (ok) setErrors((prev) => ({ ...prev, common: null, email: null }));
            return ok;
          }}
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

        <TermsConsentFieldset
          items={activeTerms.items}
          checked={consents}
          onToggle={(code, next) =>
            setConsents((current) => ({ ...current, [code]: next }))
          }
          error={errors.consent}
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="hc-button-ink inline-flex h-12 items-center justify-center rounded-full text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting ? "가입 중…" : "회원가입"}
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
