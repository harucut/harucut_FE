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
        "inline-flex h-11 w-full items-center rounded-xl text-sm font-semibold transition-colors",
        className,
      ].join(" ")}
    >
      <span
        className={[
          "flex h-full w-11 items-center justify-center rounded-l-xl",
          iconContainerClassName,
        ].join(" ")}
      >
        {icon}
      </span>
      <span className="flex-1 pr-11 text-center">{label}</span>
    </button>
  );
}

export function SocialLoginSection({
  mode = "login",
  redirectTo,
}: Props) {
  void mode;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <span className="h-px flex-1 bg-zinc-800" />
        <span>또는 소셜 계정으로 계속하기</span>
        <span className="h-px flex-1 bg-zinc-800" />
      </div>

      <div className="flex flex-col gap-2">
        <SocialButton
          onClick={() => loginKakao(redirectTo)}
          icon={<KakaoSymbol />}
          label="카카오 로그인"
          className="bg-[#FEE500] text-[rgba(0,0,0,0.85)] hover:bg-[#FADA0A]"
          iconContainerClassName="bg-[#FEE500]"
        />

        <SocialButton
          onClick={() => loginNaver(redirectTo)}
          icon={<NaverSymbol />}
          label="네이버 로그인"
          className="bg-[#03C75A] text-white hover:bg-[#02B350]"
          iconContainerClassName="bg-[#03C75A]"
        />
      </div>
    </section>
  );
}
