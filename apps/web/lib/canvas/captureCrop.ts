export type CropRect = { sx: number; sy: number; sw: number; sh: number };

/** 가운데를 기준으로 원하는 비율만큼 잘라낸다. 이미 그 비율이면 그대로 둔다. */
export function centerCrop(
  width: number,
  height: number,
  targetAspect: number,
): CropRect {
  const aspect = width / height;
  if (aspect > targetAspect) {
    const sw = height * targetAspect;
    return { sx: (width - sw) / 2, sy: 0, sw, sh: height };
  }
  if (aspect < targetAspect) {
    const sh = width / targetAspect;
    return { sx: 0, sy: (height - sh) / 2, sw: width, sh };
  }
  return { sx: 0, sy: 0, sw: width, sh: height };
}

/**
 * 스틸 사진(ImageCapture.takePhoto)에서 **화면에 보이던 만큼**을 잘라낸다.
 *
 * 왜 두 번 자르나 — 스틸은 프리뷰와 **화각이 다르다.** 폰 대부분은 사진이 4:3(센서 전체)이고
 * 영상은 그 4:3 을 위아래로 잘라낸 16:9 다. 그래서 사진을 곧장 슬롯 비율로 자르면 사용자가
 * 프리뷰에서 본 적 없는 위아래가 결과물에 들어온다 — 찍은 것과 나온 것이 달라진다.
 *
 * 그래서 **먼저 프리뷰 비율로 잘라 화각을 맞추고**, 그 안에서 슬롯 비율로 다시 자른다.
 * 가로 화각은 사진과 영상이 같다는 전제인데, 같은 렌즈에서 영상이 사진의 세로를 잘라
 * 만들어지므로 성립한다.
 *
 * 반환 좌표는 **원본 사진 좌표계**다(바로 drawImage 에 넣을 수 있다).
 */
export function cropPhotoToPreviewThenSlot(args: {
  photoWidth: number;
  photoHeight: number;
  previewAspect: number;
  slotAspect: number;
}): CropRect {
  const { photoWidth, photoHeight, previewAspect, slotAspect } = args;

  // 1단계 — 프리뷰가 보여 주던 화각.
  const fov = centerCrop(photoWidth, photoHeight, previewAspect);

  // 2단계 — 그 안에서 슬롯 비율. 좌표를 원본 기준으로 되돌린다.
  const slot = centerCrop(fov.sw, fov.sh, slotAspect);

  return {
    sx: fov.sx + slot.sx,
    sy: fov.sy + slot.sy,
    sw: slot.sw,
    sh: slot.sh,
  };
}

/**
 * 스틸을 쓰는 게 이득인가.
 *
 * `takePhoto()` 가 늘 더 큰 것은 아니다. 어떤 기기는 영상 스트림과 같은 크기를 주고,
 * 어떤 기기는 **더 작은** 스틸을 준다(스틸 파이프라인이 다른 프로파일을 쓸 때).
 * 그때는 굳이 느린 경로를 탈 이유가 없다 — 잘라 쓸 화소가 늘지 않기 때문이다.
 *
 * 비교는 **최종 슬롯에 들어갈 화소 수**로 한다. 사진 전체 크기가 아니라, 화각을 맞추고
 * 슬롯 비율로 자른 뒤 남는 넓이가 실제로 쓰이는 값이다.
 */
export function stillBeatsVideo(args: {
  photoWidth: number;
  photoHeight: number;
  videoWidth: number;
  videoHeight: number;
  slotAspect: number;
}): boolean {
  const { photoWidth, photoHeight, videoWidth, videoHeight, slotAspect } = args;
  const previewAspect = videoWidth / videoHeight;

  const still = cropPhotoToPreviewThenSlot({
    photoWidth,
    photoHeight,
    previewAspect,
    slotAspect,
  });
  const video = centerCrop(videoWidth, videoHeight, slotAspect);

  // 폭만 견줘도 충분하다 — 둘 다 같은 비율로 잘린 뒤라 넓이 비교와 결과가 같다.
  return still.sw > video.sw * 1.01;
}
