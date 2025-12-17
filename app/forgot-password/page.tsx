"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthField } from "@/components/auth/AuthField";
import { validateEmail } from "@/lib/authValidation";
import { api } from "@/lib/api";

type Step = "REQUEST_CODE" | "VERIFY_CODE" | "RESET_PASSWORD";

type Errors = {
  email?: string | null;
  code?: string | null;
  newPassword?: string | null;
  confirmPassword?: string | null;
  common?: string | null;
};

type ResetTokenResponse = {
  code: string;
  status: number;
  message: string | null;
  data: {
    resetToken: string;
  };
};

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("REQUEST_CODE");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const title = useMemo(() => {
    if (step === "REQUEST_CODE") return "비밀번호 재설정";
    if (step === "VERIFY_CODE") return "인증 코드 확인";
    return "새 비밀번호 설정";
  }, [step]);

  const desc = useMemo(() => {
    if (step === "REQUEST_CODE")
      return "가입한 이메일로 인증 코드를 보내드릴게요.";
    if (step === "VERIFY_CODE") return "메일로 받은 인증 코드를 입력해 주세요.";
    return "새 비밀번호를 두 번 입력해 주세요.";
  }, [step]);

  const handleRequestCode = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    const trimmed = email.trim();
    const emailError = validateEmail(trimmed);
    if (emailError) {
      setErrors({ email: emailError });
      setIsSubmitting(false);
      return;
    }

    try {
      await api.post("/api/email-auth/code", { email: trimmed });
      setStep("VERIFY_CODE");
    } catch (err) {
      console.error(err);
      setErrors({
        common: "인증 코드 전송에 실패했어요. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();

    const emailError = validateEmail(trimmedEmail);
    if (emailError) {
      setErrors({ email: emailError });
      setIsSubmitting(false);
      return;
    }

    if (!trimmedCode) {
      setErrors({ code: "인증 코드를 입력해 주세요." });
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await api.post<ResetTokenResponse>(
        "/api/recorday/reset/password/verification",
        { email: trimmedEmail, code: trimmedCode }
      );

      const token = res.data?.data?.resetToken;
      if (!token) {
        setErrors({
          common: "resetToken을 받지 못했어요. 다시 시도해 주세요.",
        });
        return;
      }

      setResetToken(token);
      setStep("RESET_PASSWORD");
    } catch (err) {
      console.error(err);
      setErrors({
        common:
          "인증에 실패했어요. 이메일/코드를 다시 확인하거나 코드를 재발급 받아주세요.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    if (!resetToken) {
      setErrors({
        common: "resetToken이 없어요. 처음부터 다시 진행해 주세요.",
      });
      setIsSubmitting(false);
      return;
    }

    const p1 = newPassword;
    const p2 = confirmPassword;

    if (!p1) {
      setErrors({ newPassword: "새 비밀번호를 입력해 주세요." });
      setIsSubmitting(false);
      return;
    }

    if (p1.length < 8) {
      setErrors({ newPassword: "비밀번호는 8자 이상으로 설정해 주세요." });
      setIsSubmitting(false);
      return;
    }

    if (p1 !== p2) {
      setErrors({ confirmPassword: "비밀번호가 서로 일치하지 않아요." });
      setIsSubmitting(false);
      return;
    }

    try {
      await api.patch("/api/recorday/reset/password", {
        resetToken,
        newPassword: p1,
      });

      alert("비밀번호가 변경되었어요. 로그인해 주세요.");
      router.push("/login");
    } catch (err) {
      console.error(err);
      setErrors({
        common:
          "비밀번호 변경에 실패했어요. 인증을 다시 진행하거나 잠시 후 재시도해 주세요.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestart = () => {
    setStep("REQUEST_CODE");
    setErrors({});
    setIsSubmitting(false);
    setCode("");
    setResetToken(null);
    setNewPassword("");
    setConfirmPassword("");
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
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-[11px] text-zinc-400">{desc}</p>
        </header>

        {step === "REQUEST_CODE" && (
          <form
            onSubmit={handleRequestCode}
            className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
          >
            <AuthField
              id="email"
              name="email"
              type="email"
              label="이메일"
              autoComplete="email"
              placeholder="user@recorday.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
            />

            {errors.common && (
              <p className="text-[10px] text-red-400">{errors.common}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 inline-flex h-9 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {isSubmitting ? "보내는 중..." : "인증 코드 보내기"}
            </button>

            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="text-zinc-400 hover:text-zinc-200"
              >
                로그인으로 돌아가기
              </button>
              <Link
                href="/signup"
                className="text-zinc-400 hover:text-zinc-200"
              >
                회원가입
              </Link>
            </div>
          </form>
        )}

        {step === "VERIFY_CODE" && (
          <form
            onSubmit={handleVerifyCode}
            className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
          >
            <AuthField
              id="email"
              name="email"
              type="email"
              label="이메일"
              autoComplete="email"
              placeholder="user@recorday.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
            />

            <AuthField
              id="code"
              name="code"
              type="text"
              label="인증 코드"
              placeholder="1A2B3C"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              error={errors.code}
            />

            {errors.common && (
              <p className="text-[10px] text-red-400">{errors.common}</p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 inline-flex h-9 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {isSubmitting ? "확인 중..." : "인증하기"}
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleRequestCode}
                className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-800 px-4 text-[11px] font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
              >
                재전송
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <button
                type="button"
                onClick={handleRestart}
                className="text-zinc-400 hover:text-zinc-200"
              >
                처음으로
              </button>
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="text-zinc-400 hover:text-zinc-200"
              >
                로그인으로
              </button>
            </div>
          </form>
        )}

        {step === "RESET_PASSWORD" && (
          <form
            onSubmit={handleResetPassword}
            className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
          >
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="text-[10px] text-zinc-400">
                인증 완료. 새 비밀번호를 설정해 주세요.
              </p>
            </div>

            <AuthField
              id="newPassword"
              name="newPassword"
              type="password"
              label="새 비밀번호"
              autoComplete="new-password"
              placeholder="새 비밀번호"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              error={errors.newPassword}
            />

            <AuthField
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              label="새 비밀번호 확인"
              autoComplete="new-password"
              placeholder="새 비밀번호 확인"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={errors.confirmPassword}
            />

            {errors.common && (
              <p className="text-[10px] text-red-400">{errors.common}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 inline-flex h-9 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {isSubmitting ? "변경 중..." : "비밀번호 변경하기"}
            </button>

            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <button
                type="button"
                onClick={handleRestart}
                className="text-zinc-400 hover:text-zinc-200"
              >
                처음부터 다시
              </button>
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="text-zinc-400 hover:text-zinc-200"
              >
                로그인으로
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
