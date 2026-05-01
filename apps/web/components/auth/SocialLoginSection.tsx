"use client";

import { loginKakao, loginNaver } from "@/lib/authLogin";

type Props = {
  mode?: "login" | "signup";
  redirectTo?: string | null;
};

function KakaoSymbol() {
  return (
    <svg
      viewBox="0 0 18 18"
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9 2.25C5.272 2.25 2.25 4.648 2.25 7.606C2.25 9.519 3.521 11.197 5.431 12.144L4.787 15.75L8.133 13.684C8.419 13.718 8.707 13.734 9 13.734C12.728 13.734 15.75 11.336 15.75 8.378C15.75 5.42 12.728 2.25 9 2.25Z"
        fill="#000000"
        fillOpacity="0.85"
      />
    </svg>
  );
}

function NaverSymbol() {
  return (
    <svg
      viewBox="0 0 18 18"
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3.25 3.25H7.222L10.778 8.275V3.25H14.75V14.75H10.778L7.222 9.725V14.75H3.25V3.25Z"
        fill="white"
      />
    </svg>
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
  void mode;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <span className="h-px flex-1 bg-[color:var(--hc-border)]" />
        <span>또는 소셜 계정으로 계속하기</span>
        <span className="h-px flex-1 bg-[color:var(--hc-border)]" />
      </div>

      <div className="flex flex-col gap-2">
        <SocialButton
          onClick={() => loginKakao(redirectTo)}
          icon={<KakaoSymbol />}
          label="카카오 로그인"
          className="bg-[#FEE500] text-[rgba(0,0,0,0.85)] shadow-[0_14px_32px_rgba(15,23,42,0.08)] hover:bg-[#F7DD00]"
          iconContainerClassName="bg-[#FEE500]"
        />

        <SocialButton
          onClick={() => loginNaver(redirectTo)}
          icon={<NaverSymbol />}
          label="네이버 로그인"
          className="bg-[#007A3D] text-white shadow-[0_16px_36px_rgba(0,122,61,0.22)] hover:bg-[#006E36]"
          iconContainerClassName="border-r border-white/15 bg-[#006E36]"
        />
      </div>
    </section>
  );
}
