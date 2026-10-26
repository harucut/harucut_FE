"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FrameId } from "@/constants/frames";
import { getApiErrorDetails } from "@/lib/apiError";
import { resolveThemeAssetUrls } from "@/lib/frameAssets";
import {
  DRAFT_CONFLICT_CODE,
  DRAFT_TOO_LARGE_CODE,
  createFrameDraft,
  deleteFrameDraft,
  getFrameDraft,
  listFrameDrafts,
  updateFrameDraft,
  type FrameDraftSummary,
} from "@/lib/frameDraftApi";
import { getImageUrlByKey } from "@/lib/presignedUploadApi";
import { parseServerDocument, toServerDocument, type ServerEditorDocument } from "@/lib/serverEditorDocument";
import { loadEditorDraft } from "@/lib/themeEditorDraft";
import { useThemeEditorStore } from "@/lib/themeEditorStore";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

/** 편집이 멈추고 이만큼 지나면 서버 초안을 쓴다. 로컬 초안(1초)보다 길다 — 왕복과 업로드가 든다. */
export const SERVER_DRAFT_DEBOUNCE_MS = 4000;

/** 열 때 문서까지 받아 볼 초안 수. 판형이 다른 새 프레임 초안이 섞여 있어 최근 몇 개만 본다. */
const DRAFTS_TO_INSPECT = 3;

/**
 * 같은 기기에서 방금 쓴 초안을 「다른 기기의 초안」으로 묻지 않으려고 두는 여유.
 * 로컬 초안은 1초마다, 서버 초안은 4초 뒤에 쓰므로 같은 기기라면 로컬이 늘 더 새롭다.
 */
const SAME_DEVICE_SLACK_MS = 2000;

export type ServerDraftStatus = "idle" | "saving" | "saved" | "error" | "tooLarge";

type Found = { draftId: string; revision: number; updatedAt: string; document: ServerEditorDocument };

function newestFirst(a: FrameDraftSummary, b: FrameDraftSummary) {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

function currentDocument() {
  const s = useThemeEditorStore.getState();
  if (!s.frameId) return null;
  return toServerDocument({
    frameId: s.frameId,
    backgroundColor: s.backgroundColor,
    background: s.background,
    cellCutouts: s.cellCutouts,
    components: s.components,
    pendingBackgroundFile: s.pendingBackgroundFile,
  });
}

/** 서버 문서를 편집기에 들인다. key 로 된 이미지는 그릴 주소를 먼저 붙인다(저장본을 열 때와 같다). */
async function hydrateFromDocument(ownerId: string, doc: ServerEditorDocument) {
  const resolved = await resolveThemeAssetUrls({
    frameId: doc.frameId,
    components: doc.components as ThemeExportJson["components"],
  });
  const background =
    doc.background.type === "IMAGE" && doc.background.key
      ? { ...doc.background, url: (await getImageUrlByKey(doc.background.key)) ?? undefined }
      : doc.background;
  useThemeEditorStore.getState().hydrateDraft({
    ownerId,
    frameId: doc.frameId,
    backgroundColor: doc.backgroundColor,
    background,
    cellCutouts: doc.cellCutouts,
    components: resolved.components as ServerEditorDocument["components"],
    savedAt: Date.now(),
  });
}

/**
 * 서버 초안 동기화(F1-5, ADR-0006 §5). 다른 기기에서 이어 편집하기 위한 것이다.
 *
 * 규칙
 *  - 열 때 이 판형의 서버 초안을 찾기 **전에는** 쓰지 않는다. 먼저 쓰면 초안이 두 벌 생긴다.
 *  - 다른 기기의 초안이 더 새로우면 복원을 묻고, 답하기 전에는 쓰지 않는다 — 덮으면 그 기기의
 *    작업이 사라진다.
 *  - 다른 기기가 먼저 저장했으면(DRAFT-001) 멈추고 고르게 한다. 조용히 덮지 않는다.
 *  - 너무 크면(DRAFT-002) 이 세션은 이 기기에만 둔다. 로컬 초안은 계속 돈다.
 *  - 이번 세션에 편집이 없으면 새 초안을 만들지 않는다.
 */
export function useServerFrameDraft(options: {
  ownerId: string | null;
  frameId: FrameId;
  remoteFrameId: number | null;
  /** 저장본을 다 불러온 뒤에 true. 그 전에 찾으면 불러온 저장본이 복원을 덮는다. */
  ready: boolean;
}) {
  const { ownerId, frameId, remoteFrameId, ready } = options;
  const [status, setStatus] = useState<ServerDraftStatus>("idle");
  const [offer, setOffer] = useState<{ updatedAt: string } | null>(null);
  const [conflict, setConflict] = useState<{ revision: number | null } | null>(null);

  const draftRef = useRef<{ draftId: string; revision: number } | null>(null);
  const foundRef = useRef<Found | null>(null);
  const discoveredRef = useRef(false);
  const blockedRef = useRef(false);
  const lastSentRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const againRef = useRef(false);
  const stoppedRef = useRef(false);
  // 저장 중에 들어온 편집은 끝난 뒤 한 번 더 쓴다 — 자기 자신을 부르므로 ref 로 잇는다.
  const syncRef = useRef<() => Promise<void>>(async () => {});

  const sync = useCallback(async () => {
    if (!ownerId || stoppedRef.current || !discoveredRef.current || blockedRef.current) return;
    if (inFlightRef.current) {
      againRef.current = true;
      return;
    }
    // 새 초안은 이번 세션에 손댄 것이 있을 때만 만든다. 연 것만으로 빈 초안이 생기면 안 된다.
    if (!draftRef.current && useThemeEditorStore.getState().past.length === 0) return;

    inFlightRef.current = true;
    try {
      setStatus("saving");
      await useThemeEditorStore.getState().uploadLocalImagesForDraft();
      const built = currentDocument();
      if (!built) {
        setStatus("error");
        return;
      }
      const json = JSON.stringify(built.document);
      if (json === lastSentRef.current) {
        setStatus("saved");
        return;
      }
      const saved = draftRef.current
        ? await updateFrameDraft(draftRef.current.draftId, {
            revision: draftRef.current.revision,
            document: built.document,
            assetIds: built.assetIds,
          })
        : await createFrameDraft({
            ...(remoteFrameId ? { frameId: remoteFrameId } : {}),
            document: built.document,
            assetIds: built.assetIds,
          });
      draftRef.current = { draftId: saved.draftId, revision: saved.revision };
      lastSentRef.current = json;
      setStatus("saved");
    } catch (error) {
      const { code } = getApiErrorDetails(error);
      if (code === DRAFT_CONFLICT_CODE) {
        const data = (error as { data?: { data?: { revision?: unknown } } }).data?.data;
        blockedRef.current = true;
        setConflict({ revision: typeof data?.revision === "number" ? data.revision : null });
        setStatus("idle");
      } else if (code === DRAFT_TOO_LARGE_CODE) {
        blockedRef.current = true;
        setStatus("tooLarge");
      } else {
        setStatus("error");
      }
    } finally {
      inFlightRef.current = false;
      if (againRef.current) {
        againRef.current = false;
        void syncRef.current();
      }
    }
  }, [ownerId, remoteFrameId]);

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  // 열 때 이 판형의 서버 초안을 찾는다.
  useEffect(() => {
    if (!ownerId || !ready) return;
    let cancelled = false;
    discoveredRef.current = false;
    (async () => {
      try {
        const summaries = (await listFrameDrafts(remoteFrameId ?? "new")).sort(newestFirst);
        for (const summary of summaries.slice(0, DRAFTS_TO_INSPECT)) {
          const draft = await getFrameDraft(summary.draftId);
          const document = parseServerDocument(draft.document, frameId);
          if (!document) continue;
          if (cancelled) return;
          draftRef.current = { draftId: draft.draftId, revision: draft.revision };
          foundRef.current = { draftId: draft.draftId, revision: draft.revision, updatedAt: draft.updatedAt, document };

          const current = currentDocument();
          if (current && JSON.stringify(current.document) === JSON.stringify(document)) {
            lastSentRef.current = JSON.stringify(document);
            break;
          }
          // 새 프레임은 이 기기의 로컬 초안이 더 새로우면 묻지 않는다(같은 기기가 쓴 것이다).
          // 저장본 수정은 로컬 자동 저장이 없고, 서버 초안은 저장하면 지워지므로 남아 있으면 묻는다.
          const localSavedAt = remoteFrameId ? null : (loadEditorDraft(ownerId, frameId)?.savedAt ?? null);
          if (localSavedAt === null || Date.parse(draft.updatedAt) > localSavedAt + SAME_DEVICE_SLACK_MS) {
            blockedRef.current = true;
            setOffer({ updatedAt: draft.updatedAt });
          }
          break;
        }
      } catch {
        // 찾지 못하면 이번 세션은 새 초안으로 시작한다. 로컬 초안은 그대로 돈다.
      }
      if (!cancelled) discoveredRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerId, ready, frameId, remoteFrameId]);

  // 편집이 멈추면 쓴다.
  useEffect(() => {
    if (!ownerId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useThemeEditorStore.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void sync(), SERVER_DRAFT_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [ownerId, sync]);

  const restoreOffer = useCallback(async () => {
    const found = foundRef.current;
    if (!ownerId || !found) return;
    await hydrateFromDocument(ownerId, found.document);
    lastSentRef.current = JSON.stringify(found.document);
    blockedRef.current = false;
    setOffer(null);
  }, [ownerId]);

  const dismissOffer = useCallback(() => {
    // 다음 편집이 이 기기 내용으로 그 초안을 덮는다 — 사용자가 고른 것이다.
    blockedRef.current = false;
    setOffer(null);
  }, []);

  const overwriteConflict = useCallback(() => {
    if (draftRef.current && conflict?.revision != null) {
      draftRef.current = { ...draftRef.current, revision: conflict.revision };
    }
    blockedRef.current = false;
    setConflict(null);
    void sync();
  }, [conflict, sync]);

  const reloadConflict = useCallback(async () => {
    if (!ownerId || !draftRef.current) return;
    const draft = await getFrameDraft(draftRef.current.draftId);
    const document = parseServerDocument(draft.document, frameId);
    draftRef.current = { draftId: draft.draftId, revision: draft.revision };
    if (document) {
      await hydrateFromDocument(ownerId, document);
      lastSentRef.current = JSON.stringify(document);
    }
    blockedRef.current = false;
    setConflict(null);
  }, [ownerId, frameId]);

  /** 저장을 마쳤거나 버렸다. 더 쓰지 않고 서버 초안을 지운다. 지우지 못해도 저장은 끝난 것이다. */
  const finish = useCallback(async () => {
    stoppedRef.current = true;
    const draft = draftRef.current;
    draftRef.current = null;
    lastSentRef.current = null;
    if (draft) await deleteFrameDraft(draft.draftId).catch(() => {});
  }, []);

  return { status, offer, conflict, restoreOffer, dismissOffer, overwriteConflict, reloadConflict, finish };
}
