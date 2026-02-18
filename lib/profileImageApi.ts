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

function resolveUploadContentType(file: File) {
  const mime = file.type.toLowerCase();

  if (mime === "image/png") return "PNG";
  if (mime === "image/jpeg") {
    return file.name.toLowerCase().endsWith(".jpg") ? "JPG" : "JPEG";
  }
  if (mime === "image/jpg") return "JPG";
  if (mime === "image/webp") return "WEBP";
  if (mime === "video/webm") return "WEBM";

  const ext = file.name.split(".").pop()?.trim().toUpperCase();
  if (ext) return ext;
  return "BIN";
}

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
    contentType: resolveUploadContentType(file),
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
