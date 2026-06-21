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
    <span className="hc-accent-chip inline-flex h-12 w-12 items-center justify-center rounded-3xl border shadow-[var(--hc-card-shadow)]">
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
      <div className="hc-surface-hero relative w-full max-w-[460px] rounded-[32px] border p-5 backdrop-blur-xl sm:p-6">
        <button
          type="button"
          onClick={clearNotice}
          className="hc-button-icon absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border text-[color:var(--hc-muted)] transition"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col gap-4">
          {notice.icon ? <NoticeIcon icon={notice.icon} /> : null}
          {notice.eyebrow ? (
            <span className="hc-accent-chip inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-medium">
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
                    ? "hc-button-secondary rounded-full border px-4 py-3 text-sm font-semibold transition"
                    : "hc-button-primary rounded-full px-4 py-3 text-sm font-semibold transition"
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
