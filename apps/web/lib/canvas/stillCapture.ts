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
 * ## 안 쓰는 경우 — **두 번 잰다**
 *
 * `takePhoto()` 가 늘 더 큰 것은 아니다. 스틸이 영상과 같거나 더 작은 기기가 있다
 * (스틸 파이프라인이 다른 프로파일을 쓸 때). 그때는 느린 경로를 탈 이유가 없다.
 *
 * 1. **켤 때** — `getPhotoCapabilities()` 의 최대 크기로 견준다. 이득이 없으면 촬영기를
 *    아예 만들지 않는다(`prepareStillCapture`).
 * 2. **첫 장에서** — 받아 온 비트맵의 **실제 크기**로 다시 견준다(`takeStillBitmap`).
 *
 * 2번이 왜 필요한가 — 기능 목록의 최대값은 **찍을 수 있는 한계**지, 이번에 찍히는 크기가
 * 아니다. 크기를 지정하지 않고 부르면 기기는 자기 **기본 스틸 해상도**를 준다. 그 값이
 * 최대값보다, 심하면 지금 영상 프레임보다 작은 기기가 있다. 1번만 믿으면 그런 기기에서
 * 여덟 장 전부가 영상 프레임보다 낮은 해상도로 저장된다 — 화질을 올리려고 붙인 경로가
 * 반대로 깎는다.
 *
 * 크기를 명시해(`takePhoto({ imageWidth, imageHeight })`) 부르는 길도 있지만, 위 표의
 * 실측이 **인자 없는 호출**만 확인한 것이라 여기서는 쓰지 않는다. 실측 재비교는 기기가
 * 무엇을 주든 성립한다.
 */

type PhotoRange = { max?: number; min?: number };
type PhotoCapabilities = { imageWidth?: PhotoRange; imageHeight?: PhotoRange };
type ImageCaptureLike = {
  takePhoto: () => Promise<Blob>;
  getPhotoCapabilities: () => Promise<PhotoCapabilities>;
};
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

/**
 * 촬영기와, 실측으로 다시 견줄 때 필요한 값들.
 *
 * 견주는 값을 여기 들고 다니는 이유 — 재비교는 매 컷 일어나는데 호출부(useCaptureFlow)는
 * 이 판정을 알 필요가 없다. 켤 때 잰 것을 그대로 들고 있으면 촬영 자리는 그대로 둔 채
 * 판정만 이 파일 안에서 끝난다.
 */
export type StillCapture = {
  capture: ImageCaptureLike;
  /** 이 스트림의 영상 프레임 크기. 실측한 스틸을 이것과 다시 견준다. */
  videoWidth: number;
  videoHeight: number;
  /** 최종 슬롯 비율. 견주는 기준은 슬롯에 남는 화소다(captureCrop.ts stillBeatsVideo). */
  slotAspect: number;
  /**
   * 실측이 기능 목록을 배신한 기기. 한 번 확인되면 남은 컷은 재지 않는다.
   *
   * 스틸 크기는 촬영 도중 바뀌지 않는다 — 같은 트랙, 같은 설정이다. 그런데도 매 컷
   * `takePhoto()` 를 부르면 버릴 사진을 찍느라 셔터만 수백 ms 씩 늦어진다.
   */
  givenUp: boolean;
};

function getCtor(): ImageCaptureCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
  return typeof ctor === "function" ? ctor : null;
}

/**
 * 이 스트림에서 스틸 촬영이 이득이면 촬영기를 돌려준다. 아니면 null.
 *
 * 카메라를 켤 때 **한 번만** 부른다 — 매 컷 재 보면 셔터가 그만큼 늦어진다.
 *
 * 여기서 보는 것은 기능 목록의 **최대** 크기라 이득의 상한일 뿐이다. 실제로 찍히는 크기는
 * 첫 장에서 다시 잰다(위 「안 쓰는 경우」 2번).
 */
export async function prepareStillCapture(
  track: MediaStreamTrack,
  slotAspect: number,
): Promise<StillCapture | null> {
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

    if (
      !stillBeatsVideo({
        photoWidth,
        photoHeight,
        videoWidth,
        videoHeight,
        slotAspect,
      })
    ) {
      return null;
    }

    return { capture, videoWidth, videoHeight, slotAspect, givenUp: false };
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
 *
 * **받은 비트맵의 실제 크기로 한 번 더 견준다.** 영상 프레임보다 나을 게 없으면 그 사진을
 * 버리고 null 을 돌려준다 — 잘라 쓸 화소가 늘지 않는데 사진 쪽으로 가면 화질만 깎인다.
 *
 * 두 실패를 가른다.
 * - **던졌다** — 간헐적 실패. 다음 컷은 다시 시도한다.
 * - **작았다** — 이 기기의 성질. 다음 컷부터는 찍지도 않는다(`givenUp`).
 */
export async function takeStillBitmap(
  still: StillCapture,
): Promise<ImageBitmap | null> {
  if (still.givenUp) return null;

  try {
    const blob = await still.capture.takePhoto();
    const bitmap = await createImageBitmap(blob);

    if (
      !stillBeatsVideo({
        photoWidth: bitmap.width,
        photoHeight: bitmap.height,
        videoWidth: still.videoWidth,
        videoHeight: still.videoHeight,
        slotAspect: still.slotAspect,
      })
    ) {
      still.givenUp = true;
      // 쓰지 않을 비트맵은 바로 놓아준다. 8장을 도는 흐름이라 쌓이면 그대로 메모리다.
      bitmap.close();
      return null;
    }

    return bitmap;
  } catch {
    return null;
  }
}
