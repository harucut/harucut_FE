"use client";

import type { ApiEnvelope } from "@/lib/api-types";
import { clientApi } from "@/lib/clientApi";
import {
  PRESIGNED_UPLOAD_TYPES,
  uploadToS3WithPresigned,
} from "@/lib/presignedUploadApi";

type ApiError = Error & {
  status?: number;
};

async function requestProfileImageChange(s3Key: string) {
  try {
    await clientApi.patch<ApiEnvelope<null>>(
      "/api/client/user/change/profile-image",
      { s3Key },
    );
    return;
  } catch (err) {
    const status = (err as ApiError).status;
    if (status !== 404 && status !== 405) {
      throw err;
    }
  }

  await clientApi.post<ApiEnvelope<null>>("/api/client/user/change/profile-image", {
    s3Key,
  });
}

export async function uploadProfileImage(file: File) {
  if (!file) {
    throw new Error("No file selected");
  }

  if (!file.type.toLowerCase().startsWith("image/")) {
    throw new Error("Profile image must be an image file");
  }

  const { key } = await uploadToS3WithPresigned({
    file,
    type: PRESIGNED_UPLOAD_TYPES.PROFILE,
    isTemp: false,
  });

  await requestProfileImageChange(key);

  return { key };
}
