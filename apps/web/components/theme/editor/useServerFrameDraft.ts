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
import { loadEditorDraft, type SavedFrameScope } from "@/lib/themeEditorDraft";
import { useThemeEditorStore } from "@/lib/themeEditorStore";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

/** 편집이 멈추고 이만큼 지나면 서버 초안을 쓴다. 로컬 초안(1초)보다 길다 — 왕복과 업로드가 든다. */
export const SERVER_DRAFT_DEBOUNCE_MS = 4000;

/**
 * 열 때 서버 초안 찾기를 이만큼 기다린다. 이 기기 복구본은 찾기가 끝나야 판단하고 그동안 새 편집은 기기에 남지 않으므로
 * 오래 막지 않는다. 실측이 아니다 — 그림 하나를 기다리는 상한(lib/savedFrameCheck.ts 의 ASSET_TIMEOUT_MS)과 맞췄다.
 */
export const SERVER_DRAFT_DISCOVERY_DEADLINE_MS = 15_000;

/**
 * 열 때 문서까지 받아 볼 초안 수의 상한. 새 프레임 초안 목록에는 판형 넷이 섞여 오므로, 판형마다 하나씩만 있어도
 * 넷이다 — 셋으로 자르면 가장 오래된 판형의 초안을 영영 못 찾았다(Codex 리뷰 #528). 맞는 것을 찾으면 멈춘다.
 * 상한은 비정상적으로 많이 쌓인 경우의 요청 폭주를 막는 값이다.
 */
const DRAFTS_TO_INSPECT = 20;

/**
 * 같은 기기에서 방금 쓴 초안을 「다른 기기의 초안」으로 묻지 않으려고 두는 여유.
 * 로컬 초안은 1초마다, 서버 초안은 4초 뒤에 쓰므로 같은 기기라면 로컬이 늘 더 새롭다.
 */
const SAME_DEVICE_SLACK_MS = 2000;

export type ServerDraftStatus = "idle" | "saving" | "saved" | "error" | "tooLarge";

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
    cells: s.cells,
    components: s.components,
    pendingBackgroundFile: s.pendingBackgroundFile,
  });
}

/**
 * 이번 세션에 사용자가 고친 것이 있다. 저장본 불러오기와 초안 들이기(hydrateDraft)는 되돌리기 이력을 비우고 편집만
 * 이력을 쌓는다 — 그래서 이 기기 임시본을 되살린 것은 편집으로 치지 않는다(내용을 견주면 그것까지 편집으로 본다).
 */
function hasUserEdits() {
  return useThemeEditorStore.getState().past.length > 0;
}

/**
 * 서버 문서를 편집기에 들인다. key 로 된 이미지는 그릴 주소를 먼저 붙인다(저장본을 열 때와 같다).
 * 주소를 받는 사이 편집이 들어왔으면(canApply 가 false) 들이지 않고 false 를 돌려준다 — 들이면 방금 한 편집과
 * 되돌리기 이력까지 덮는다(Codex 리뷰 #604).
 */
async function hydrateFromDocument(ownerId: string, doc: ServerEditorDocument, canApply: () => boolean) {
  const resolved = await resolveThemeAssetUrls({
    frameId: doc.frameId,
    components: doc.components as ThemeExportJson["components"],
  });
  const background =
    doc.background.type === "IMAGE" && doc.background.key
      ? { ...doc.background, url: (await getImageUrlByKey(doc.background.key)) ?? undefined }
      : doc.background;
  if (!canApply()) return false;
  useThemeEditorStore.getState().hydrateDraft({
    ownerId,
    frameId: doc.frameId,
    backgroundColor: doc.backgroundColor,
    background,
    cellCutouts: doc.cellCutouts,
    cells: doc.cells ?? null,
    components: resolved.components as ServerEditorDocument["components"],
    savedAt: Date.now(),
  }, { preserveHidden: true });
  return true;
}

/**
 * 서버 초안 동기화(F1-5, ADR-0006 §5). 다른 기기에서 이어 편집하기 위한 것이다.
 *
 * 규칙
 *  - 열 때 이 판형의 서버 초안을 찾기 **전에는** 쓰지 않는다. 먼저 쓰면 초안이 두 벌 생긴다.
 *  - 다른 기기의 초안이 더 새로우면 묻지 않고 그 초안으로 연다(2026-11-15 「다른 기기의 초안은 뭐야. 다른 기기 꺼를
 *    가지고 있으면 그냥 그걸로 보여주면 되지」). 예전에는 「다른 기기에서 …에 편집한 초안이 있어요」로 [지금 화면 유지]·
 *    [초안 불러오기]를 물었다. 더 새로운 쪽을 여는 것이라 그 기기의 작업은 사라지지 않는다.
 *  - 다만 이 화면에서 이미 고쳤으면 더 새로운 초안이어도 덮지 않고, 아래 충돌처럼 어느 쪽을 남길지 고르게 한다.
 *  - 찾기가 상한(SERVER_DRAFT_DISCOVERY_DEADLINE_MS) 안에 끝나지 않으면 서버 초안 없이 간다. 이 세션은 서버 초안을 쓰지 않는다.
 *  - 다른 기기가 먼저 저장했으면(DRAFT-001) 멈추고 고르게 한다. 조용히 덮지 않는다.
 *  - 너무 크면(DRAFT-002) 이 세션은 이 기기에만 둔다. 로컬 초안은 계속 돈다.
 *  - 이번 세션에 편집이 없으면 새 초안을 만들지 않는다.
 */
export function useServerFrameDraft(options: {
  ownerId: string | null;
  frameId: FrameId;
  remoteFrameId: number | null;
  /** 공간 프레임을 편집 중이면 그 공간. 초안을 공간별로 가른다. */
  workspaceId?: string | null;
  /** 저장본 수정이면 그 범위(프레임·버전) — 이 기기의 로컬 복구본과 견줄 때 쓴다. */
  savedScope?: SavedFrameScope | null;
  /** 저장본을 다 불러온 뒤에 true. 그 전에 찾으면 불러온 저장본이 복원을 덮는다. */
  ready: boolean;
}) {
  const { ownerId, frameId, remoteFrameId, ready, savedScope = null, workspaceId = null } = options;
  const savedScopeRef = useRef(savedScope);
  useEffect(() => {
    savedScopeRef.current = savedScope;
  }, [savedScope]);
  const [status, setStatus] = useState<ServerDraftStatus>("idle");
  /** 다른 기기의 더 새로운 초안으로 열었다 — 이 기기의 더 오래된 복구본은 버린다(ThemeEditorPage). */
  const [restored, setRestored] = useState(false);
  /** 열 때 서버 초안 찾기가 끝났다. 이 기기의 복구본은 그 뒤에 판단한다 — 먼저 되살리면 더 새로운 서버 초안과 엇갈린다. */
  const [settled, setSettled] = useState(false);
  const [conflict, setConflict] = useState<{ revision: number | null } | null>(null);

  const draftRef = useRef<{ draftId: string; revision: number } | null>(null);
  const discoveredRef = useRef(false);
  const blockedRef = useRef(false);
  const lastSentRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const againRef = useRef(false);
  const stoppedRef = useRef(false);
  // 저장 중에 들어온 편집은 끝난 뒤 한 번 더 쓴다 — 자기 자신을 부르므로 ref 로 잇는다.
  const syncRef = useRef<() => Promise<void>>(async () => {});
  /*
    편집 세션 번호. 편집기를 나가거나 다른 프레임을 열면 바뀐다. 편집기 상태는 전역 스토어라, 그 전에 시작한 불러오기가
    늦게 끝나면 다음 편집기에 이전 초안이 들어간다(Codex 리뷰 #604).
  */
  const sessionRef = useRef(0);
  useEffect(
    () => () => {
      sessionRef.current += 1;
    },
    [ownerId, frameId, remoteFrameId, workspaceId],
  );

  const sync = useCallback(async () => {
    if (!ownerId || stoppedRef.current || !discoveredRef.current || blockedRef.current) return;
    if (inFlightRef.current) {
      againRef.current = true;
      return;
    }
    // 새 초안은 이번 세션에 손댄 것이 있을 때만 만든다. 연 것만으로 빈 초안이 생기면 안 된다.
    if (!draftRef.current && useThemeEditorStore.getState().past.length === 0) return;

    inFlightRef.current = true;
    // 올리는 사이 편집기를 나가 다른 프레임을 열면 전역 스토어는 그 프레임이다 — 그 내용을 이 세션의 초안에 쓰지 않는다(Codex 리뷰 #606).
    const session = sessionRef.current;
    try {
      setStatus("saving");
      await useThemeEditorStore.getState().uploadLocalImagesForDraft();
      // 올리는 사이 저장을 마쳤거나 버렸으면 새로 만들지 않는다.
      if (stoppedRef.current) return;
      if (sessionRef.current !== session) {
        setStatus("idle");
        return;
      }
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
            ...(workspaceId ? { workspaceId } : {}),
            document: built.document,
            assetIds: built.assetIds,
          });
      if (stoppedRef.current) {
        /*
          요청이 도는 사이 저장을 마쳤거나 버렸다. finish 는 그때 draftRef 가 비어 있어 지울 것을 몰랐으니 여기서
          지운다 — 남기면 버린 작업이 다음 방문에 「다른 기기의 초안」으로 나타난다(Codex 리뷰 #528).
        */
        await deleteFrameDraft(saved.draftId).catch(() => {});
        return;
      }
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
  }, [ownerId, remoteFrameId, workspaceId]);

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  // 열 때 이 판형의 서버 초안을 찾는다.
  useEffect(() => {
    if (!ownerId || !ready) return;
    let cancelled = false;
    // 상한을 넘겨 찾기를 그만뒀다. 늦게 온 답은 버린다 — 이 기기 복구본이 이미 그 자리를 맡았다.
    let gaveUp = false;
    const stale = () => cancelled || gaveUp;
    discoveredRef.current = false;
    /*
      찾기가 응답 없이 멈추면 settled 가 영영 오지 않아 이 기기 복구본을 되살리지 못하고, 그동안의 새 편집은 기기에도
      남지 않는다(ThemeEditorPage 의 로컬 자동 저장이 복구 판단을 기다린다, Codex 리뷰 #604). 상한을 넘기면 서버 초안 없이
      정한다 — 이 세션은 서버 초안을 쓰지 않는다. 무엇이 있는지 모른 채 쓰면 초안이 두 벌 생긴다.
    */
    const deadline = setTimeout(() => {
      gaveUp = true;
      setSettled(true);
    }, SERVER_DRAFT_DISCOVERY_DEADLINE_MS);
    (async () => {
      try {
        const summaries = (await listFrameDrafts(remoteFrameId ?? "new", workspaceId)).sort(newestFirst);
        for (const summary of summaries.slice(0, DRAFTS_TO_INSPECT)) {
          const draft = await getFrameDraft(summary.draftId);
          const document = parseServerDocument(draft.document, frameId);
          if (!document) continue;
          if (stale()) return;
          draftRef.current = { draftId: draft.draftId, revision: draft.revision };

          const current = currentDocument();
          if (current && JSON.stringify(current.document) === JSON.stringify(document)) {
            lastSentRef.current = JSON.stringify(document);
            break;
          }
          // 이 기기의 로컬 초안이 더 새로우면 묻지 않는다(같은 기기가 쓴 것이다). 로컬 복구본이 없는 저장본 수정은
          // 서버 초안이 저장하면 지워지므로 남아 있으면 묻는다.
          const scope = savedScopeRef.current;
          const localSavedAt = remoteFrameId
            ? scope
              ? (loadEditorDraft(ownerId, frameId, scope)?.savedAt ?? null)
              : null
            : (loadEditorDraft(ownerId, frameId)?.savedAt ?? null);
          if (localSavedAt === null || Date.parse(draft.updatedAt) > localSavedAt + SAME_DEVICE_SLACK_MS) {
            // 이 화면에서 이미 고쳤으면(찾는 사이든 그 전이든) 덮지 않는다 — 더 새로운 초안이 있다는 것만 알리고 어느
            // 쪽을 남길지 고르게 한다. 조회와 주소 받기는 오래 걸릴 수 있고 그동안에도 편집기는 열려 있다. 고르기
            // 전에는 쓰지 않는다 — 그 기기의 초안을 조용히 덮지 않게(Codex 리뷰 #604).
            // 그사이 편집기를 나갔으면(cancelled) 아무것도 넣지 않는다 — 새 편집기는 이력을 비우므로 편집 여부로는 못 거른다.
            const canApply = () => !stale() && !hasUserEdits();
            const applied = canApply() && (await hydrateFromDocument(ownerId, document, canApply));
            if (stale()) return;
            if (applied) {
              lastSentRef.current = JSON.stringify(document);
              setRestored(true);
            } else {
              blockedRef.current = true;
              setConflict({ revision: draft.revision });
            }
          }
          break;
        }
      } catch {
        // 찾지 못하면 이번 세션은 새 초안으로 시작한다. 로컬 초안은 그대로 돈다.
      } finally {
        clearTimeout(deadline);
      }
      if (stale()) return;
      discoveredRef.current = true;
      setSettled(true);
      // 찾는 동안(또는 계정을 알기 전에) 한 편집은 예약된 저장이 찾기 전이라 건너뛰었을 수 있다. 지금 한 번 맡긴다
      // — 다음 편집을 기다리면 그대로 다른 기기로 옮겼을 때 그 편집이 서버에 없다(Codex 리뷰 #528).
      if (!blockedRef.current && useThemeEditorStore.getState().past.length > 0) void syncRef.current();
    })();
    return () => {
      cancelled = true;
      clearTimeout(deadline);
    };
  }, [ownerId, ready, frameId, remoteFrameId, workspaceId]);

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
    // 불러오는 사이 편집기를 나갔거나 다른 프레임을 열었으면 그 편집기에 넣지 않는다.
    const session = sessionRef.current;
    const live = () => sessionRef.current === session;
    const draft = await getFrameDraft(draftRef.current.draftId);
    if (!live()) return;
    const document = parseServerDocument(draft.document, frameId);
    draftRef.current = { draftId: draft.draftId, revision: draft.revision };
    if (document) {
      if (!(await hydrateFromDocument(ownerId, document, live))) return;
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

  return { status, restored, settled, conflict, overwriteConflict, reloadConflict, finish };
}
