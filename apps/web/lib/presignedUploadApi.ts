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

// 스웨거 PresignedUploadRequest는 type·filename·contentType 세 필드만 받는다.
type PresignedUploadRequest = {
  type: PresignedUploadType;
  filename: string;
  contentType: PresignedUploadContentType;
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

// 백엔드 ContentType enum과 1:1(허용 확장자·MIME 모두 서버 계약 그대로).
const EXTENSION_TO_CONTENT_TYPE: Record<string, PresignedUploadContentType> = {
  gif: "GIF",
  jpeg: "JPEG",
  jpg: "JPEG",
  png: "PNG",
  webp: "WEBP",
};

const MIME_TO_CONTENT_TYPE: Record<string, PresignedUploadContentType> = {
  "image/gif": "GIF",
  "image/jpeg": "JPEG",
  "image/jpg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WEBP",
};

const CONTENT_TYPE_TO_EXTENSION: Record<PresignedUploadContentType, string> = {
  GIF: "gif",
  JPEG: "jpg",
  PNG: "png",
  WEBP: "webp",
};

/**
 * 업로드 형식과 파일명을 한 쌍으로 확정한다.
 *
 * 서버는 filename의 확장자와 contentType이 **같은 enum 항목에 동시에 속할 때만** presign을 내준다
 * (아니면 415 GEN-051). 그래서 확장자를 1순위로 보고, 확장자가 지원 목록 밖인데 MIME만 맞으면
 * (윈도우 크롬이 image/jpeg로 주는 .jfif/.pjpeg 등) 파일명 확장자를 형식에 맞춰 정규화한다.
 * S3 key의 확장자도 이 filename에서 나온다.
 */
export function resolveUpload(file: File): {
  contentType: PresignedUploadContentType;
  filename: string;
} {
  const ext = file.name.split(".").pop()?.trim().toLowerCase() ?? "";
  const contentType =
    EXTENSION_TO_CONTENT_TYPE[ext] ?? MIME_TO_CONTENT_TYPE[file.type.toLowerCase()];

  if (!contentType) {
    throw createUnsupportedTypeError(file);
  }

  const dot = file.name.lastIndexOf(".");
  const base = (dot > 0 ? file.name.slice(0, dot) : file.name).trim() || "upload";

  return { contentType, filename: `${base}.${CONTENT_TYPE_TO_EXTENSION[contentType]}` };
}

export function resolveUploadContentType(file: File): PresignedUploadContentType {
  return resolveUpload(file).contentType;
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
  });

  const media = await registerUserMedia({
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
}) {
  const { file, type } = opts;
  // 지원 형식만 통과시킨다(아니면 여기서 throw). 파일명은 형식에 맞춰 정규화된 이름을 쓴다.
  const resolved = resolveUpload(file);

  const body: PresignedUploadRequest = {
    type,
    filename: resolved.filename,
    contentType: resolved.contentType,
  };

  const presigned = await clientApi.post<ApiEnvelope<PresignedUploadData>>(
    "/api/client/user/files/presigned-upload",
    body,
  );

  const { key, uploadUrl, contentType } = presigned.data.data;
  // presigned PUT 서명에 content-type이 들어있다(X-Amz-SignedHeaders=content-type;host).
  // 헤더를 빼거나 다른 값을 쓰면 S3가 403 SignatureDoesNotMatch로 거절한다.
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
