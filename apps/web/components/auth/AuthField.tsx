"use client";

import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState, type InputHTMLAttributes } from "react";

type AuthFieldProps = {
  label: string;
  error?: string | null;
} & InputHTMLAttributes<HTMLInputElement>;

export function AuthField({
  label,
  error,
  id,
  type,
  ...inputProps
}: AuthFieldProps) {
  const isPassword = type === "password";
  const [show, setShow] = useState(false);

  const inputType = useMemo(() => {
    if (!isPassword) return type;
    return show ? "text" : "password";
  }, [isPassword, show, type]);

  return (
    <div className="flex flex-col gap-1.5 text-[13px]">
      <label htmlFor={id} className="font-medium text-[color:var(--hc-text)]">
        {label}
      </label>

      <div className="relative">
        {/*
          44px 입력·13px 라벨. 예전에는 36px 에 11px 라벨이라, 모바일에서 입력 글자만 16px 로
          강제되는 순간(globals.css pointer:coarse) 라벨이 각주처럼 보이고 위계가 뒤집혔다.
          이메일은 자동 대문자·맞춤법 교정이 값을 망치므로 끈다.
        */}
        <input
          id={id}
          type={inputType}
          className={[
            "hc-input h-11 w-full rounded-xl border px-3.5 pr-12 text-[14px]",
            error ? "border-[color:var(--hc-danger-border)]" : "",
          ].join(" ")}
          {...(type === "email"
            ? { spellCheck: false, autoCapitalize: "none", inputMode: "email" as const }
            : {})}
          {...inputProps}
        />

        {isPassword ? (
          <button
            type="button"
            onClick={() => setShow((prev) => !prev)}
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[color:var(--hc-muted)] transition hover:bg-[color:var(--hc-surface-highlight)] hover:text-[color:var(--hc-text)]"
            aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
            title={show ? "비밀번호 숨기기" : "비밀번호 보기"}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-[12px] leading-relaxed text-[color:var(--hc-danger)]">{error}</p>
      ) : null}
    </div>
  );
}
