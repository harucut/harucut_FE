"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useModalDialog } from "@/hooks/useModalDialog";
import { Sentences } from "@/components/ui/Sentences";
import { useGuestTrialStore } from "@/lib/guestTrialStore";


export function GuestTrialOverlay() {
  const router = useRouter();
  const notice = useGuestTrialStore((state) => state.notice);
  const clearNotice = useGuestTrialStore((state) => state.clearNotice);
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
        router.push("/create");
        return;
      default:
        clearNotice();
    }
  };

  return (
    <div className="fixed inset-0 z-120 flex items-end justify-center hc-modal px-4 py-6 sm:items-center">
      {/*
        배경은 바깥을 눌러 닫는 자리일 뿐이다. 이름은 카드 안 X 버튼이 갖는다 — 예전에는 이름이
        배경에만 있어 X 가 이름 없는 버튼으로 읽혔고(axe button-name), 둘 다 주면 같은 컨트롤이
        두 번 잡힌다. 키보드는 Escape 와 X 로 닫는다. 트랩(useModalDialog)은 카드 안만 훑어 배경과 무관하다.
      */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
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
        {/*
          닫기는 X 글자 하나다(2026-11-14). 테두리 있는 흰 원은 누를 버튼이 하나 더 있는 것처럼 보였다.
          보이는 것은 X 뿐이고 눌리는 면은 44px 다.
        */}
        <button
          type="button"
          aria-label="알림 닫기"
          onClick={clearNotice}
          className="absolute right-2.5 top-3.5 grid size-11 place-items-center rounded-full text-(--hc-muted) transition hover:text-(--hc-text) sm:right-3 sm:top-4.5"
        >
          <X aria-hidden className="size-5" />
        </button>

        <div className="flex flex-col gap-4">
          {/* 칩(NOTICE 등)과 큰 아이콘은 뺐다(2026-11-09). 제목과 문장, 버튼만 둔다. */}
          <div className="space-y-2">
            <h2
              id="guest-notice-title"
              // 칩이 빠져 제목이 맨 위로 왔다. 오른쪽 위 닫기(X, 눌리는 면 44px)와 겹치지 않게 비운다.
              className="pr-10 text-[22px] font-semibold tracking-tight text-(--hc-text)"
            >
              {notice.title}
            </h2>
            <p className="text-[13px] leading-6 text-(--hc-muted)">
              <Sentences text={notice.message} />
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
