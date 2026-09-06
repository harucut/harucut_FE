"use client";

import type { ApiEnvelope } from "@/lib/api-types";
import { clientApi } from "@/lib/clientApi";
import {
  PRESIGNED_UPLOAD_TYPES,
  UNSUPPORTED_UPLOAD_MESSAGE,
  UploadValidationError,
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
    throw new UploadValidationError("파일을 선택해 주세요.");
  }

  // 업로드 형식 판정은 presignedUploadApi 한 곳(isSupportedUploadFile)으로 모은다.
  if (!isSupportedUploadFile(file)) {
    throw new UploadValidationError(UNSUPPORTED_UPLOAD_MESSAGE);
  }

  // 여기서 쓰는 것은 서버에 넘길 key 하나뿐이다. 바뀐 사진을 화면에 그릴 주소는
  // 변경 요청 뒤 다시 받아 오는 사용자 정보에서 오므로, 업로드가 덤으로 해 주는
  // 조회용 URL 해석(왕복 1회)은 통째로 버려진다 — 아예 건너뛴다.
  const { key } = await uploadToS3WithPresigned({
    file,
    type: PRESIGNED_UPLOAD_TYPES.PROFILE,
    skipUrlResolve: true,
  });

  await requestProfileImageChange(key);

  return { key };
}
