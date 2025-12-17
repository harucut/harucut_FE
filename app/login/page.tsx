"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthField } from "@/components/auth/AuthField";
import { validateEmail, validatePassword } from "@/lib/authValidation";
import { api } from "@/lib/api";
import { SocialLoginSection } from "@/components/auth/SocialLoginSection";

type LoginErrors = {
  email?: string | null;
  password?: string | null;
  common?: string | null;
};

const loginFields = [
  {
    id: "email",
    name: "email",
    type: "email",
    label: "이메일",
    autoComplete: "email",
    placeholder: "you@example.com",
  },
  {
    id: "password",
    name: "password",
    type: "password",
    label: "비밀번호",
    autoComplete: "current-password",
    placeholder: "비밀번호를 입력해 주세요",
  },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");

    const newErrors: LoginErrors = {};
    const emailError = validateEmail(email);
    if (emailError) newErrors.email = emailError;

    const passwordError = validatePassword(password);
    if (passwordError) newErrors.password = passwordError;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await api.post("/api/recorday/login", {
        email,
        password,
      });

      const { accessToken, refreshToken } = res.data.data;

      const accessExpires = new Date(Date.now() + 60 * 60 * 1000).toUTCString();
      const refreshExpires = new Date(
        Date.now() + 14 * 24 * 60 * 60 * 1000
      ).toUTCString();

      // 개발 환경에서는 Secure X
      // 배포 환경에서는 Secure; SameSite=Strict
      document.cookie = `accessToken=${encodeURIComponent(
        accessToken
      )}; Path=/; Expires=${accessExpires}; SameSite=Lax`;
      document.cookie = `refreshToken=${encodeURIComponent(
        refreshToken
      )}; Path=/; Expires=${refreshExpires}; SameSite=Lax`;

      router.push("/home");
    } catch (error) {
      console.error(error);
      const msg = "로그인에 실패했습니다. 이메일/비밀번호를 확인해 주세요.";
      setErrors({ common: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
        <header className="flex flex-col gap-1">
          <Link
            href="/"
            className="text-[11px] font-medium tracking-[0.16em] text-zinc-500"
          >
            RECORDAY
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">
            로그인하고 기록 이어보기
          </h1>
          <p className="text-[11px] text-zinc-400">
            다른 기기에서도 인생네컷 기록을 이어서 보고 싶다면
            <br />
            계정을 만들어 두는 걸 추천드려요.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
        >
          {loginFields.map((field) => (
            <AuthField
              key={field.id}
              id={field.id}
              name={field.name}
              type={field.type}
              label={field.label}
              autoComplete={field.autoComplete}
              placeholder={field.placeholder}
              required
              error={errors[field.name as keyof LoginErrors]}
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

          {errors.common && (
            <p className="text-[10px] text-red-400">{errors.common}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 inline-flex h-9 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {isSubmitting ? "로그인 중..." : "이메일로 로그인"}
          </button>
        </form>

        <SocialLoginSection mode="login" />
        <p className="text-center text-[11px] text-zinc-400">
          아직 계정이 없다면{" "}
          <Link
            href="/signup"
            className="font-medium text-emerald-400 underline underline-offset-4"
          >
            회원가입
          </Link>
        </p>
      </div>
    </main>
  );
}
