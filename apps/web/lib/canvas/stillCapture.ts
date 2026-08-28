"use client";

import { stillBeatsVideo } from "@/lib/canvas/captureCrop";

/**
 * 스틸 촬영(ImageCapture) 붙이기.
 *
 * ## 왜
 *
 * 지금 촬영은 **영상 프레임을 캔버스로 긁는다.** 영상 스트림은 대개 사진보다 작고, 영상용
 * 처리 파이프라인이라 다중프레임 노이즈 제거 같은 것이 빠져 상대적으로 무르다.
 * `ImageCapture.takePhoto()` 는 **사진 파이프라인**을 그대로 탄다 — 카메라 앱이 찍는 그 경로다.
 *
 * ## 어디서 되나 (2026-08-28 Playwright 로 실제 호출해 확인)
 *
 * | 엔진 | ImageCapture | takePhoto() |
 * |---|---|---|
 * | Chromium (안드로이드 계열) | 있음 | 동작 |
 * | WebKit 26.5 (iOS Safari 계열) | 있음 | 동작 |
 *
 * ⚠️ WebKit 쪽은 **Playwright 빌드에서 확인한 것**이다. 실제 iOS Safari 는 기능이 늦게
 * 열리는 일이 잦으므로, 없으면 조용히 예전 경로로 떨어지게 해 뒀다. 실기기 확인은
 * `scripts/camera-probe.html` 로 한다.
 *
 * ## 안 쓰는 경우
 *
 * `takePhoto()` 가 늘 더 큰 것은 아니다. 스틸이 영상과 같거나 더 작은 기기가 있다
 * (스틸 파이프라인이 다른 프로파일을 쓸 때). 그때는 느린 경로를 탈 이유가 없어서
 * 카메라를 켤 때 한 번 재 보고 이득일 때만 쓴다.
 */

type PhotoRange = { max?: number; min?: number };
type PhotoCapabilities = { imageWidth?: PhotoRange; imageHeight?: PhotoRange };
type ImageCaptureLike = {
  takePhoto: () => Promise<Blob>;
  getPhotoCapabilities: () => Promise<PhotoCapabilities>;
};
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

function getCtor(): ImageCaptureCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
  return typeof ctor === "function" ? ctor : null;
}

/**
 * 이 스트림에서 스틸 촬영이 이득이면 촬영기를 돌려준다. 아니면 null.
 *
 * 카메라를 켤 때 **한 번만** 부른다 — 매 컷 재 보면 셔터가 그만큼 늦어진다.
 */
export async function prepareStillCapture(
  track: MediaStreamTrack,
  slotAspect: number,
): Promise<ImageCaptureLike | null> {
  const Ctor = getCtor();
  if (!Ctor) return null;

  try {
    const capture = new Ctor(track);
    const caps = await capture.getPhotoCapabilities();
    const photoWidth = caps.imageWidth?.max;
    const photoHeight = caps.imageHeight?.max;
    if (!photoWidth || !photoHeight) return null;

    const settings = track.getSettings();
    const videoWidth = settings.width;
    const videoHeight = settings.height;
    if (!videoWidth || !videoHeight) return null;

    return stillBeatsVideo({
      photoWidth,
      photoHeight,
      videoWidth,
      videoHeight,
      slotAspect,
    })
      ? capture
      : null;
  } catch {
    // 기기가 스틸을 지원하지 않거나 권한 상태가 애매하면 여기로 온다. 예전 경로로 간다.
    return null;
  }
}

/**
 * 스틸 한 장을 비트맵으로. 실패하면 null — 호출부가 영상 프레임으로 되돌아간다.
 *
 * 되돌아갈 길을 반드시 남긴다. 기기에 따라 `takePhoto()` 가 간헐적으로 실패하는데,
 * 그때 촬영 자체를 실패시키면 사용자는 이유를 알 수 없는 빈 컷을 얻는다.
 */
export async function takeStillBitmap(
  capture: ImageCaptureLike,
): Promise<ImageBitmap | null> {
  try {
    const blob = await capture.takePhoto();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}
