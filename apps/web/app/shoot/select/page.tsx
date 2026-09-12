"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FrameOutputOptionsPanel } from "@/components/frame/FrameOutputOptionsPanel";
import { FrameSelectPanel } from "@/components/frame/FrameSelectPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventBanner } from "@/components/event/EventBanner";
import { useRemoteFrameThemeState } from "@/hooks/useRemoteFrameTheme";
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
  // 성공·실패·조회 중을 따로 받는다. 못 읽은 것을 "꾸민 프레임이 아니다"로 뭉개면
  // 잠겨야 할 배경색 고르기가 열린다.
  const {
    data: themeData,
    error: themeError,
    isLoading: themeLoading,
    reload: reloadTheme,
  } = useRemoteFrameThemeState(remoteFrameId, frameId);
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

  // 잠금은 내용이 아니라 "꾸민 프레임인가"로 가른다. 서버 합성은 remoteFrameId 만 보고
  // 프레임에 저장된 배경을 쓰며 보낸 색은 버린다(lib/fourcutCompose.ts 의 usesStoredBackground).
  // 내용을 못 읽었다고 고르기를 열어 주면, 고른 색은 저장될 때 조용히 사라진다.
  const hasCustomFrame = remoteFrameId != null;
  // 잠긴 이유는 둘이다 — "프레임이 배경을 정해 뒀다"와 "그 내용을 못 읽었다".
  // 조회가 끝난 뒤에만 뒤쪽으로 본다. 조회 중에 단정하면 곧 뒤집힌다.
  const themeUnavailable = hasCustomFrame && !themeLoading && !themeData;
  // 고른 색이 곧 저장본의 색이다 — 서버 합성에 그 색을 실어 보낸다. 꾸민 프레임일 때만
  // 프레임에 저장된 배경을 쓴다(resolveFrameBackgroundColor 가 themeData 를 먼저 본다).
  // 내용을 못 읽었으면 미리보기는 마지막으로 고른 색으로 그리는데 저장본은 프레임에 저장된
  // 배경으로 나온다 — 그래서 아래 배너로 못 읽었다는 사실을 말한다.
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

        {/* 조회가 실패해도 배경색은 잠긴 채다. 왜 잠겼는지와 되살릴 길을 같이 준다. */}
        {themeError ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-(--hc-border) bg-(--hc-surface) px-4 py-3"
          >
            <p className="text-[12px] leading-[1.6] text-(--hc-muted)">
              프레임을 불러오지 못해 배경색을 바꿀 수 없어요.
            </p>
            <button
              type="button"
              onClick={reloadTheme}
              className="inline-flex h-11 items-center rounded-full border border-(--hc-border) px-4 text-[12px] text-(--hc-text)"
            >
              다시 불러오기
            </button>
          </div>
        ) : null}

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
              themeUnavailable={themeUnavailable}
            />
          )}
        />
      </div>
    </main>
  );
}
