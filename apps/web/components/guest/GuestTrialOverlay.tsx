"use client";

import { Camera, CheckCircle2, Lock, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useGuestTrialStore } from "@/lib/guestTrialStore";

function NoticeIcon({ icon }: { icon?: "camera" | "check" | "lock" | "sparkles" }) {
  const Icon = useMemo(() => {
    switch (icon) {
      case "camera":
        return Camera;
      case "check":
        return CheckCircle2;
      case "lock":
        return Lock;
      case "sparkles":
      default:
        return Sparkles;
    }
  }, [icon]);

  return (
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-3xl border border-[rgba(37,99,235,0.16)] bg-[rgba(37,99,235,0.08)] text-[color:var(--hc-primary-strong)] shadow-[0_18px_40px_rgba(37,99,235,0.12)]">
      <Icon className="h-5 w-5" />
    </span>
  );
}

export function GuestTrialOverlay() {
  const router = useRouter();
  const notice = useGuestTrialStore((state) => state.notice);
  const clearNotice = useGuestTrialStore((state) => state.clearNotice);
  const enterGuestMode = useGuestTrialStore((state) => state.enterGuestMode);

  if (!notice) {
    return null;
  }

  const handleAction = (actionId: string) => {
    switch (actionId) {
      case "dismiss":
        clearNotice();
        return;
      case "go-login":
        clearNotice();
        router.push("/login");
        return;
      case "go-shoot":
        clearNotice();
        router.push("/shoot");
        return;
      case "start-guest-trial":
        enterGuestMode();
        router.push("/shoot");
        return;
      default:
        clearNotice();
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(10,24,45,0.42)] px-4 py-6 sm:items-center">
      <button
        type="button"
        aria-label="알림 닫기"
        onClick={clearNotice}
        className="absolute inset-0"
      />
      <div className="relative w-full max-w-[460px] rounded-[32px] border border-[color:var(--hc-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.94))] p-5 shadow-[0_32px_90px_rgba(37,99,235,0.22)] backdrop-blur-xl sm:p-6">
        <button
          type="button"
          onClick={clearNotice}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--hc-border)] bg-white/80 text-[color:var(--hc-muted)] transition hover:bg-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col gap-4">
          <NoticeIcon icon={notice.icon} />
          {notice.eyebrow ? (
            <span className="inline-flex w-fit rounded-full border border-[rgba(37,99,235,0.16)] bg-[rgba(37,99,235,0.08)] px-3 py-1 text-[11px] font-medium text-[color:var(--hc-primary-strong)]">
              {notice.eyebrow}
            </span>
          ) : null}

          <div className="space-y-2">
            <h2 className="text-[22px] font-semibold tracking-tight text-[color:var(--hc-text)]">
              {notice.title}
            </h2>
            <p className="text-[13px] leading-6 text-[color:var(--hc-muted)]">
              {notice.message}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {notice.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => handleAction(action.id)}
                className={
                  action.variant === "secondary"
                    ? "rounded-full border border-[color:var(--hc-border)] bg-white/80 px-4 py-3 text-sm font-semibold text-[color:var(--hc-text)] transition hover:border-[rgba(37,99,235,0.28)] hover:bg-white"
                    : "rounded-full bg-[color:var(--hc-primary)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(37,99,235,0.22)] transition hover:bg-[color:var(--hc-primary-strong)]"
                }
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
