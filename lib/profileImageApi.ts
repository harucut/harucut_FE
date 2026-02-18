"use client";

import { clientApi } from "@/lib/clientApi";

type ApiEnvelope<T> = {
  code: string;
  status: number;
  message: string | null;
  data: T;
};

type PresignedUploadRequest = {
  type: "PROFILE";
  filename: string;
  contentType: string;
  isTemp: boolean;
};

type PresignedUploadData = {
  key: string;
  uploadUrl: string;
  contentType: string;
  expiresIn: string;
};

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

  const reqBody: PresignedUploadRequest = {
    type: "PROFILE",
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    isTemp: false,
  };

  const presigned = await clientApi.post<ApiEnvelope<PresignedUploadData>>(
    "/api/client/user/files/presigned-upload",
    reqBody,
  );

  const { key, uploadUrl, contentType } = presigned.data.data;
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType || reqBody.contentType,
    },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error(`S3 upload failed: ${uploadRes.status}`);
  }

  await requestProfileImageChange(key);

  return { key };
}

