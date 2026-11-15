"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FrameOutputOptionsPanel } from "@/components/frame/FrameOutputOptionsPanel";
import { FrameSelectPanel } from "@/components/frame/FrameSelectPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { useRemoteFrameThemeState } from "@/hooks/useRemoteFrameTheme";
import { useShootSession } from "@/lib/shootSessionStore";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { DEFAULT_FOURCUT_FILTER } from "@/lib/frameFilters";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
import { resolveFrameBackgroundColor } from "@/lib/themeBackground";
import { RetryButton } from "@/components/ui/LoadFailed";

export default function ShootSelectPage() {
  const router = useRouter();
  const {
    frameId,
    remoteFrameId,
    shots,
    selectedIndexes,
    borderColor,
    outputFilter,
    photoName,
    toggleSelect,
    setBorderColor,
    setOutputFilter,
    setPhotoName,
    source,
    resetShots,
  } = useShootSession();
  // 사진이 어디서 왔는지는 여기서 **문구에만** 쓴다. 고르는 방식도, 그 뒤 합성도 같다.
  const fromUpload = source === "upload";
  /*
    비회원은 보정을 고르지 못한다(2026-11-15 「비회원이면 보정은 선택 못하도록 해」). 견본은 잠근 채 보여 준다.
    쿠키를 읽기 전(첫 렌더)에는 누구인지 몰라 잠가 둔다 — 꾸미기는 처음에 접혀 있어 회원이 그 순간을 볼 일은 없다.
    비회원으로 확정되면 고른 보정도 기본으로 되돌린다(예전 세션에 남은 값).
  */
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const guestHydrated = useGuestTrialStore((state) => state.hydrated);
  const isGuest = guestHydrated && accessMode === "guest";
  const filtersLocked = !guestHydrated || isGuest;
  useEffect(() => {
    if (isGuest && outputFilter !== DEFAULT_FOURCUT_FILTER) setOutputFilter(DEFAULT_FOURCUT_FILTER);
  }, [isGuest, outputFilter, setOutputFilter]);
  const sourceHref = fromUpload ? "/shoot/upload" : "/shoot/capture";
  // 성공과 실패를 따로 받는다. 못 읽은 것을 "꾸민 프레임이 아니다"로 뭉개면
  // 잠겨야 할 테두리 색 고르기가 열린다.
  const {
    data: themeData,
    error: themeError,
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

  useEffect(() => { router.prefetch("/shoot/result"); }, [router, selectedIndexes]);

  // 잠금은 내용이 아니라 "꾸민 프레임인가"로 가른다. 서버 합성은 remoteFrameId 만 보고
  // 프레임에 저장된 배경을 쓰며 보낸 색은 버린다(lib/fourcutCompose.ts 의 usesStoredBackground).
  // 내용을 못 읽었다고 고르기를 열어 주면, 고른 색은 저장될 때 조용히 사라진다.
  // 꾸민 프레임이면 꾸미기에 테두리 고르기가 아예 없다. 못 읽었으면 그 사실은 아래 배너가 말한다.
  const hasCustomFrame = remoteFrameId != null;
  // 보정 견본에는 내 사진을 깐다 — 고른 첫 장, 아직 안 골랐으면 찍은 첫 장.
  const firstSelected = selectedIndexes.find((index) => index != null);
  const samplePhoto = shots[firstSelected ?? 0] ?? null;
  // 고른 색이 곧 저장본의 색이다 — 서버 합성에 그 색을 실어 보낸다. 꾸민 프레임일 때만
  // 프레임에 저장된 배경을 쓴다(resolveFrameBackgroundColor 가 themeData 를 먼저 본다).
  // 내용을 못 읽었으면 미리보기는 마지막으로 고른 색으로 그리는데 저장본은 프레임에 저장된
  // 배경으로 나온다 — 그래서 아래 배너로 못 읽었다는 사실을 말한다.
  const effectiveBorderColor = resolveFrameBackgroundColor(themeData, borderColor);

  // 고르기 화면 기록을 완성 화면으로 바꿔 낀다(2026-11-15). 완성된 뒤에는 다시 고르지 않는데, 기록에 이 화면이
  // 남아 있으면 뒤로가기가 여기 들렀다가 완성 화면으로 되돌려져(ShootSessionBoundary) 먹지 않는 것처럼 보인다.
  // 촬영 화면이 다 찍고 여기로 올 때 replace 하는 것과 같은 까닭이다.
  const handleNext = () => {
    router.replace("/shoot/result");
  };

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-(--hc-text)">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <PageHeader
          title="사진 선택"
          backHref={sourceHref}
          backLabel={fromUpload ? "사진 다시 고르기" : "다시 찍기"}
          // 다시 찍기는 처음부터 새로 찍는다. 찍은 사진을 들고 가면 촬영 화면이 다 찍은 것으로 보고
          // 이 화면으로 되돌린다(useCaptureFlow). 불러온 사진은 불러오기 화면이 다시 고르게 둔다.
          // 새 탭·새 창으로 여는 클릭(⌘/Ctrl/Shift/Alt, 가운데 단추)은 이 탭을 떠나지 않으니 비우지 않는다 —
          // 찍은 사진은 이 탭의 저장소에만 있어 새 탭으로 가지 않는다.
          onBackClick={
            fromUpload
              ? undefined
              : (event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  resetShots();
                }
          }
        />


        {/* 조회가 실패해도 테두리 색은 잠긴 채다. 왜 못 바꾸는지와 되살릴 길을 같이 준다. */}
        {themeError ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-(--hc-border) bg-(--hc-surface) px-4 py-3"
          >
            <p className="text-[12px] leading-[1.6] text-(--hc-muted)">
              프레임을 불러오지 못해 배경색을 바꿀 수 없어요.
            </p>
            <RetryButton onClick={reloadTheme} />
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
              : "찍은 사진이 없어요. 다시 찍어 주세요."
          }
          incompleteButtonLabel="4장을 골라 주세요"
          nextButtonLabel="다음 단계로"
          onToggleSelect={toggleSelect}
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
              samplePhoto={samplePhoto}
              filtersLocked={filtersLocked}
              photoName={photoName}
              onPhotoNameChange={setPhotoName}
            />
          )}
        />
      </div>
    </main>
  );
}
