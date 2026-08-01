"use client";

import type { ApiEnvelope } from "@/lib/api-types";
import { clientApi } from "@/lib/clientApi";
import {
  PRESIGNED_UPLOAD_TYPES,
  UNSUPPORTED_UPLOAD_MESSAGE,
  isSupportedUploadFile,
  uploadToS3WithPresigned,
} from "@/lib/presignedUploadApi";

// 스웨거상 프로필 이미지 변경은 PATCH만 존재한다(POST는 405). 이전의 POST 폴백을 제거.
async function requestProfileImageChange(s3Key: string) {
  await clientApi.patch<ApiEnvelope<null>>(
    "/api/client/user/change/profile-image",
    { s3Key },
  );
}

export async function uploadProfileImage(file: File) {
  if (!file) {
    throw new Error("파일을 선택해 주세요.");
  }

  // 업로드 형식 판정은 presignedUploadApi 한 곳(isSupportedUploadFile)으로 모은다.
  if (!isSupportedUploadFile(file)) {
    throw new Error(UNSUPPORTED_UPLOAD_MESSAGE);
  }

  const { key } = await uploadToS3WithPresigned({
    file,
    type: PRESIGNED_UPLOAD_TYPES.PROFILE,
    isTemp: false,
  });

  await requestProfileImageChange(key);

  return { key };
}
