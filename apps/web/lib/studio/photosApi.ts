"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope } from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";
import type { StudioEvent } from "@/lib/studio/studioApi";

/**
 * 행사 사진함(ADR-0008 §3). 권한은 매 요청 서버가 본다 — 볼 수 없는 행사는 404, 볼 수는 있지만 그 동작 권한이
 * 없으면 403 PHOTO-001.
 */
export type PhotoStatus = "PENDING" | "DONE" | "FAILED";
export type PhotoChannel = "BYOD" | "BOOTH";

export type Photo = {
  /** 합성 작업 id. */
  photoId: number;
  status: PhotoStatus;
  createdAt: string;
  channel: PhotoChannel;
  frameVersionId: number;
  /** DONE 일 때만. presigned GET 5분 — 목록을 다시 받으면 새 주소. */
  thumbnailUrl?: string | null;
  /** FAILED 일 때만. 내부 예외가 아니라 코드와 재시도 가능 여부. */
  failure?: { code: string; retryable: boolean } | null;
};

export type PhotoPage = { items: Photo[]; nextCursor?: string | null };

export type PhotoFilter = { status?: PhotoStatus; channel?: PhotoChannel };

export const PHOTO_PAGE_SIZE = 30;

export async function listEventPhotos(eventId: string, filter: PhotoFilter, cursor?: string | null): Promise<PhotoPage> {
  const query = new URLSearchParams({ limit: String(PHOTO_PAGE_SIZE) });
  if (cursor) query.set("cursor", cursor);
  if (filter.status) query.set("status", filter.status);
  if (filter.channel) query.set("channel", filter.channel);
  const res = await clientApi.get<ApiEnvelope<PhotoPage>>(
    `/api/client/events/${encodeURIComponent(eventId)}/photos?${query.toString()}`,
  );
  return res.data.data ?? { items: [] };
}

/** 5분짜리 내려받기 주소. 파일 이름(「{행사명}-{photoId}.jpg」)은 서버가 붙인다. */
export async function getEventPhotoDownload(eventId: string, photoId: number): Promise<{ url: string; expiresAt: string }> {
  const res = await clientApi.post<ApiEnvelope<{ url: string; expiresAt: string }>>(
    `/api/client/events/${encodeURIComponent(eventId)}/photos/${photoId}/download`,
  );
  return requireData(res.data, "내려받기 주소");
}

export async function deleteEventPhoto(eventId: string, photoId: number): Promise<void> {
  await clientApi.delete(`/api/client/events/${encodeURIComponent(eventId)}/photos/${photoId}`);
}

/** 설정 · 테마 · 제공 프레임만 새 초안으로 복제한다. 사진 · 참가자 · 고객 · 부스는 복제하지 않는다. */
export async function cloneEvent(eventId: string, name: string, slug: string): Promise<StudioEvent> {
  const res = await clientApi.post<ApiEnvelope<StudioEvent>>(`/api/client/events/${encodeURIComponent(eventId)}/clone`, {
    name,
    slug,
  });
  return requireData(res.data, "행사");
}

// ── 묶음 다운로드(ZIP, ADR-0008 §4) ──

export type ExportStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "EXPIRED";

export type PhotoExport = {
  exportId: string;
  status: ExportStatus;
  photoCount: number;
  sizeBytes?: number | null;
  /** DONE 일 때만 — 이 시각 뒤에는 받을 수 없다(24시간). */
  expiresAt?: string | null;
  createdAt: string;
};

/** 한 묶음에 담을 수 있는 최대 장수(백엔드 event.export.max-photos). 넘으면 400 EXPORT-003. */
export const MAX_EXPORT_PHOTOS = 2000;

/** 고른 사진(photoIds) 또는 필터. 둘 다 없으면 완성 사진 전부. */
export async function createPhotoExport(
  eventId: string,
  target: { photoIds: number[] } | { filter: { channel?: PhotoChannel } },
): Promise<PhotoExport> {
  const res = await clientApi.post<ApiEnvelope<PhotoExport>>(
    `/api/client/events/${encodeURIComponent(eventId)}/exports`,
    target,
  );
  return requireData(res.data, "묶음");
}

export async function listPhotoExports(eventId: string): Promise<PhotoExport[]> {
  const res = await clientApi.get<ApiEnvelope<PhotoExport[]>>(`/api/client/events/${encodeURIComponent(eventId)}/exports`);
  return res.data.data ?? [];
}

/** 받을 때마다 서버가 권한 · 기한 · 담긴 사진을 다시 본다. 준비 전 409 EXPORT-001, 만료 · 무효 410 EXPORT-002. */
export async function getPhotoExportDownload(eventId: string, exportId: string): Promise<{ url: string; expiresAt: string }> {
  const res = await clientApi.post<ApiEnvelope<{ url: string; expiresAt: string }>>(
    `/api/client/events/${encodeURIComponent(eventId)}/exports/${encodeURIComponent(exportId)}/download`,
  );
  return requireData(res.data, "내려받기 주소");
}
