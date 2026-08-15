"use client";

import { loginGoogle, loginKakao, loginNaver } from "@/lib/authLogin";

type Props = {
  mode?: "login" | "signup";
  redirectTo?: string | null;
};

function GoogleSymbol() {
  // 직접 그린 SVG가 아니라 구글이 배포하는 공식 G 로고 이미지를 사용한다.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/google-g-logo.png" alt="" aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
  );
}

function KakaoSymbol() {
  // 카카오 공식 로그인 버튼에서 추출한 말풍선 심볼(노란 배경은 카카오 버튼색과 동일해 자연스럽게 섞임)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/kakao-symbol.png" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
  );
}

function NaverSymbol() {
  // 네이버 공식 로그인 심볼(green icon: 초록 원 + 흰 N)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/naver-symbol.png" alt="" aria-hidden="true" className="h-[22px] w-[22px] shrink-0" />
  );
}

function SocialButton({
  onClick,
  icon,
  label,
  className,
  iconContainerClassName,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  className: string;
  iconContainerClassName: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-12 w-full items-center rounded-[12px] text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--hc-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-white hover:-translate-y-0.5",
        className,
      ].join(" ")}
    >
      <span
        className={[
          "flex h-full w-12 items-center justify-center rounded-l-[12px]",
          iconContainerClassName,
        ].join(" ")}
      >
        {icon}
      </span>
      <span className="flex-1 pr-12 text-center tracking-[-0.01em]">{label}</span>
    </button>
  );
}

export function SocialLoginSection({ mode = "login", redirectTo }: Props) {
  const dividerLabel = mode === "signup" ? "간편가입" : "또는";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[12.5px] text-[color:var(--hc-muted)]">
        <span className="h-px flex-1 bg-[color:var(--hc-border)]" />
        <span>{dividerLabel}</span>
        <span className="h-px flex-1 bg-[color:var(--hc-border)]" />
      </div>

      <div className="flex flex-col gap-2">
        <SocialButton
          onClick={() => loginGoogle(redirectTo)}
          icon={<GoogleSymbol />}
          label="Google로 계속하기"
          className="border border-[color:var(--hc-border)] bg-white text-[rgba(0,0,0,0.72)] shadow-[0_14px_32px_rgba(15,23,42,0.08)] hover:bg-zinc-50"
          iconContainerClassName="border-r border-[color:var(--hc-border)] bg-white"
        />

        <SocialButton
          onClick={() => loginKakao(redirectTo)}
          icon={<KakaoSymbol />}
          label="카카오로 계속하기"
          className="bg-[#FEE500] text-[rgba(0,0,0,0.85)] shadow-[0_14px_32px_rgba(15,23,42,0.08)] hover:bg-[#F7DD00]"
          iconContainerClassName="bg-[#FEE500]"
        />

        <SocialButton
          onClick={() => loginNaver(redirectTo)}
          icon={<NaverSymbol />}
          label="네이버로 계속하기"
          className="bg-[#007A3D] text-white shadow-[0_16px_36px_rgba(0,122,61,0.22)] hover:bg-[#006E36]"
          iconContainerClassName="border-r border-white/15 bg-[#006E36]"
        />
      </div>
    </section>
  );
}
