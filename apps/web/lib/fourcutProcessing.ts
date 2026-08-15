"use client";

import type { GeneratedFourcutAsset } from "@/lib/fourcutOutput";
import { sanitizeDisplayName } from "@/lib/fourcutOutput";
import { uploadFourcutMedia } from "@/lib/presignedUploadApi";

export async function uploadGeneratedFourcutFile(args: {
  file: File;
  displayName: string;
}) {
  const uploaded = await uploadFourcutMedia(args.file, {
    displayName: args.displayName,
  });

  return {
    mediaId: uploaded.mediaId,
    objectUrl: uploaded.objectUrl,
    downloadUrl: uploaded.downloadUrl,
    // 표시 이름은 그대로 다운로드 파일명이 되므로 금지 문자를 걷어낸 값으로 반환한다.
    // 호출부는 모두 buildDefaultDisplayName() 계열의 비어 있지 않은 이름을 넘긴다.
    displayName: sanitizeDisplayName(args.displayName, "harucut"),
  } satisfies GeneratedFourcutAsset;
}
