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

export const PRESIGNED_UPLOAD_TYPES = {
  FRAME: "FRAME",
  FRAME_COMPONENT: "FRAME_COMPONENT",
  PROFILE: "PROFILE",
  FOURCUT_VIDEO: "FOURCUT_VIDEO",
  FOURCUT_PHOTO: "FOURCUT_PHOTO",
} as const;

export type PresignedUploadType =
  (typeof PRESIGNED_UPLOAD_TYPES)[keyof typeof PRESIGNED_UPLOAD_TYPES];

type PresignedUploadRequest = {
  type: PresignedUploadType;
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

export function resolveFourcutUploadType(file: File): PresignedUploadType {
  const mime = file.type.toLowerCase();
  const contentType = resolveUploadContentType(file);

  if (
    mime.startsWith("video/") ||
    ["WEBM", "MP4", "MOV", "AVI", "MKV", "M4V"].includes(contentType)
  ) {
    return PRESIGNED_UPLOAD_TYPES.FOURCUT_VIDEO;
  }

  return PRESIGNED_UPLOAD_TYPES.FOURCUT_PHOTO;
}

function isImageContentType(contentType: string) {
  return ["PNG", "JPG", "JPEG", "WEBP"].includes(contentType);
}

function isWebmContentType(contentType: string) {
  return contentType === "WEBM";
}

function extractFilenameFromKey(key: string) {
  const filename = key.split("/").pop()?.trim();
  if (!filename) {
    throw new Error("Missing filename in uploaded key");
  }
  return filename;
}

function extractImageUrl(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directUrl = [
    record.url,
    record.imageUrl,
    record.downloadUrl,
    record.presignedUrl,
    record.presignedImgUrl,
    record.signedUrl,
  ].find((candidate): candidate is string => {
    return typeof candidate === "string" && candidate.trim().length > 0;
  });

  if (directUrl) {
    return directUrl;
  }

  return extractImageUrl(record.data);
}

async function requestPresignedImageUrl(key: string, fallbackUrl: string) {
  const res = await clientApi.get<ApiEnvelope<unknown>>(
    `/api/client/user/files/presigned-img?key=${encodeURIComponent(key)}`,
  );

  return extractImageUrl(res.data.data) ?? fallbackUrl;
}

async function requestTranscode(key: string) {
  await clientApi.post<ApiEnvelope<Record<string, never>>>(
    "/api/client/user/files/transcode",
    {
      filename: extractFilenameFromKey(key),
    },
  );
}

export async function uploadFourcutMedia(file: File) {
  return uploadToS3WithPresigned({
    file,
    type: resolveFourcutUploadType(file),
    isTemp: false,
  });
}

export async function uploadToS3WithPresigned(opts: {
  file: File;
  type: PresignedUploadType;
  isTemp: boolean;
}) {
  const { file, type, isTemp } = opts;
  const resolvedContentType = resolveUploadContentType(file);
  const body: PresignedUploadRequest = {
    type,
    filename: file.name,
    contentType: resolvedContentType,
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

  const fallbackObjectUrl = uploadUrl.split("?")[0] ?? uploadUrl;

  if (isWebmContentType(resolvedContentType)) {
    await requestTranscode(key);
  }

  const objectUrl = isImageContentType(resolvedContentType)
    ? await requestPresignedImageUrl(key, fallbackObjectUrl)
    : fallbackObjectUrl;

  return { key, objectUrl };
}
