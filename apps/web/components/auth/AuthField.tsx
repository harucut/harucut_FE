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
    <div className="flex flex-col gap-1.5 text-[11px]">
      <label htmlFor={id} className="text-[color:var(--hc-text)]">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={inputType}
          className={[
            "h-9 w-full rounded-lg border bg-[color:var(--hc-surface-strong)] px-3 pr-12 text-[11px] text-[color:var(--hc-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
            "placeholder:text-[color:var(--hc-muted)] focus:outline-none focus:ring-1 focus:ring-[color:var(--hc-primary)]",
            error ? "border-red-400/70" : "border-[color:var(--hc-border)]",
          ].join(" ")}
          {...inputProps}
        />

        {isPassword ? (
          <button
            type="button"
            onClick={() => setShow((prev) => !prev)}
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[color:var(--hc-muted)] transition hover:bg-[color:var(--hc-background-tint)] hover:text-[color:var(--hc-text)]"
            aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
            title={show ? "비밀번호 숨기기" : "비밀번호 보기"}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="text-[10px] leading-relaxed text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
