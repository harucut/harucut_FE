"use client";

import { clientApi } from "@/lib/clientApi";

type ApiEnvelope<T> = {
  code: string;
  status: number;
  message: string | null;
  data: T;
};

type PresignedUploadData = {
  key: string;
  uploadUrl: string;
  contentType: string;
  expiresIn: string;
};

type PresignedUploadRequest = {
  type: string;
  filename: string;
  contentType: string;
  isTemp: boolean;
};

export function resolveUploadContentType(file: File) {
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

export async function uploadToS3WithPresigned(opts: {
  file: File;
  type: string;
  isTemp: boolean;
}) {
  const { file, type, isTemp } = opts;
  const body: PresignedUploadRequest = {
    type,
    filename: file.name,
    contentType: resolveUploadContentType(file),
    isTemp,
  };

  const presigned = await clientApi.post<ApiEnvelope<PresignedUploadData>>(
    "/api/client/user/files/presigned-upload",
    body,
  );

  const { key, uploadUrl, contentType } = presigned.data.data;
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error(`S3 upload failed: ${uploadRes.status}`);
  }

  const objectUrl = uploadUrl.split("?")[0] ?? uploadUrl;
  return { key, objectUrl };
}
