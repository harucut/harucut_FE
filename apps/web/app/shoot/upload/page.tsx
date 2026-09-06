"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventBanner } from "@/components/event/EventBanner";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
import { SUPPORTED_IMAGE_ACCEPT } from "@/lib/presignedUploadApi";
import { importPhotoFiles } from "@/lib/photoImport";
import { useShootSession } from "@/lib/shootSessionStore";

/**
 * 칸 수를 모를 때(프레임 없이 들어온 순간)의 기본값. 그 상태는 아래 effect 가 곧
 * `/shoot` 로 되돌리므로 한 프레임만 산다.
 */
const FALLBACK_SLOT_COUNT = Math.max(
  ...Object.values(FRAME_LAYOUTS).map((layout) => layout.slots.length),
);

/**
 * 담아 둘 수 있는 최대 장수 = 칸 수 × 이 배수.
 *
 * 앨범에서 수백 장을 고르면 그 전부가 최대 2400px JPEG data URL 로 디코딩·재인코딩된 뒤
 * 세션과 DOM 에 남는다. 다음 단계에서 쓰는 것은 칸 수만큼뿐인데 모바일 웹뷰에서는 이
 * 흐름만으로 수백 MB 를 잡아 화면이 멈춘다. 고르고 남을 만큼은 받고 그 위는 변환 전에 자른다.
 */
const PHOTOS_PER_SLOT = 6;

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

  /*
    장수는 **이 세션의 프레임** 칸 수에서 뽑는다.

    전체 레이아웃의 최대 칸 수로 잡으면 지금은 넷 다 4컷이라 같은 값이지만, 6컷 프레임이
    하나 생기는 순간 4컷으로 찍는 사람에게 6장을 요구하게 된다 — 화면이 요구하는 수는
    사용자가 고른 프레임이 정한다.
  */
  const slotCount = frameId
    ? FRAME_LAYOUTS[frameId].slots.length
    : FALLBACK_SLOT_COUNT;
  /** 칸을 다 채워야 다음으로 갈 수 있다. */
  const minPhotos = slotCount;
  const maxPhotos = slotCount * PHOTOS_PER_SLOT;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // 불러온 사진이 있는데 아직 저장 전이면 새로고침/이탈 시 유실 경고를 띄운다.
  useUnsavedWorkGuard(shots.length > 0);

  useEffect(() => {
    // 프레임 없이 바로 들어오면 어느 판형으로 만들지 알 수 없다.
    if (!frameId) router.replace("/shoot?source=upload");
  }, [frameId, router]);

  const overLimitNotice = (count: number) =>
    `사진은 최대 ${maxPhotos}장까지 담을 수 있어 ${count}장은 제외했어요.`;

  const handleChangeFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // 같은 파일을 다시 고를 수 있게 값을 비운다(값이 남으면 change 가 안 뜬다).
    event.target.value = "";
    if (files.length === 0) return;

    // 이미 담아 둔 것까지 합쳐 남은 자리를 센다.
    const room = Math.max(0, maxPhotos - shots.length);
    // 꽉 찼으면 형식을 볼 것도 없다 — 무엇을 골랐든 한 장도 못 담는다.
    if (room === 0) {
      setNotice(overLimitNotice(files.length));
      return;
    }

    setIsImporting(true);
    try {
      /*
        고른 것을 **통째로** 넘기고 상한은 인자로 준다.

        여기서 먼저 잘라 버리면 지원하지 않는 형식이 앞에 몰렸을 때 쓸 수 있는 사진이
        상한 밖으로 밀려난다(28장 중 앞 24장이 heic 면 남는 것이 0장이었다). 형식을 아는
        곳이 거른 뒤에 자르고, 자르는 자리는 여전히 디코딩 앞이다.
      */
      const { dataUrls, notice: importNotice, overLimitCount } =
        await importPhotoFiles(files, { limit: room });
      if (dataUrls.length > 0) addShotPhotos(dataUrls);
      setNotice(
        [overLimitCount > 0 ? overLimitNotice(overLimitCount) : null, importNotice]
          .filter(Boolean)
          .join(" ") || null,
      );
    } finally {
      setIsImporting(false);
    }
  };

  const enough = shots.length >= minPhotos;

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-[color:var(--hc-text)] lg:px-8 lg:py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 lg:max-w-3xl">
        <PageHeader
          title="사진 불러오기"
          // 장수가 프레임에서 오므로 문구도 "네 컷"으로 박지 않는다.
          description={`이 프레임에 넣을 사진을 ${minPhotos}장 이상 골라 주세요.`}
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
          {isImporting ? "불러오는 중…" : "사진 고르기"}
        </button>

        {notice ? (
          // 제외 안내는 오류가 아니라 알림이다 — 위험색(빨강)을 쓰지 않는다.
          <p role="status" className="text-[12px] leading-[1.6] text-[color:var(--hc-muted)]">
            {notice}
          </p>
        ) : null}

        {shots.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[color:var(--hc-border)] px-4 py-10 text-center text-[13px] leading-[1.7] text-[color:var(--hc-muted)]">
            아직 고른 사진이 없어요.
            <br />
            여러 장을 한 번에 고르고, 다음 단계에서 {minPhotos}장을 정할 수 있어요.
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
                  {/* 보이는 원은 24px, 눌리는 면은 44px. 터치 규칙(min-height 44)이 폭 24 버튼을
                      세로 타원으로 늘리던 것을 막는다. */}
                  <button
                    type="button"
                    onClick={() => removeShotPhoto(index)}
                    aria-label={`불러온 사진 ${index + 1} 빼기`}
                    className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-full"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white">
                      <X className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </div>
              ))}
            </div>

            <p className="text-[12px] text-[color:var(--hc-muted)]">
              {shots.length}장 골랐어요.
              {enough ? "" : ` ${minPhotos - shots.length}장 더 필요해요.`}
            </p>
          </>
        )}

        <button
          type="button"
          onClick={() => router.push("/shoot/select")}
          disabled={!enough}
          className="hc-button-primary inline-flex h-12 items-center justify-center rounded-full text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enough ? "다음 단계로" : `사진을 ${minPhotos}장 이상 골라 주세요`}
        </button>
      </div>
    </main>
  );
}
