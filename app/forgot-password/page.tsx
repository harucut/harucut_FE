"use client";

import { useRouter } from "next/navigation";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { useForgotPasswordFlow } from "./_hooks/useForgotPasswordFlow";

import { VerifyCodeForm } from "@/components/auth/ForgotPassword/VerifyCodeForm";
import { ResetPasswordForm } from "@/components/auth/ForgotPassword/ResetPasswordForm";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const flow = useForgotPasswordFlow();

  return (
    <AuthPageShell
      title="비밀번호 재설정"
      description={flow.description}
      footer={null}
    >
      {flow.step === "VERIFY_CODE" && (
        <VerifyCodeForm
          email={flow.email}
          setEmail={flow.setEmail}
          code={flow.code}
          setCode={flow.setCode}
          emailLocked={flow.emailLocked}
          isSubmitting={flow.isSubmitting}
          errors={flow.errors}
          onVerify={flow.verifyCode}
          onResend={flow.sendCode}
          onRestart={flow.restart}
          onGoLogin={() => router.push("/login")}
        />
      )}

      {flow.step === "RESET_PASSWORD" && (
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
            alert("비밀번호가 변경되었어요. 로그인해 주세요.");
            router.push("/login");
          }}
          onRestart={flow.restart}
          onGoLogin={() => router.push("/login")}
        />
      )}
    </AuthPageShell>
  );
}
