"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/layout/PageHeader";
import { useDecorateSession } from "@/lib/decorateSessionStore";
import { useDecorateStore } from "@/lib/decorateStore";
import { composeDecoratedPng } from "@/lib/decorateCompose";
import { downloadBlob } from "@/lib/canvas/composeFrame";
import {
  buildDefaultDisplayName,
  buildDownloadFilename,
} from "@/lib/fourcutOutput";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { DecoratePanel } from "@/components/decorate/DecoratePanel";

// Konva 캔버스는 클라이언트 전용(SSR 비활성).
const DecorateCanvas = dynamic(
  () =>
    import("@/components/decorate/DecorateCanvas").then((m) => m.DecorateCanvas),
  { ssr: false },
);

export function DecorateView() {
  const router = useRouter();
  const imageSrc = useDecorateSession((s) => s.imageSrc);
  const origin = useDecorateSession((s) => s.origin);

  const base = useDecorateStore((s) => s.base);
  const setBase = useDecorateStore((s) => s.setBase);
  const reset = useDecorateStore((s) => s.reset);

  const accessMode = useGuestTrialStore((s) => s.accessMode);
  const setNotice = useGuestTrialStore((s) => s.setNotice);
  const guestMode = accessMode === "guest";

  const [isDownloading, setIsDownloading] = useState(false);

  // 꾸밀 이미지가 없을 때 돌아갈 곳. 게스트는 /home이 막혀 있어
  // 그대로 보내면 /shoot?guestNotice=restricted로 한 번 더 튕긴다.
  const fallbackHref = guestMode ? "/shoot" : "/home";

  // 결과 화면에서 넘어온 이미지의 실제 크기를 읽어 베이스로 등록.
  useEffect(() => {
    if (!imageSrc) {
      router.replace(fallbackHref);
      return;
    }
    let active = true;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!active) return;
      setBase({
        src: imageSrc,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
    };
    img.onerror = () => {
      if (active) router.replace(fallbackHref);
    };
    img.src = imageSrc;
    return () => {
      active = false;
    };
  }, [fallbackHref, imageSrc, router, setBase]);

  useEffect(() => () => reset(), [reset]);

  const notice = (titleText: string, message: string) =>
    setNotice({
      actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
      eyebrow: guestMode ? "GUEST MODE" : "NOTICE",
      icon: guestMode ? "lock" : "sparkles",
      message,
      title: titleText,
    });

  const composeBlob = async () => {
    const state = useDecorateStore.getState();
    if (!state.base) return null;
    return composeDecoratedPng({
      base: state.base,
      components: state.components,
      strokes: state.strokes,
    });
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const blob = await composeBlob();
      if (!blob) return;
      const displayName = buildDefaultDisplayName();
      await downloadBlob(blob, buildDownloadFilename(displayName, "png"));
    } catch (error) {
      console.error(error);
      notice("내려받기에 실패했어요", "잠시 후 다시 시도해 주세요.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    /*
      편집기는 스크롤 문서가 아니라 한 화면이다. 예전에는 캔버스·도구·저장 버튼이 세로로
      길게 이어져서, 스티커를 붙이려면 도구까지 스크롤하고 결과를 보려면 다시 위로 올라가야
      했다. 높이를 뷰포트에 묶고 캔버스는 고정, 도구 패널만 안에서 스크롤한다.
    */
    <main className="hc-page-app flex h-dvh flex-col overflow-hidden text-[color:var(--hc-text)]">
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-3 px-4 pt-4 lg:max-w-5xl lg:px-8 lg:pt-6">
        <PageHeader
          title="네컷 꾸미기"
          brandHref={guestMode ? "/shoot" : "/home"}
          // 나갈 길이 브랜드 로고 하나뿐이었다. 온 곳으로 되돌아가는 길을 명시한다.
          backHref={origin}
          backLabel="결과로 돌아가기"
          description="스티커·텍스트를 얹고, 펜으로 자유롭게 그려 보세요."
        />

        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-6">
          <div className="flex shrink-0 justify-center lg:min-h-0 lg:flex-1">
            {base ? (
              <DecorateCanvas />
            ) : (
              <div className="flex h-[38svh] w-full max-w-[340px] items-center justify-center rounded-[28px] border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] text-[12px] text-[color:var(--hc-muted)] lg:h-[460px]">
                불러오는 중...
              </div>
            )}
          </div>

          {/* 도구는 여기서만 스크롤한다 — 캔버스는 늘 보이는 자리에 남는다. */}
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 lg:w-full lg:max-w-sm lg:flex-none">
            <DecoratePanel />
          </div>
        </div>

        <div className="shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
          {/* '기록에 저장'을 여기서 뺐다.
              꾸민 결과는 이미 합쳐진 그림 한 장인데, 백엔드에서 완성 이미지를 등록하는 API 가
              없어졌다(405). 남은 저장 수단인 서버 합성은 **원본 4장**을 받는 방식이라 이 결과물이
              들어갈 자리가 없다. 눌러도 실패할 버튼을 두느니 내려받기만 남긴다.
              백엔드에 완성본 등록 수단이 생기면 되살릴 것 — docs/backend-contract.md */}
          <p className="mb-2 text-center text-[11px] leading-[1.5] text-[color:var(--hc-muted)]">
            꾸민 네컷은 기록에 저장되지 않아요. 잊지 말고 내려받아 주세요.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading || !base}
              className="hc-button-primary flex-1 rounded-full px-4 py-3 text-sm font-semibold transition disabled:opacity-40"
            >
              {isDownloading ? "내려받는 중..." : "내려받기"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
