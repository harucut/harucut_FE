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
  const title = useDecorateSession((s) => s.title);

  const base = useDecorateStore((s) => s.base);
  const setBase = useDecorateStore((s) => s.setBase);
  const reset = useDecorateStore((s) => s.reset);

  const accessMode = useGuestTrialStore((s) => s.accessMode);
  const setNotice = useGuestTrialStore((s) => s.setNotice);
  const guestMode = accessMode === "guest";

  const [isDownloading, setIsDownloading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 결과 화면에서 넘어온 이미지의 실제 크기를 읽어 베이스로 등록.
  useEffect(() => {
    if (!imageSrc) {
      router.replace("/home");
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
      if (active) router.replace("/home");
    };
    img.src = imageSrc;
    return () => {
      active = false;
    };
  }, [imageSrc, router, setBase]);

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
      const displayName = buildDefaultDisplayName(title, "IMAGE");
      downloadBlob(blob, buildDownloadFilename(displayName, "png"));
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
          const displayName = buildDefaultDisplayName(title, "IMAGE");
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
      const displayName = buildDefaultDisplayName(title, "IMAGE");
      const file = new File([blob], `${displayName}.png`, { type: "image/png" });
      await uploadGeneratedFourcutFile({
        file,
        kind: "IMAGE",
        displayName,
        extension: "png",
      });
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
    <main className="hc-page-app min-h-dvh px-4 py-6 text-[color:var(--hc-text)] lg:px-8 lg:py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 lg:max-w-5xl">
        <PageHeader
          title="네컷 꾸미기"
          brandHref={guestMode ? "/shoot" : "/home"}
          description="완성한 네컷에 스티커·텍스트를 얹고, 펜으로 자유롭게 그려 보세요."
        />

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="flex flex-1 justify-center">
            {base ? (
              <DecorateCanvas />
            ) : (
              <div className="flex h-[460px] w-full max-w-[340px] items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 text-[12px] text-zinc-500">
                불러오는 중...
              </div>
            )}
          </div>

          <div className="w-full lg:max-w-sm">
            <DecoratePanel />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading || !base}
            className="hc-button-primary flex-1 rounded-full px-4 py-3 text-sm font-semibold transition disabled:opacity-40"
          >
            {isDownloading ? "내려받는 중..." : "내려받기"}
          </button>
          <button
            type="button"
            onClick={handleSaveToRecords}
            disabled={isSaving || !base}
            className="hc-button-secondary flex-1 rounded-full border px-4 py-3 text-sm font-semibold transition disabled:opacity-40"
          >
            {isSaving ? "저장 중..." : guestMode ? "로그인하고 저장" : "기록에 저장"}
          </button>
        </div>
      </div>
    </main>
  );
}
