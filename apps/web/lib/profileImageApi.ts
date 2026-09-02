"use client";

import type { ApiEnvelope } from "@/lib/api-types";
import { clientApi } from "@/lib/clientApi";
import { toUploadableFile } from "@/lib/imageDecode";
import {
  PRESIGNED_UPLOAD_TYPES,
  UploadValidationError,
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

  /*
    거르지 않고 **바꾼다.**

    예전에는 `isSupportedUploadFile` 로 막기만 했다. 그러면 아이폰 기본 설정으로 찍은
    사진(HEIC)은 프로필로 아예 못 쓴다 — 사용자가 고를 수 있는 사진 대부분이 그것이다.

    `toUploadableFile` 은 이미 올릴 수 있는 형식이면 **같은 파일을 그대로** 돌려주고,
    못 읽는 형식이면 예전과 같은 `UploadValidationError` 를 같은 문구로 던진다
    (`lib/imageDecode.ts`). 그래서 화면의 에러 처리는 손댈 것이 없다.
  */
  const uploadable = await toUploadableFile(file);

  const { key } = await uploadToS3WithPresigned({
    file: uploadable,
    type: PRESIGNED_UPLOAD_TYPES.PROFILE,
  });

  await requestProfileImageChange(key);

  return { key };
}
