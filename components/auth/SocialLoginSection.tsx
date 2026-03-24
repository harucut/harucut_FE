"use client";

import { loginKakao, loginNaver } from "@/lib/authLogin";

type Props = {
  mode?: "login" | "signup";
  redirectTo?: string | null;
};

export function SocialLoginSection({
  mode = "login",
  redirectTo,
}: Props) {
  const labelText =
    mode === "login"
      ? "또는 소셜 계정으로 로그인"
      : "또는 소셜 계정으로 시작";

  const kakaoText =
    mode === "login"
      ? "카카오 계정으로 계속하기"
      : "카카오 계정으로 시작하기";

  const naverText =
    mode === "login" ? "네이버로 계속하기" : "네이버로 시작하기";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <span className="h-px flex-1 bg-zinc-800" />
        <span>{labelText}</span>
        <span className="h-px flex-1 bg-zinc-800" />
      </div>

      <div className="flex flex-col gap-2 text-[11px]">
        <button
          type="button"
          onClick={() => loginKakao(redirectTo)}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-[#FEE500] text-zinc-900 hover:bg-[#FDE000]"
        >
          <span>{kakaoText}</span>
        </button>

        <button
          type="button"
          onClick={() => loginNaver(redirectTo)}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-[#03C75A] text-white hover:bg-[#02b456]"
        >
          <span>{naverText}</span>
        </button>
      </div>
    </section>
  );
}
