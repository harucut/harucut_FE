"use client";

import type {
  ApiEnvelope,
  PresignedUploadContentType,
} from "@/lib/api-types";
import { clientApi } from "@/lib/clientApi";
import { requireData } from "@/lib/apiEnvelope";

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
  /**
   * 네컷 합성에 넣을 **원본** 사진.
   *
   * 개명은 끝났다. 새 백엔드에는 `FOURCUT_SOURCE` 만 있고 옛 이름 `FOURCUT_PHOTO` 는
   * 400(GEN-006)으로 거부된다(2026-08-20 실측). 그래서 두 이름을 번갈아 시도하던 폴백을
   * 걷어냈다 — 남겨 두면 아래 fileSize 같은 검증 실패(400)를 "서버가 모르는 이름"으로
   * 오해해 쓸데없이 두 번 왕복한 뒤 엉뚱한 에러를 던진다.
   *
   * ⚠️ **완성된 네컷을 올리는 타입은 없다.** 결과물은 서버 합성 API 가 만들어 저장한다
   * (스웨거 PresignedUploadRequest.type 설명). docs/backend-contract.md 참고.
   */
  FOURCUT_SOURCE: "FOURCUT_SOURCE",
} as const;

/** 백엔드 제한: 1 ~ 10485760 바이트. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const UPLOAD_TOO_LARGE_MESSAGE = "10MB 이하 이미지만 올릴 수 있어요.";

export type PresignedUploadType =
  (typeof PRESIGNED_UPLOAD_TYPES)[keyof typeof PRESIGNED_UPLOAD_TYPES];

// 스웨거 PresignedUploadRequest 는 네 필드 전부 required 다.
// fileSize 를 빼면 400 GEN-003("파일 크기는 필수입니다.") 이 온다 — 실측.
type PresignedUploadRequest = {
  type: PresignedUploadType;
  filename: string;
  contentType: PresignedUploadContentType;
  fileSize: number;
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
 * (아니면 415 GEN-051). 그래서 형식을 먼저 확정하고 파일명 확장자를 거기에 맞춰 다시 붙인다.
 * S3 key의 확장자도 이 filename에서 나온다.
 *
 * MIME을 확장자보다 먼저 본다. 실제 바이트를 더 잘 반영하고, 확장자가 지원 목록 밖인 경우
 * (윈도우 크롬이 image/jpeg로 주는 .jfif/.pjpeg 등)도 같은 규칙으로 처리된다.
 * (앱은 웹뷰 셸이 된 뒤로 자체 업로드 경로가 없다 — 이 규칙 하나만 남았다.)
 */
export function resolveUpload(file: File): {
  contentType: PresignedUploadContentType;
  filename: string;
} {
  const ext = file.name.split(".").pop()?.trim().toLowerCase() ?? "";
  const contentType =
    MIME_TO_CONTENT_TYPE[file.type.toLowerCase()] ?? EXTENSION_TO_CONTENT_TYPE[ext];

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

/** presigned URL 을 받아 온다. */
async function requestPresignedUpload(body: PresignedUploadRequest) {
  return clientApi.post<ApiEnvelope<PresignedUploadData>>(
    "/api/client/user/files/presigned-upload",
    body,
  );
}

export async function uploadToS3WithPresigned(opts: {
  file: File;
  type: PresignedUploadType;
  /**
   * 조회용 URL 해석을 건너뛴다.
   *
   * 합성 원본처럼 **key 만 필요한** 업로드에 쓴다. 원본은 합성 직후 서버가 지우므로
   * 볼 일이 없는데, 기본 경로는 장당 presigned-img 를 한 번씩 더 부른다(4장이면 4번).
   */
  skipUrlResolve?: boolean;
}) {
  const { file, type } = opts;
  // 지원 형식만 통과시킨다(아니면 여기서 throw). 파일명은 형식에 맞춰 정규화된 이름을 쓴다.
  const resolved = resolveUpload(file);

  // 서버 한도를 넘는 파일은 발급 요청 전에 막는다. 그냥 보내면 400 GEN-003 이 오는데,
  // 그 문구보다 여기서 크기를 짚어 주는 편이 사용자에게 낫다.
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(UPLOAD_TOO_LARGE_MESSAGE);
  }

  const presigned = await requestPresignedUpload({
    type,
    filename: resolved.filename,
    contentType: resolved.contentType,
    // 이 값이 서명에 Content-Length 로 들어간다. 발급 후 다른 파일을 올리면 S3 가
    // SignatureDoesNotMatch 로 거부하므로, 같은 file 객체를 그대로 PUT 해야 한다.
    fileSize: file.size,
  });

  const { key, uploadUrl, contentType } = requireData(
    presigned.data,
    "업로드 주소",
  );
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

  if (opts.skipUrlResolve) {
    return { key, objectUrl: fallbackObjectUrl, downloadUrl: undefined };
  }

  // 업로드 가능한 형식은 전부 이미지라 항상 다운로드 URL을 해석한다.
  const uploadedMediaInfo = await requestUploadedMediaInfo(key, fallbackObjectUrl);
  return {
    key,
    objectUrl: uploadedMediaInfo.objectUrl,
    downloadUrl: uploadedMediaInfo.downloadUrl,
  };
}
