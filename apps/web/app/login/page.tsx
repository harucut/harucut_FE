"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { forgetStudioAccess } from "@/hooks/useStudioAccess";
import { COMPANY } from "@harucut/shared";
import { AuthField } from "@/components/auth/AuthField";
import { SocialLoginSection } from "@/components/auth/SocialLoginSection";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { GuestTrialStartButton } from "@/components/guest/GuestTrialStartButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Sentences } from "@/components/ui/Sentences";
import { LOGIN_FIELDS } from "@/components/auth/authFields";
import { validateEmail } from "@/lib/authValidation";
import { loginWithEmail, reactivateAccount } from "@/lib/auth/authApi";
import { useRedirectIfAuthenticated } from "@/hooks/useRedirectIfAuthenticated";
import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
import { SOCIAL_LOGIN_FAILED_MESSAGE } from "@/lib/authLogin";
import {
  RESTRICTED_ACCOUNT_MESSAGE,
  isUnusableUserStatus,
} from "@/lib/authUserStatus";
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
  /** 막힌 계정이라 문의처를 같이 보여 준다. */
  support?: boolean;
  /** 이메일과 비밀번호 중 어느 쪽이 틀렸는지 서버가 말하지 않는다. 두 칸을 다 빨갛게 한다. */
  credentials?: boolean;
};

function LoginPageContent() {
  const searchParams = useSearchParams();
  // 로그인 화면에 왔으면 앞 계정의 답은 믿지 않는다(세션 만료 뒤 다른 계정으로 들어오는 길도 여기를 지난다).
  useEffect(() => {
    forgetStudioAccess();
  }, []);
  const redirectTo = getSafeRedirectPath(searchParams.get("redirectTo"));
  const redirectTarget = resolveRedirectTarget(redirectTo);
  const signupHref = buildPathWithRedirect("/signup", redirectTo);
  const forgotPasswordHref = buildPathWithRedirect(
    "/forgot-password",
    redirectTo,
  );

  /*
    탈퇴 대기 계정은 로그인한 뒤 모달로 탈퇴를 취소할지 묻는다(2026-11-14).

    예전에는 로그인 직후 브라우저 확인창으로 묻고, 거절하면 「탈퇴 취소 후 다시 로그인할 수 있어요」를
    띄웠다. 소셜로 들어온 탈퇴 대기 계정은 묻는 자리가 아예 없었다 — 막힌 API 에서 이 화면으로
    돌아오기만 했다(AccountRecoveryBridge). 이제 둘 다 같은 모달이다.
    - 이메일로 로그인: 자격증명이 아직 손에 있어 복구 뒤 조용히 다시 로그인해 들어간다.
    - 이미 있던 세션(소셜 등): 복구해도 지금 토큰은 옛 상태라 쓸 수 없고 재발급도 막힌다(아래 주석).
      로그아웃하고 다시 로그인해 달라고 말한다.
    탈퇴를 그대로 두면(로그아웃) 아무 문구도 남기지 않는다 — 스스로 고른 것이다.
  */
  const [recovery, setRecovery] = useState<{ email: string; password: string } | "session" | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveredNotice, setRecoveredNotice] = useState(false);

  useRedirectIfAuthenticated(redirectTarget, (userStatus) => {
    if (userStatus === "DELETED_REQUESTED") setRecovery("session");
  });
  const exitGuestMode = useGuestTrialStore((state) => state.exitGuestMode);

  const [isSubmitting, setIsSubmitting] = useState(false);
  // 소셜 콜백이 실패·취소로 돌려보낸 자리면 이유를 폼 위에 남긴다(alert 는 닫으면 사라진다).
  const [errors, setErrors] = useState<LoginErrors>(() =>
    searchParams.get("socialError") === "1"
      ? { common: SOCIAL_LOGIN_FAILED_MESSAGE }
      : {},
  );

  const logout = () => clientApi.delete("/api/client/logout").catch(() => undefined);

  // 탈퇴를 그대로 둔다 — 받은 세션만 지우고 이 화면에 남는다.
  const keepWithdrawal = async () => {
    setRecovery(null);
    await logout();
  };

  const cancelWithdrawal = async () => {
    const target = recovery;
    if (!target) return;
    setRecovering(true);
    try {
      try {
        await reactivateAccount();
      } catch (reactivateError) {
        console.error(reactivateError);
        await logout();
        setRecovery(null);
        setErrors({ common: "탈퇴 취소에 실패했어요. 잠시 후 다시 시도해 주세요." });
        return;
      }

      /*
        복구됐다고 지금 쿠키가 쓸 수 있게 되는 것은 아니다.
        받은 토큰에는 status=DELETED_REQUESTED 가 박혀 있고, reactivate 는 새 쿠키를 주지 않으면서
        서버의 refresh 토큰까지 지운다 — 재발급도 막힌다(AUTH-011). 그대로 보내면 /home 에 도착한 뒤
        모든 요청이 403(GEN-021)으로 막힌다. 근거: docs/backend-contract.md "탈퇴 요청 → 복구 생애주기"
      */
      if (target === "session") {
        await logout();
        setRecovery(null);
        setRecoveredNotice(true);
        return;
      }

      // 자격증명이 아직 손에 있으니 조용히 다시 로그인해 지금 상태의 토큰을 받는다(정지 중이었다면 BLOCKED).
      try {
        await loginWithEmail(target.email, target.password);
      } catch (reloginError) {
        console.error(reloginError);
        await logout();
        setRecovery(null);
        setErrors({ common: "탈퇴는 취소됐어요. 다시 로그인해 주세요." });
        return;
      }

      setRecovery(null);
      exitGuestMode();
      window.location.href = redirectTarget;
    } finally {
      setRecovering(false);
    }
  };

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

    /*
      로그인에는 가입 규칙을 걸지 않는다.

      서버 `LoginRequest.password` 는 `minLength: 1` 뿐이다(실측). 가입용 `validatePassword` 는
      8~20자에 문자 클래스까지 보는데, 그것을 로그인에 걸면 **맞는 비밀번호인데 틀렸다고 말한다** —
      다른 클라이언트·시드·관리자가 만든 계정이나 규칙이 완화된 뒤의 계정이 그렇다.
      비밀번호가 맞는지는 서버가 판정한다. 여기서는 빈 값만 막는다.
    */
    if (!password) nextErrors.password = "비밀번호를 입력해 주세요.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setIsSubmitting(false);
      return;
    }

    try {
      const loginData = await loginWithEmail(email, password);

      if (loginData?.userStatus === "DELETED_REQUESTED") {
        // 로그인은 됐다. 들여보내기 전에 모달로 탈퇴를 취소할지 묻는다(위 recovery 주석).
        setRecovery({ email, password });
        return;
      } else if (isUnusableUserStatus(loginData?.userStatus ?? null)) {
        // 탈퇴 계정 — 쿠키는 받았어도 일반 API 가 전부 막힌다. 들여보내면 아무것도 못 하는
        // 홈에 갇히므로 받은 세션을 지우고 이 화면에서 이유와 문의처를 말한다.
        await clientApi.delete("/api/client/logout").catch(() => undefined);
        setErrors({ common: RESTRICTED_ACCOUNT_MESSAGE, support: true });
        return;
      }

      exitGuestMode();
      window.location.href = redirectTarget;
    } catch (error) {
      console.error(error);
      // 실패 원인은 하나가 아니다 — 가입되지 않은 계정(AUTH-020), 이메일 미인증(AUTH-004),
      // 네트워크 장애까지 전부 "비밀번호가 틀렸다"로 말하면
      // 사용자는 맞는 비밀번호를 계속 다시 친다. 서버 코드에 맞는 문구를 쓴다.
      const message = getUserFacingApiErrorMessage(error, "이메일 또는 비밀번호가 올바르지 않아요.");
      // 칸에서 생긴 오류는 그 칸을 빨갛게 하고 문장도 칸 아래에 둔다. 위쪽 상자는 칸과 상관없는 것(서버 연결 등)만 쓴다.
      switch (getApiErrorDetails(error).code) {
        case "AUTH-001":
          setErrors({ password: message, credentials: true });
          break;
        case "AUTH-004":
        case "AUTH-020":
          setErrors({ email: message });
          break;
        default:
          setErrors({ common: message });
      }
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
          <p className="mt-2 text-center text-[14px] text-(--hc-muted)">
            아직 계정이 없으신가요?{" "}
            <Link
              href={signupHref}
              className="inline-flex min-h-11 items-center px-1 font-medium text-(--hc-primary-strong) underline underline-offset-4"
            >
              회원가입
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {searchParams.get("joined") === "1" && !errors.common ? (
          <p role="status" className="hc-feedback rounded-xl border px-3.5 py-2.5 text-[13px]">
            <Sentences text="가입이 끝났어요. 방금 만든 계정으로 로그인해 주세요." />
          </p>
        ) : null}
        {searchParams.get("passwordChanged") === "1" && !errors.common ? (
          <p role="status" className="hc-feedback rounded-xl border px-3.5 py-2.5 text-[13px]">
            <Sentences text="비밀번호를 바꿨어요. 새 비밀번호로 다시 로그인해 주세요." />
          </p>
        ) : null}
        {recoveredNotice && !errors.common ? (
          <p role="status" className="hc-feedback rounded-xl border px-3.5 py-2.5 text-[13px]">
            <Sentences text="탈퇴를 취소했어요. 다시 로그인해 주세요." />
          </p>
        ) : null}
        {errors.common ? (
          <p role="alert" className="rounded-xl border border-(--hc-danger-border) bg-(--hc-danger-soft-bg) px-3.5 py-2.5 text-[13px] leading-[1.6] text-(--hc-danger)">
            <Sentences text={errors.common} />
            {errors.support ? (
              <>
                {" "}
                <a
                  href={`mailto:${COMPANY.email}`}
                  className="font-semibold underline underline-offset-4"
                >
                  {COMPANY.email}
                </a>
              </>
            ) : null}
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
            invalid={Boolean(errors.credentials)}
          />
        ))}

        {/* 세션 지속 옵션은 백엔드 계약에 없어 '로그인 상태 유지' 체크박스를 두지 않는다. */}
        <div className="flex items-center justify-end">
          <Link
            href={forgotPasswordHref}
            // 17px 높이라 손가락으로 눌리지 않았다. 시각 크기는 그대로 두고 누를 면만 넓힌다.
            className="inline-flex min-h-11 items-center px-1 text-[12px] text-(--hc-muted) underline underline-offset-4 transition hover:text-(--hc-text)"
          >
            비밀번호 찾기
          </Link>
        </div>

        {/* 아래 소셜 버튼과 같은 h-12 알약이다. 예전에는 이쪽만 py-2.5(약 38px)·text-xs 라
            같은 화면에서 버튼 높이와 글자 크기가 두 종류로 갈렸다.
            색은 초록이 아니라 잉크다 — 바로 아래 네이버 버튼이 브랜드 초록이라, 라이트에서 우리 초록
            (#BDE528)과 같은 버튼 둘로 읽혔다(globals.css .hc-button-ink). */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="hc-button-ink inline-flex h-12 items-center justify-center rounded-full text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting ? "로그인 중…" : "로그인"}
        </button>

        {/* 비회원 체험 — 로그인 바로 아래. 가입 없이 촬영을 먼저 체험할 수 있게.
            문구는 넘기지 않는다 — 기본값이 곧 랜딩·앱과 같은 @harucut/shared 의 한 문구다. */}
        {/* 주 CTA(로그인)와 같은 무게의 알약이 다섯 개 서 있었다. 체험은 보조 길이라 글자로 둔다. 누르는 면은 44px. */}
        <GuestTrialStartButton className="inline-flex min-h-11 items-center justify-center text-[14px] font-semibold text-(--hc-text) underline underline-offset-4 transition hover:text-(--hc-primary-strong)" />
      </form>
      {recovery ? (
        <ConfirmDialog
          title="탈퇴를 취소할까요?"
          description="탈퇴를 신청한 계정이에요. 취소하면 지금처럼 하루컷을 쓸 수 있어요."
          confirmLabel="탈퇴 취소하기"
          runningLabel="취소하는 중"
          cancelLabel="로그아웃"
          running={recovering}
          onClose={() => void keepWithdrawal()}
          onConfirm={() => void cancelWithdrawal()}
        />
      ) : null}
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
