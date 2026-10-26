"use client";

import type { ApiEnvelope } from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";
import { getApiErrorDetails } from "@/lib/apiError";
import { fitCanvasScale } from "@/lib/canvas/canvasBudget";
import { clientApi } from "@/lib/clientApi";
import { decodeImageFile } from "@/lib/imageDecode";
import {
  EMPTY_UPLOAD_MESSAGE,
  MAX_UPLOAD_BYTES,
  MIN_UPLOAD_BYTES,
  UNSUPPORTED_UPLOAD_MESSAGE,
  UPLOAD_TOO_LARGE_MESSAGE,
  UploadValidationError,
  resolveUpload,
} from "@/lib/presignedUploadApi";
import { withRequestDeadline } from "@/lib/requestDeadline";

/**
 * 공통 이미지 자산(ADR-0006 §2) 업로드.
 *
 * presigned 업로드와 다른 점: 서버가 **올린 뒤에 바이트를 열어 본다**(complete). 형식·크기·화소가
 * 맞아야 VERIFIED 가 되고, VERIFIED 자산만 프레임에 쓸 수 있다(아니면 저장이 400 FRAME-005).
 * 그래서 이 경로로 올린 key 는 남의 key 를 끼워 넣거나 깨진 파일을 넣는 일이 서버에서 막힌다.
 *
 * 이 경로를 쓰는 곳: 편집기의 PHOTO·STICKER·배경(`FRAME_ASSET`)과 구운 글자(`TEXT_RENDER`).
 * 미리보기 PNG 는 해당 용도가 없어 presigned 로 남는다.
 */
export type AssetPurpose = "FRAME_ASSET" | "TEXT_RENDER";

type AssetContentType = "PNG" | "JPEG";

/** 용도별로 서버가 받는 형식(계약 UploadIntentRequest.contentType). WEBP 는 어느 용도에도 없다. */
const ALLOWED_TYPES: Record<AssetPurpose, readonly AssetContentType[]> = {
  FRAME_ASSET: ["PNG", "JPEG"],
  TEXT_RENDER: ["PNG"],
};

type UploadIntentData = {
  assetId: string;
  uploadUrl: string;
  method?: string;
  headers?: Record<string, string>;
};

type AssetData = {
  assetId: string;
  status: "PENDING_UPLOAD" | "VERIFIED" | "REJECTED";
  key?: string;
  url?: string;
  rejectReason?: string;
};

export type UploadedAsset = {
  assetId: string;
  /** S3 key. 컴포넌트 `source`·배경 `key` 자리에 그대로 쓴다. */
  key: string;
  /** VERIFIED 자산의 짧은 조회 URL(기본 5분). 그리기 전용이다. */
  url?: string;
};

/** 검증 혼잡(503 ASSET-006)일 때 complete 를 다시 부르기 전에 기다리는 시간. */
const COMPLETE_RETRY_DELAYS_MS = [1000, 2000];

const PNG_FILE_TYPE = "image/png";

function encodePng(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve<Blob | null>(null);
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, PNG_FILE_TYPE));
}

/**
 * 용도가 받는 형식으로 맞춘다. 맞으면 그대로, 아니면 PNG 로 다시 굽는다.
 *
 * PNG 인 이유: 바꿔야 하는 것은 WEBP·GIF·HEIC 인데, 스티커로 쓰는 WEBP·GIF 는 대개 투명하다.
 * JPEG 로 구우면 투명한 자리가 검게 칠해진다. (GIF 는 첫 장면만 남는다 — 합성 결과도 정지 그림이다.)
 */
export async function toAssetFile(file: File, purpose: AssetPurpose): Promise<File> {
  let contentType: string | null = null;
  try {
    contentType = resolveUpload(file).contentType;
  } catch {
    // HEIC 처럼 표에 없는 형식 — 아래에서 풀어 본다.
  }
  if (contentType && (ALLOWED_TYPES[purpose] as readonly string[]).includes(contentType)) {
    return file;
  }

  const decoded = await decodeImageFile(file);
  if (!decoded) {
    throw new UploadValidationError(`${UNSUPPORTED_UPLOAD_MESSAGE} (${file.type || file.name})`);
  }
  let scale = fitCanvasScale(decoded.width, decoded.height);
  const encode = () =>
    encodePng(
      decoded.source,
      Math.max(1, Math.floor(decoded.width * scale)),
      Math.max(1, Math.floor(decoded.height * scale)),
    );
  let blob = await encode();
  /*
    PNG 는 같은 화소라도 원본(WEBP 등)보다 몇 배 크다. 10MB 이하로 고른 사진이 바꾼 뒤 넘으면 업로드가 막히고
    같은 파일로 다시 해도 안 된다(Codex 리뷰 #527). JPEG 변환 경로(`toUploadableFile`)처럼, 넘긴 배수의 제곱근만큼
    변을 줄여 다시 굽는다. 배율이 매번 10% 이상 작아지므로 멈춘다.
  */
  while (blob && blob.size > MAX_UPLOAD_BYTES) {
    scale *= Math.sqrt(MAX_UPLOAD_BYTES / blob.size) * 0.9;
    blob = await encode();
  }
  if (!blob) {
    throw new UploadValidationError(`${UNSUPPORTED_UPLOAD_MESSAGE} (${file.type || file.name})`);
  }

  const dot = file.name.lastIndexOf(".");
  const base = (dot > 0 ? file.name.slice(0, dot) : file.name).trim() || "image";
  return new File([blob], `${base}.png`, { type: PNG_FILE_TYPE, lastModified: file.lastModified });
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function completeAsset(assetId: string): Promise<AssetData> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await clientApi.post<ApiEnvelope<AssetData>>(
        `/api/client/assets/${encodeURIComponent(assetId)}/complete`,
      );
      return requireData(res.data, "자산 확인");
    } catch (error) {
      if (getApiErrorDetails(error).code !== "ASSET-006" || attempt >= COMPLETE_RETRY_DELAYS_MS.length) {
        throw error;
      }
      await wait(COMPLETE_RETRY_DELAYS_MS[attempt]);
    }
  }
}

/** 업로드 의도 → S3 PUT → 완료 확인. VERIFIED 가 아니면 던진다. */
export async function uploadAsset(opts: { file: File; purpose: AssetPurpose }): Promise<UploadedAsset> {
  const file = await toAssetFile(opts.file, opts.purpose);
  if (file.size < MIN_UPLOAD_BYTES) throw new UploadValidationError(EMPTY_UPLOAD_MESSAGE);
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadValidationError(UPLOAD_TOO_LARGE_MESSAGE);

  const { contentType, filename } = resolveUpload(file);
  const intentRes = await clientApi.post<ApiEnvelope<UploadIntentData>>(
    "/api/client/assets/upload-intents",
    { purpose: opts.purpose, contentType, filename, fileSize: file.size },
  );
  const intent = requireData(intentRes.data, "업로드 주소");

  // 헤더는 서명에 들어가 있어 **받은 그대로** 보낸다. 빼거나 바꾸면 S3 가 403 이다.
  // fileSize 도 서명에 들어가므로 위에서 잰 그 file 을 그대로 PUT 한다.
  const putRes = await withRequestDeadline(60_000, (signal) =>
    fetch(intent.uploadUrl, {
      signal,
      method: intent.method ?? "PUT",
      headers: intent.headers ?? { "Content-Type": file.type },
      body: file,
    }),
  );
  if (!putRes.ok) throw new Error(`S3 upload failed: ${putRes.status}`);

  const asset = await completeAsset(intent.assetId);
  if (asset.status !== "VERIFIED" || !asset.key) {
    throw Object.assign(new Error(`asset not verified: ${asset.status}`), {
      code: asset.rejectReason,
    });
  }
  return { assetId: asset.assetId, key: asset.key, ...(asset.url ? { url: asset.url } : {}) };
}
