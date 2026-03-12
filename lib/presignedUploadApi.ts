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

type UploadedMediaInfo = {
  objectUrl: string;
  downloadUrl?: string;
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

function normalizeRemoteUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const markdownMatch = trimmed.match(/\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch?.[1]) {
    return markdownMatch[1];
  }

  const urlMatches = trimmed.match(/https?:\/\/[^\s)\]]+/gi);
  if (urlMatches && urlMatches.length > 0) {
    return urlMatches[urlMatches.length - 1];
  }

  return null;
}

function extractUploadedMediaInfo(value: unknown): UploadedMediaInfo | null {
  if (typeof value === "string") {
    const url = normalizeRemoteUrl(value);
    return url ? { objectUrl: url, downloadUrl: url } : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const downloadUrl = normalizeRemoteUrl(
    typeof record.downloadUrl === "string" ? record.downloadUrl : null,
  );
  const objectUrl =
    normalizeRemoteUrl(typeof record.url === "string" ? record.url : null) ??
    normalizeRemoteUrl(
      typeof record.imageUrl === "string" ? record.imageUrl : null,
    ) ??
    normalizeRemoteUrl(
      typeof record.presignedUrl === "string" ? record.presignedUrl : null,
    ) ??
    normalizeRemoteUrl(
      typeof record.presignedImgUrl === "string" ? record.presignedImgUrl : null,
    ) ??
    normalizeRemoteUrl(
      typeof record.signedUrl === "string" ? record.signedUrl : null,
    ) ??
    downloadUrl;

  if (objectUrl) {
    return {
      objectUrl,
      downloadUrl: downloadUrl ?? objectUrl,
    };
  }

  return extractUploadedMediaInfo(record.data);
}

async function requestUploadedMediaInfo(
  key: string,
  fallbackUrl: string,
): Promise<UploadedMediaInfo> {
  const res = await clientApi.get<ApiEnvelope<unknown>>(
    `/api/client/user/files/presigned-img?key=${encodeURIComponent(key)}`,
  );

  const mediaInfo = extractUploadedMediaInfo(res.data.data);
  if (mediaInfo) {
    return mediaInfo;
  }

  return { objectUrl: fallbackUrl };
}

function extractFilenameFromKey(key: string) {
  const filename = key.split("/").pop()?.trim();
  if (!filename) {
    throw new Error("Missing filename in uploaded key");
  }
  return filename;
}

async function requestTranscode(key: string) {
  await clientApi.post<ApiEnvelope<Record<string, never>>>(
    "/api/client/user/files/transcode",
    {
      filename: extractFilenameFromKey(key),
    },
  );
}

function isImageContentType(contentType: string) {
  return ["PNG", "JPG", "JPEG", "WEBP"].includes(contentType);
}

function isWebmContentType(contentType: string) {
  return contentType === "WEBM";
}

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

  if (isImageContentType(resolvedContentType) || isWebmContentType(resolvedContentType)) {
    const uploadedMediaInfo = await requestUploadedMediaInfo(key, fallbackObjectUrl);
    return {
      key,
      objectUrl: uploadedMediaInfo.objectUrl,
      downloadUrl: uploadedMediaInfo.downloadUrl,
    };
  }

  return { key, objectUrl: fallbackObjectUrl };
}
