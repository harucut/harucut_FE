"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope } from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";

/**
 * 서버 초안(ADR-0006 §5). 다른 기기에서 이어 편집하려고 둔다 — 같은 기기의 새로고침 복구는
 * 여전히 localStorage 초안(`lib/themeEditorDraft.ts`)이 맡는다.
 *
 * 서버는 `document` 를 해석하지 않는다. 대신 `assetIds` 가 「이 초안이 아직 쓰는 자산」의
 * 근거라서, 빠뜨린 자산은 정리 배치가 지울 수 있다(`lib/serverEditorDocument.ts` 가 함께 만든다).
 */
export type FrameDraftSummary = {
  draftId: string;
  /** 새 프레임 초안이면 null. */
  frameId: number | null;
  /** 다음 저장에 그대로 보낼 값. */
  revision: number;
  updatedAt: string;
};

export type FrameDraft = FrameDraftSummary & { document: unknown };

/** 다른 기기가 먼저 저장했다(409 DRAFT-001). `data` 에 서버의 지금 revision 이 실린다. */
export const DRAFT_CONFLICT_CODE = "DRAFT-001";
/** 초안 문서가 256KB 를 넘었다(413 DRAFT-002). */
export const DRAFT_TOO_LARGE_CODE = "DRAFT-002";

/** 저장본 수정이면 그 프레임 id, 새 프레임이면 `new`. 목록은 최근 것이 앞이라고 가정하지 않는다. */
export async function listFrameDrafts(frameId: number | "new"): Promise<FrameDraftSummary[]> {
  const res = await clientApi.get<ApiEnvelope<FrameDraftSummary[]>>(
    `/api/client/user/frame-drafts?frameId=${frameId}`,
  );
  return res.data.data ?? [];
}

export async function getFrameDraft(draftId: string): Promise<FrameDraft> {
  const res = await clientApi.get<ApiEnvelope<FrameDraft>>(
    `/api/client/user/frame-drafts/${encodeURIComponent(draftId)}`,
  );
  return requireData(res.data, "초안");
}

export async function createFrameDraft(body: {
  frameId?: number;
  document: unknown;
  assetIds: string[];
}): Promise<FrameDraft> {
  const res = await clientApi.post<ApiEnvelope<FrameDraft>>("/api/client/user/frame-drafts", body);
  return requireData(res.data, "초안");
}

export async function updateFrameDraft(
  draftId: string,
  body: { revision: number; document: unknown; assetIds: string[] },
): Promise<FrameDraft> {
  const res = await clientApi.put<ApiEnvelope<FrameDraft>>(
    `/api/client/user/frame-drafts/${encodeURIComponent(draftId)}`,
    body,
  );
  return requireData(res.data, "초안");
}

export async function deleteFrameDraft(draftId: string): Promise<void> {
  await clientApi.delete(`/api/client/user/frame-drafts/${encodeURIComponent(draftId)}`);
}
