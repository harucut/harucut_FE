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
import { uploadGeneratedFourcutFile } from "@/lib/fourcutProcessing";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { buildPathWithRedirect } from "@/lib/redirect";
import { setPendingGuestSave } from "@/lib/pendingGuestSave";
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
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSaveToRecords = async () => {
    if (guestMode) {
      // 비회원: 결과물을 보관해 두고 로그인/회원가입으로 보낸다.
      // 인증을 마치면 /home 에서 GuestTrialBridge가 자동으로 서버(기록)에 저장한다.
      setIsSaving(true);
      try {
        const blob = await composeBlob();
        if (blob) {
          const displayName = buildDefaultDisplayName();
          const stored = await setPendingGuestSave(blob, displayName, Date.now());
          if (!stored) {
            notice(
              "저장 준비에 실패했어요",
              "결과가 너무 커서 잠시 보관하지 못했어요. 먼저 내려받아 주세요.",
            );
            return;
          }
        }
        router.push(buildPathWithRedirect("/login", "/home?resumeSave=1"));
      } finally {
        setIsSaving(false);
      }
      return;
    }

    setIsSaving(true);
    try {
      const blob = await composeBlob();
      if (!blob) return;
      const displayName = buildDefaultDisplayName();
      const file = new File([blob], `${displayName}.png`, { type: "image/png" });
      await uploadGeneratedFourcutFile({ file, displayName });
      notice("기록에 저장했어요", "기록 화면에서 다시 보거나 내려받을 수 있어요.");
    } catch (error) {
      console.error(error);
      notice(
        "기록 저장에 실패했어요",
        getUserFacingApiErrorMessage(error, "잠시 후 다시 시도해 주세요."),
      );
    } finally {
      setIsSaving(false);
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
          {guestMode ? (
            // 비회원에게 가장 중요한 다음 걸음은 "이 결과를 잃지 않는 것"이다.
            // 예전에는 그 버튼이 보조 스타일이고, 파일로 받는 쪽이 주 버튼이었다.
            <p className="mb-2 text-center text-[11px] leading-[1.5] text-[color:var(--hc-muted)]">
              지금 나가면 이 네컷은 사라져요. 로그인하면 기록에 남아 언제든 다시 꺼낼 수 있어요.
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveToRecords}
              disabled={isSaving || !base}
              className="hc-button-primary flex-1 rounded-full px-4 py-3 text-sm font-semibold transition disabled:opacity-40"
            >
              {isSaving ? "저장 중..." : guestMode ? "로그인하고 저장" : "기록에 저장"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading || !base}
              className="hc-button-secondary flex-1 rounded-full border px-4 py-3 text-sm font-semibold transition disabled:opacity-40"
            >
              {isDownloading ? "내려받는 중..." : "내려받기"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
