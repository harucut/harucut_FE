"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FrameOutputOptionsPanel } from "@/components/frame/FrameOutputOptionsPanel";
import { FrameSelectPanel } from "@/components/frame/FrameSelectPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventBanner } from "@/components/event/EventBanner";
import { useRemoteFrameTheme } from "@/hooks/useRemoteFrameTheme";
import { useShootSession } from "@/lib/shootSessionStore";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
import { resolveFrameBackgroundColor } from "@/lib/themeBackground";

export default function ShootSelectPage() {
  const router = useRouter();
  const {
    frameId,
    remoteFrameId,
    shots,
    selectedIndexes,
    borderColor,
    outputFilter,
    toggleSelect,
    clearSelection,
    setBorderColor,
    setOutputFilter,
    eventName,
    source,
  } = useShootSession();
  // 사진이 어디서 왔는지는 여기서 **문구에만** 쓴다. 고르는 방식도, 그 뒤 합성도 같다.
  const fromUpload = source === "upload";
  const sourceHref = fromUpload ? "/shoot/upload" : "/shoot/capture";
  const themeData = useRemoteFrameTheme(remoteFrameId, frameId);
  // 아직 저장 전인 촬영본이 있으면 새로고침/이탈 시 유실 경고를 띄운다.
  useUnsavedWorkGuard(shots.length > 0);

  useEffect(() => {
    if (!frameId) {
      router.replace("/shoot");
      return;
    }

    if (!shots.length) {
      router.replace(sourceHref);
    }
  }, [frameId, router, shots.length, sourceHref]);

  const hasCustomFrame = Boolean(themeData);
  // 고른 색이 곧 저장본의 색이다 — 서버 합성에 그 색을 실어 보낸다. 꾸민 프레임일 때만
  // 프레임에 저장된 배경을 쓴다(resolveFrameBackgroundColor 가 themeData 를 먼저 본다).
  const effectiveBorderColor = resolveFrameBackgroundColor(themeData, borderColor);

  const handleNext = () => {
    router.push("/shoot/result");
  };

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-(--hc-text)">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <PageHeader
          title="사진 선택"
          backHref={sourceHref}
          backLabel={fromUpload ? "사진 다시 고르기" : "다시 촬영"}
        />

        {eventName ? <EventBanner eventName={eventName} /> : null}

        <FrameSelectPanel
          frameId={frameId ?? null}
          images={shots}
          selectedIndexes={selectedIndexes}
          maxSelect={4}
          emptyStateText={
            fromUpload
              ? "불러온 사진이 없어요. 사진을 다시 골라 주세요."
              : "촬영한 사진이 없어요. 다시 촬영해 주세요."
          }
          incompleteButtonLabel="4장을 골라 주세요"
          nextButtonLabel="다음 단계로"
          onToggleSelect={toggleSelect}
          onReset={clearSelection}
          onNext={handleNext}
          themeData={themeData}
          borderColor={effectiveBorderColor}
          outputFilter={outputFilter}
          renderExtraControls={() => (
            <FrameOutputOptionsPanel
              borderColor={borderColor}
              onBorderColorChange={setBorderColor}
              outputFilter={outputFilter}
              onOutputFilterChange={setOutputFilter}
              hasCustomFrame={hasCustomFrame}
            />
          )}
        />
      </div>
    </main>
  );
}
