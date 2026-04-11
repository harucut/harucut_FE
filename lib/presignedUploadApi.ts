"use client";

import type {
  ApiEnvelope,
  PresignedUploadContentType,
  TranscodeTaskStatusResponse,
  TranscodeTaskSubmitResponse,
} from "@/lib/api-types";
import { clientApi } from "@/lib/clientApi";
import { registerUserMedia } from "@/lib/userMediaApi";

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

const TRANSCODE_POLL_INTERVAL_MS = 2_500;
const TRANSCODE_POLL_TIMEOUT_MS = 90_000;

export const SUPPORTED_IMAGE_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif";
export const SUPPORTED_VIDEO_ACCEPT =
  "video/mp4,video/webm,video/quicktime";
export const SUPPORTED_FOURCUT_ACCEPT = `${SUPPORTED_IMAGE_ACCEPT},${SUPPORTED_VIDEO_ACCEPT}`;

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
  contentType: PresignedUploadContentType;
  isTemp: boolean;
};

function isImageContentType(contentType: PresignedUploadContentType) {
  return ["PNG", "JPEG", "WEBP", "GIF"].includes(contentType);
}

function isVideoContentType(contentType: PresignedUploadContentType) {
  return ["MP4", "WEBM", "MOV"].includes(contentType);
}

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
  const res = await clientApi.post<ApiEnvelope<TranscodeTaskSubmitResponse>>(
    "/api/client/user/files/transcode",
    {
      filename: extractFilenameFromKey(key),
    },
  );

  return res.data.data;
}

async function requestTranscodeStatus(taskId: string) {
  const res = await clientApi.get<ApiEnvelope<TranscodeTaskStatusResponse>>(
    `/api/client/user/files/transcode/status?taskId=${encodeURIComponent(taskId)}`,
    {
      cache: "no-store",
    },
  );

  return res.data.data;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForTranscodeMedia(taskId: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < TRANSCODE_POLL_TIMEOUT_MS) {
    const status = await requestTranscodeStatus(taskId);

    if (status.status === "COMPLETE" && status.media) {
      return status.media;
    }

    if (status.status === "ERROR") {
      throw new Error(status.errorMessage || "Video transcode failed");
    }

    await sleep(TRANSCODE_POLL_INTERVAL_MS);
  }

  throw new Error("Video transcode timed out");
}

function createUnsupportedTypeError(file: File) {
  return new Error(`Unsupported upload file type: ${file.type || file.name}`);
}

export function resolveUploadContentType(file: File): PresignedUploadContentType {
  const mime = file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.trim().toLowerCase();

  if (mime === "image/png" || ext === "png") return "PNG";
  if (mime === "image/jpeg" || mime === "image/jpg" || ext === "jpg" || ext === "jpeg") {
    return "JPEG";
  }
  if (mime === "image/webp" || ext === "webp") return "WEBP";
  if (mime === "image/gif" || ext === "gif") return "GIF";
  if (mime === "video/mp4" || ext === "mp4") return "MP4";
  if (mime === "video/webm" || ext === "webm") return "WEBM";
  if (mime === "video/quicktime" || ext === "mov") return "MOV";

  throw createUnsupportedTypeError(file);
}

export function resolveFourcutUploadType(file: File): PresignedUploadType {
  const contentType = resolveUploadContentType(file);
  return isVideoContentType(contentType)
    ? PRESIGNED_UPLOAD_TYPES.FOURCUT_VIDEO
    : PRESIGNED_UPLOAD_TYPES.FOURCUT_PHOTO;
}

export async function uploadFourcutMedia(file: File) {
  const contentType = resolveUploadContentType(file);
  const uploaded = await uploadToS3WithPresigned({
    file,
    type: resolveFourcutUploadType(file),
    isTemp: false,
  });

  if (isImageContentType(contentType)) {
    const media = await registerUserMedia({
      mediaType: "PHOTO",
      s3Key: uploaded.key,
    });

    return {
      key: uploaded.key,
      mediaId: media.mediaId,
      objectUrl: media.downloadUrl ?? uploaded.objectUrl,
      downloadUrl: media.downloadUrl ?? uploaded.downloadUrl,
    };
  }

  if (contentType === "WEBM") {
    const task = await requestTranscode(uploaded.key);
    const media = await waitForTranscodeMedia(task.taskId);

    return {
      key: media.s3Key ?? uploaded.key,
      mediaId: media.mediaId,
      objectUrl: media.downloadUrl ?? uploaded.objectUrl,
      downloadUrl: media.downloadUrl ?? uploaded.downloadUrl,
    };
  }

  const media = await registerUserMedia({
    mediaType: "VIDEO",
    s3Key: uploaded.key,
  });

  return {
    key: uploaded.key,
    mediaId: media.mediaId,
    objectUrl: media.downloadUrl ?? uploaded.objectUrl,
    downloadUrl: media.downloadUrl ?? uploaded.downloadUrl,
  };
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

  if (isImageContentType(resolvedContentType) || resolvedContentType === "WEBM") {
    const uploadedMediaInfo = await requestUploadedMediaInfo(key, fallbackObjectUrl);
    return {
      key,
      objectUrl: uploadedMediaInfo.objectUrl,
      downloadUrl: uploadedMediaInfo.downloadUrl,
    };
  }

  return { key, objectUrl: fallbackObjectUrl };
}
