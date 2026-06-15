"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { VerifyCodeForm } from "@/components/auth/ForgotPassword/VerifyCodeForm";
import { ResetPasswordForm } from "@/components/auth/ForgotPassword/ResetPasswordForm";
import { useForgotPasswordFlow } from "./_hooks/useForgotPasswordFlow";
import { buildPathWithRedirect } from "@/lib/redirect";

function ForgotPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loginHref = buildPathWithRedirect(
    "/login",
    searchParams.get("redirectTo"),
  );
  const flow = useForgotPasswordFlow();

  return (
    <AuthPageShell
      title="비밀번호 찾기"
      description={flow.description}
      icon="lock"
      footer={null}
    >
      {flow.step === "VERIFY_CODE" ? (
        <VerifyCodeForm
          email={flow.email}
          setEmail={flow.setEmail}
          code={flow.code}
          setCode={flow.setCode}
          emailLocked={flow.emailLocked}
          codeExpiresAt={flow.codeExpiresAt}
          isSubmitting={flow.isSubmitting}
          errors={flow.errors}
          onVerify={flow.verifyCode}
          onResend={flow.sendCode}
          onRestart={flow.restart}
          onGoLogin={() => router.push(loginHref)}
        />
      ) : null}

      {flow.step === "RESET_PASSWORD" ? (
        <ResetPasswordForm
          newPassword={flow.newPassword}
          setNewPassword={flow.setNewPassword}
          confirmPassword={flow.confirmPassword}
          setConfirmPassword={flow.setConfirmPassword}
          isSubmitting={flow.isSubmitting}
          errors={flow.errors}
          onSubmit={async () => {
            const ok = await flow.submitNewPassword();
            if (!ok) return;

            alert("비밀번호가 변경되었어요. 다시 로그인해 주세요.");
            router.push(loginHref);
          }}
          onRestart={flow.restart}
          onGoLogin={() => router.push(loginHref)}
        />
      ) : null}
    </AuthPageShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordPageContent />
    </Suspense>
  );
}
