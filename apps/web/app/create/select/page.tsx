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
import { usePhotoImport } from "@/hooks/usePhotoImport";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { SUPPORTED_IMAGE_ACCEPT } from "@/lib/presignedUploadApi";

/**
 * 담아 둘 수 있는 최대 장수 = 칸 수 × 이 배수(갤러리에서 불러올 때).
 *
 * 앨범에서 수백 장을 고르면 그 전부가 화소 예산(5.76MP)까지 줄인 JPEG data URL 로 디코딩·재인코딩된 뒤 세션과
 * DOM 에 남는다. 쓰는 것은 칸 수만큼뿐인데 모바일 웹뷰에서는 이 흐름만으로 수백 MB 를 잡아 화면이 멈춘다.
 * 고르고 남을 만큼은 받고 그 위는 변환 전에 자른다.
 */
const PHOTOS_PER_SLOT = 6;

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
    addShotPhotos,
    removeShotPhoto,
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
  /*
    갤러리에서 불러오기는 따로 화면이 없다 — 프레임을 고르면 바로 이 화면이고, 사진 목록 맨 앞 「사진 불러오기」
    칸으로 불러온다(2026-11-15 「프레임 고르고 나면 바로 사진 고르기로 들어가서 거기서 올릴 수 있게」). 뒤로가기는
    프레임을 다시 고르는 것이고, 불러온 사진은 들고 간다(keepShots — 갤러리 사진은 어느 프레임에도 다시 쓴다).
    불러온 사진은 목록에 올라갈 뿐이고, 칸에는 찍은 사진처럼 눌러서 넣는다(2026-11-15 「올라간 다음에 선택해서 넣는
    거야 자동으로 안 넣어져」). 예전에는 빈 칸부터 차례로 들어갔고, 그걸 말하는 안내 한 줄이 목록 위에 있었다.
    불러오기는 회원만 쓴다. 들어오기 전에 프레임 고르기가 확인했고(app/create/page.tsx), 여기서는 이 기기가 아는
    상태로 칸을 보인다. 그 사이 비회원이 되면 불러온 사진을 버리고 회원 전용 안내로 돌려보낸다(아래 effect).
  */
  const sourceHref = fromUpload ? "/create?source=upload&keepShots=1" : "/create/capture";
  const canImport = fromUpload && guestHydrated && accessMode === "member";
  const slotCount = frameId ? FRAME_LAYOUTS[frameId].slots.length : 4;
  // 꺼내 쓴다 — 훅이 돌려주는 묶음에 ref 가 섞여 있어 묶음째 렌더에서 읽으면 React Compiler 가 막는다.
  const {
    inputRef: importInputRef,
    open: openImport,
    onChange: onImportChange,
    isImporting,
    notice: importNotice,
    cancel: cancelImport,
    full: importFull,
  } = usePhotoImport({
    maxPhotos: slotCount * PHOTOS_PER_SLOT,
    currentCount: shots.length,
    onImported: addShotPhotos,
  });
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
      router.replace("/create");
      return;
    }

    // 찍은 사진이 없으면 찍으러 돌아간다. 불러오기는 사진이 없을 때 이 화면에서 불러온다.
    if (!shots.length && !fromUpload) {
      router.replace(sourceHref);
    }
  }, [frameId, fromUpload, router, shots.length, sourceHref]);

  /*
    불러온 사진은 비회원이 쓰지 못한다. 이 화면에 있는 동안 비회원으로 바뀌면(세션이 끊겼다고 확인됨) 진행 중이던
    변환과 불러온 사진을 버리고 회원 전용 안내로 돌려보낸다 — 고르기·결과는 비회원도 쓰는 경로라, 남겨 두면 그
    사진으로 기기에서 합성까지 간다. 사진을 먼저 비워야 /create 가 「촬영하던 사진이 있어요」를 띄우지 않는다.
  */
  useEffect(() => {
    if (!fromUpload || !isGuest) return;
    cancelImport();
    resetShots();
    router.replace(`/create?guestNotice=restricted${frameId ? `&frame=${frameId}` : ""}`);
  }, [cancelImport, fromUpload, isGuest, frameId, resetShots, router]);

  useEffect(() => { router.prefetch("/create/result"); }, [router, selectedIndexes]);

  /*
    테두리 색은 기본 프레임에서만 고른다 — 저장한(꾸민) 프레임을 골랐으면 꾸미기에 색 고르기가 없다(2026-11-15
    「저장된 프레임 골랐을 때만 색 고르는 걸 없애라는 거였지」). 잠금은 내용이 아니라 "꾸민 프레임인가"로 가른다.
    서버 합성은 remoteFrameId 만 보고 프레임에 저장된 배경을 쓰며 보낸 색은 버린다(lib/fourcutCompose.ts 의
    usesStoredBackground). 내용을 못 읽었다고 고르기를 열어 주면, 고른 색은 저장될 때 조용히 사라진다.
    못 읽었으면 그 사실은 아래 배너가 말한다.
  */
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
    router.replace("/create/result");
  };

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-(--hc-text)">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <PageHeader
          title="사진 선택"
          backHref={sourceHref}
          backLabel={fromUpload ? "프레임 다시 고르기" : "다시 찍기"}
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

        {/* 갤러리 선택기. 보이지 않게 두고 「사진 불러오기」 칸이 연다(hooks/usePhotoImport). */}
        {fromUpload ? (
          <input
            ref={importInputRef}
            type="file"
            accept={SUPPORTED_IMAGE_ACCEPT}
            multiple
            onChange={(event) => void onImportChange(event)}
            disabled={!canImport}
            className="hidden"
          />
        ) : null}

        <FrameSelectPanel
          frameId={frameId ?? null}
          images={shots}
          selectedIndexes={selectedIndexes}
          maxSelect={4}
          emptyStateText="찍은 사진이 없어요. 다시 찍어 주세요."
          onAddPhotos={canImport ? () => void openImport() : undefined}
          addingPhotos={isImporting}
          addPhotosDisabled={importFull}
          onRemovePhoto={canImport ? removeShotPhoto : undefined}
          photosNotice={importNotice}
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
