"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AuthField } from "@/components/auth/AuthField";
import { SocialLoginSection } from "@/components/auth/SocialLoginSection";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { LOGIN_FIELDS } from "@/components/auth/authFields";
import { validateEmail, validatePassword } from "@/lib/authValidation";
import { loginWithEmail, reactivateAccount } from "@/lib/auth/authApi";
import { useRedirectIfAuthenticated } from "@/hooks/useRedirectIfAuthenticated";
import { clientApi } from "@/lib/clientApi";
import type { AuthFieldName } from "@/components/auth/authFields";

type LoginFieldName = Extract<AuthFieldName, "email" | "password">;

type LoginErrors = Partial<Record<LoginFieldName, string | null>> & {
  common?: string | null;
};

export default function LoginPage() {
  useRedirectIfAuthenticated();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    const newErrors: LoginErrors = {};
    const emailError = validateEmail(email);
    if (emailError) newErrors.email = emailError;

    const passwordError = validatePassword(password);
    if (passwordError) newErrors.password = passwordError;

    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      setIsSubmitting(false);
      return;
    }

    try {
      const loginData = await loginWithEmail(email, password);

      if (loginData?.userStatus === "DELETED_REQUESTED") {
        const shouldReactivate = window.confirm(
          "회원 탈퇴 요청 상태입니다. 탈퇴를 취소하고 계속 로그인할까요?",
        );

        if (!shouldReactivate) {
          await clientApi.delete("/api/client/logout").catch(() => undefined);
          setErrors({
            common: "회원 탈퇴 취소를 선택해야 다시 로그인할 수 있습니다.",
          });
          return;
        }

        try {
          await reactivateAccount();
        } catch (reactivateError) {
          console.error(reactivateError);
          await clientApi.delete("/api/client/logout").catch(() => undefined);
          setErrors({
            common: "회원 탈퇴 취소에 실패했습니다. 다시 시도해 주세요.",
          });
          return;
        }
      }

      window.location.href = "/home";
    } catch (error) {
      console.error(error);
      setErrors({
        common: "로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPageShell
      title="로그인"
      description="harucut에서 오늘의 기록을 이어서 확인해요."
      footer={
        <>
          <SocialLoginSection mode="login" />
          <p className="text-center text-[11px] text-zinc-400 mt-2">
            아직 계정이 없다면{" "}
            <Link
              href="/signup"
              className="font-medium text-emerald-400 underline underline-offset-4"
            >
              회원가입
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

        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              name="remember"
              className="h-3 w-3 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-0"
            />
            <span>로그인 상태 유지</span>
          </label>

          <Link
            href="/forgot-password"
            className="text-[10px] text-zinc-400 hover:text-zinc-200"
          >
            비밀번호 찾기
          </Link>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-emerald-500 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </AuthPageShell>
  );
}
