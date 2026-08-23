"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventBanner } from "@/components/event/EventBanner";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
import { SUPPORTED_IMAGE_ACCEPT } from "@/lib/presignedUploadApi";
import { importPhotoFiles } from "@/lib/photoImport";
import { useShootSession } from "@/lib/shootSessionStore";

/** 네 컷이니 최소 4장은 있어야 다음으로 갈 수 있다. */
const MIN_PHOTOS = 4;

/**
 * 갤러리에서 사진을 불러오는 화면.
 *
 * 촬영 흐름에서 **카메라 대신 파일을 쓰는 단계**다. 여기서 사진을 촬영본과 같은 형태로
 * 맞춰 세션에 담고 나면, 그 뒤(4장 고르기 → 서버 합성 → 내려받기)는 촬영과 완전히 같은
 * 화면을 지난다 — 사진이 어디서 왔는지 알 필요가 없기 때문이다.
 */
export default function ShootUploadPage() {
  const router = useRouter();
  const frameId = useShootSession((state) => state.frameId);
  const shots = useShootSession((state) => state.shots);
  const eventName = useShootSession((state) => state.eventName);
  const addShotPhotos = useShootSession((state) => state.addShotPhotos);
  const removeShotPhoto = useShootSession((state) => state.removeShotPhoto);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // 불러온 사진이 있는데 아직 저장 전이면 새로고침/이탈 시 유실 경고를 띄운다.
  useUnsavedWorkGuard(shots.length > 0);

  useEffect(() => {
    // 프레임 없이 바로 들어오면 어느 판형으로 만들지 알 수 없다.
    if (!frameId) router.replace("/shoot?source=upload");
  }, [frameId, router]);

  const handleChangeFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // 같은 파일을 다시 고를 수 있게 값을 비운다(값이 남으면 change 가 안 뜬다).
    event.target.value = "";
    if (files.length === 0) return;

    setIsImporting(true);
    try {
      const { dataUrls, notice: importNotice } = await importPhotoFiles(files);
      if (dataUrls.length > 0) addShotPhotos(dataUrls);
      setNotice(importNotice);
    } finally {
      setIsImporting(false);
    }
  };

  const enough = shots.length >= MIN_PHOTOS;

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-[color:var(--hc-text)] lg:px-8 lg:py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 lg:max-w-3xl">
        <PageHeader
          title="사진 불러오기"
          description={`네 컷에 넣을 사진을 ${MIN_PHOTOS}장 이상 골라 주세요.`}
          backHref="/shoot?source=upload"
          backLabel="프레임 다시 선택"
        />

        {eventName ? <EventBanner eventName={eventName} /> : null}

        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_IMAGE_ACCEPT}
          multiple
          onChange={handleChangeFiles}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          className="hc-button-secondary flex h-12 items-center justify-center gap-2 rounded-2xl border text-[14px] font-semibold disabled:opacity-50"
        >
          <ImagePlus className="h-[18px] w-[18px]" />
          {isImporting ? "불러오는 중..." : "사진 고르기"}
        </button>

        {notice ? (
          <p role="status" className="text-[12px] leading-[1.6] text-[color:var(--hc-danger)]">
            {notice}
          </p>
        ) : null}

        {shots.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[color:var(--hc-border)] px-4 py-10 text-center text-[13px] leading-[1.7] text-[color:var(--hc-muted)]">
            아직 고른 사진이 없어요.
            <br />
            여러 장을 한 번에 고르고, 다음 단계에서 {MIN_PHOTOS}장을 정할 수 있어요.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {shots.map((src, index) => (
                <div
                  key={`${index}-${src.slice(-24)}`}
                  className="relative aspect-square overflow-hidden rounded-xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)]"
                >
                  {/* 사진은 data URL 이라 next/image 로 최적화할 것이 없다. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`불러온 사진 ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeShotPhoto(index)}
                    aria-label={`불러온 사진 ${index + 1} 빼기`}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <p className="text-[12px] text-[color:var(--hc-muted)]">
              {shots.length}장 골랐어요.
              {enough ? "" : ` ${MIN_PHOTOS - shots.length}장 더 필요해요.`}
            </p>
          </>
        )}

        <button
          type="button"
          onClick={() => router.push("/shoot/select")}
          disabled={!enough}
          className="hc-button-primary inline-flex h-12 items-center justify-center rounded-full text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enough ? "다음 단계로" : `사진을 ${MIN_PHOTOS}장 이상 골라 주세요`}
        </button>
      </div>
    </main>
  );
}
