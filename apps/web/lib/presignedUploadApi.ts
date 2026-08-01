"use client";

import type {
  ApiEnvelope,
  PresignedUploadContentType,
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

export const SUPPORTED_IMAGE_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif";

// 지원하지 않는 형식(heic/avif/bmp/svg 등)을 고른 사용자에게 보여줄 공통 안내.
export const UNSUPPORTED_UPLOAD_MESSAGE =
  "PNG·JPG·WEBP·GIF만 올릴 수 있어요.";

export const PRESIGNED_UPLOAD_TYPES = {
  FRAME: "FRAME",
  FRAME_COMPONENT: "FRAME_COMPONENT",
  PROFILE: "PROFILE",
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

// 저장된 S3 key를 화면/합성용 다운로드 URL로 해석한다. 실패 시 null(호출부에서 색 폴백).
export async function getImageUrlByKey(key: string): Promise<string | null> {
  if (!key) return null;

  try {
    const res = await clientApi.get<ApiEnvelope<unknown>>(
      `/api/client/user/files/presigned-img?key=${encodeURIComponent(key)}`,
    );
    const info = extractUploadedMediaInfo(res.data.data);
    return info?.downloadUrl ?? info?.objectUrl ?? null;
  } catch {
    return null;
  }
}

// 사용자 화면에 그대로 노출돼도 되도록 한국어 문구로 만든다(디버깅용 원본 형식은 뒤에 덧붙임).
function createUnsupportedTypeError(file: File) {
  return new Error(
    `${UNSUPPORTED_UPLOAD_MESSAGE} (${file.type || file.name})`,
  );
}

// 업로드 가능한 형식인지 미리 확인한다. 파일 선택 즉시 걸러내는 용도.
export function isSupportedUploadFile(file: File) {
  try {
    resolveUploadContentType(file);
    return true;
  } catch {
    return false;
  }
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

  throw createUnsupportedTypeError(file);
}

export async function uploadFourcutMedia(
  file: File,
  opts: { displayName?: string } = {},
) {
  // 지원하지 않는 파일 타입이면 업로드 전에 throw 한다.
  resolveUploadContentType(file);

  const uploaded = await uploadToS3WithPresigned({
    file,
    type: PRESIGNED_UPLOAD_TYPES.FOURCUT_PHOTO,
    isTemp: false,
  });

  const media = await registerUserMedia({
    mediaType: "PHOTO",
    s3Key: uploaded.key,
    ...(opts.displayName ? { displayName: opts.displayName } : {}),
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
  // 지원 형식만 통과시킨다(아니면 여기서 throw).
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

  // 업로드 가능한 형식은 전부 이미지라 항상 다운로드 URL을 해석한다.
  const uploadedMediaInfo = await requestUploadedMediaInfo(key, fallbackObjectUrl);
  return {
    key,
    objectUrl: uploadedMediaInfo.objectUrl,
    downloadUrl: uploadedMediaInfo.downloadUrl,
  };
}
