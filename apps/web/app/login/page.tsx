"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthField } from "@/components/auth/AuthField";
import { SocialLoginSection } from "@/components/auth/SocialLoginSection";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { GuestTrialStartButton } from "@/components/guest/GuestTrialStartButton";
import { LOGIN_FIELDS } from "@/components/auth/authFields";
import { validateEmail, validatePassword } from "@/lib/authValidation";
import { loginWithEmail, reactivateAccount } from "@/lib/auth/authApi";
import { useRedirectIfAuthenticated } from "@/hooks/useRedirectIfAuthenticated";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { clientApi } from "@/lib/clientApi";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import {
  buildPathWithRedirect,
  getSafeRedirectPath,
  resolveRedirectTarget,
} from "@/lib/redirect";
import type { AuthFieldName } from "@/components/auth/authFields";

type LoginFieldName = Extract<AuthFieldName, "email" | "password">;

type LoginErrors = Partial<Record<LoginFieldName, string | null>> & {
  common?: string | null;
};

function LoginPageContent() {
  const searchParams = useSearchParams();
  const redirectTo = getSafeRedirectPath(searchParams.get("redirectTo"));
  const redirectTarget = resolveRedirectTarget(redirectTo);
  const signupHref = buildPathWithRedirect("/signup", redirectTo);
  const forgotPasswordHref = buildPathWithRedirect(
    "/forgot-password",
    redirectTo,
  );

  useRedirectIfAuthenticated(redirectTarget);
  const exitGuestMode = useGuestTrialStore((state) => state.exitGuestMode);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    const nextErrors: LoginErrors = {};
    const emailError = validateEmail(email);
    if (emailError) nextErrors.email = emailError;

    const passwordError = validatePassword(password);
    if (passwordError) nextErrors.password = passwordError;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setIsSubmitting(false);
      return;
    }

    try {
      const loginData = await loginWithEmail(email, password);

      if (loginData?.userStatus === "DELETED_REQUESTED") {
        const shouldReactivate = window.confirm(
          "회원 탈퇴 요청 상태예요. 탈퇴를 취소하고 계속 로그인할까요?",
        );

        if (!shouldReactivate) {
          await clientApi.delete("/api/client/logout").catch(() => undefined);
          setErrors({
            common: "탈퇴 취소 후 다시 로그인할 수 있어요.",
          });
          return;
        }

        try {
          await reactivateAccount();
        } catch (reactivateError) {
          console.error(reactivateError);
          await clientApi.delete("/api/client/logout").catch(() => undefined);
          setErrors({
            common: "탈퇴 취소에 실패했어요. 잠시 후 다시 시도해 주세요.",
          });
          return;
        }
      }

      exitGuestMode();
      window.location.href = redirectTarget;
    } catch (error) {
      console.error(error);
      // 실패 원인은 하나가 아니다 — 가입되지 않은 계정(AUTH-020), 이메일 미인증(AUTH-004),
      // 탈퇴한 계정(AUTH-006), 네트워크 장애까지 전부 "비밀번호가 틀렸다"로 말하면
      // 사용자는 맞는 비밀번호를 계속 다시 친다. 서버 코드에 맞는 문구를 쓴다.
      setErrors({
        common: getUserFacingApiErrorMessage(
          error,
          "이메일 또는 비밀번호가 올바르지 않아요.",
        ),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPageShell
      title="로그인"
      footer={
        <>
          <SocialLoginSection mode="login" redirectTo={redirectTo} />
          <p className="mt-2 text-center text-[14px] text-[color:var(--hc-muted)]">
            아직 계정이 없으신가요?{" "}
            <Link
              href={signupHref}
              className="font-medium text-[color:var(--hc-primary-strong)] underline underline-offset-4"
            >
              회원가입
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {errors.common ? (
          <p role="alert" className="rounded-xl border border-[color:var(--hc-danger-border)] bg-[color:var(--hc-danger-soft-bg)] px-3 py-2 text-[11px] text-[color:var(--hc-danger)]">
            {errors.common}
          </p>
        ) : null}

        {LOGIN_FIELDS.map((field) => (
          <AuthField
            key={field.id}
            id={field.id}
            name={field.name}
            type={field.type}
            label={field.label}
            autoComplete={field.autoComplete}
            placeholder={field.placeholder}
            required
            error={errors[field.name as LoginFieldName]}
          />
        ))}

        {/* 세션 지속 옵션은 백엔드 계약에 없어 '로그인 상태 유지' 체크박스를 두지 않는다. */}
        <div className="flex items-center justify-end">
          <Link
            href={forgotPasswordHref}
            // 17px 높이라 손가락으로 눌리지 않았다. 시각 크기는 그대로 두고 누를 면만 넓힌다.
            className="inline-flex min-h-[44px] items-center px-1 text-[12px] text-[color:var(--hc-muted)] underline underline-offset-4 transition hover:text-[color:var(--hc-text)]"
          >
            비밀번호 찾기
          </Link>
        </div>

        {/* 아래 소셜 버튼과 같은 h-12 알약이다. 예전에는 이쪽만 py-2.5(약 38px)·text-xs 라
            같은 화면에서 버튼 높이와 글자 크기가 두 종류로 갈렸다. */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="hc-button-primary inline-flex h-12 items-center justify-center rounded-full text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting ? "로그인 중..." : "로그인"}
        </button>

        {/* 비회원 체험 — 로그인 바로 아래. 가입 없이 촬영·꾸미기를 먼저 체험할 수 있게. */}
        <GuestTrialStartButton className="inline-flex h-12 items-center justify-center rounded-full border border-[color:var(--hc-border)] text-[15px] font-bold text-[color:var(--hc-text)] transition hover:border-[color:var(--hc-border-strong)]">
          비회원 체험하기
        </GuestTrialStartButton>
      </form>
    </AuthPageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
