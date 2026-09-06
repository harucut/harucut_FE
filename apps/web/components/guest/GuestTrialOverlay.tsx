"use client";

import { Camera, CheckCircle2, Lock, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";
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
    <span className="hc-accent-chip inline-flex h-12 w-12 items-center justify-center rounded-3xl border shadow-(--hc-card-shadow)">
      <Icon className="h-5 w-5" />
    </span>
  );
}

export function GuestTrialOverlay() {
  const router = useRouter();
  const notice = useGuestTrialStore((state) => state.notice);
  const clearNotice = useGuestTrialStore((state) => state.clearNotice);
  const enterGuestMode = useGuestTrialStore((state) => state.enterGuestMode);
  // 이 컴포넌트는 항상 마운트돼 있고 notice 가 없을 때 null 을 반환한다. 그래서 열림 여부는
  // notice 유무다. 여기에 true 를 넘기면 "열린 시점"이 앱 시작 시점이 돼, 열기 전 포커스를
  // body 로 잡아 버린다(그래서 닫은 뒤 복원이 안 됐다).
  const dialogRef = useModalDialog(Boolean(notice), clearNotice);

  if (!notice) {
    return null;
  }

  const handleAction = (actionId: string) => {
    // 액션에 href가 있으면 그 경로를 우선한다.
    // 게스트 결과 보관 안내는 /login?redirectTo=/home?resumeSave=1 로 보내야
    // 로그인 직후 GuestTrialBridge가 보관해 둔 결과를 자동으로 올린다.
    const action = notice.actions.find((item) => item.id === actionId);

    // 콜백이 붙은 액션은 그 콜백이 전부다. 비회원 보관물을 계정에 저장할지 묻는 확인처럼
    // 이동이 아니라 동작이 목적인 버튼에 쓴다.
    if (action?.onSelect) {
      clearNotice();
      action.onSelect();
      return;
    }

    if (action?.href) {
      clearNotice();
      router.push(action.href);
      return;
    }

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
    <div className="fixed inset-0 z-120 flex items-end justify-center bg-[rgba(10,24,45,0.42)] px-4 py-6 sm:items-center">
      <button
        type="button"
        aria-label="알림 닫기"
        onClick={clearNotice}
        className="absolute inset-0"
      />
      {/* 선언만 있고 규약이 없던 오버레이다. 포커스 이동·트랩·Esc·복원을 훅이 맡는다. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-notice-title"
        className="hc-surface-hero relative w-full max-w-115 rounded-4xl border p-5 backdrop-blur-xl sm:p-6"
      >
        <button
          type="button"
          onClick={clearNotice}
          className="hc-button-icon absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border text-(--hc-muted) transition"
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
            <h2
              id="guest-notice-title"
              className="text-[22px] font-semibold tracking-tight text-(--hc-text)"
            >
              {notice.title}
            </h2>
            <p className="text-[13px] leading-6 text-(--hc-muted)">
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
