"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ImagePlus, Layers, Paintbrush, Scissors, SlidersHorizontal } from "lucide-react";
import { getSubscriptionUsage } from "@/lib/userApi";
import { useRouter } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { BackgroundPanel } from "@/components/theme/editor/BackgroundPanel";
import { CanvasStage } from "@/components/theme/editor/canvas/CanvasStage";
import { AssetPanel } from "@/components/theme/editor/AssetPanel";
import { LayersPanel } from "@/components/theme/editor/LayersPanel";
import { NUDGE_STEP, NUDGE_STEP_LARGE } from "@/constants/editorNudge";
import { InspectorPanel } from "@/components/theme/editor/InspectorPanel";
import { CutoutPanel } from "@/components/theme/editor/CutoutPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toCreateFrameRequest, toThemeExportJson } from "@/lib/frameApi";
import { resolveThemeAssetUrls } from "@/lib/frameAssets";
import { createFrame, deleteFrame, getFrame, updateFrame } from "@/lib/remoteFrameApi";
import {
  UploadValidationError,
  PRESIGNED_UPLOAD_TYPES,
  getImageUrlByKey,
  uploadToS3WithPresigned,
} from "@/lib/presignedUploadApi";
import { renderThemePreviewPng } from "@/lib/canvas/renderThemePreview";
import { buildFrameContentKey, useShootSession } from "@/lib/shootSessionStore";
import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
import { useThemeEditorStore } from "@/lib/themeEditorStore";
import { useThemeSession } from "@/lib/themeSessionStore";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
import {
  discardEditorDraft,
  loadEditorDraft,
  saveEditorDraft,
} from "@/lib/themeEditorDraft";
import { getMyUserInfo } from "@/lib/userApi";

// 새 프레임을 만들 때 채워 두는 기본 이름·설명
const DEFAULT_FRAME_TITLE = "새 테마 프레임";
const DEFAULT_FRAME_DESCRIPTION = "하루컷에서 직접 꾸민 나만의 프레임";

/**
 * 이탈 경고 판정용 편집 상태 지문. 기준 시점과 지금을 비교하는 데만 쓴다.
 *
 * 포함 범위는 자동 초안(saveEditorDraft)이 남기는 값과 같다 — 잃으면 아까운 작업이
 * 곧 초안에 담기는 값이기 때문이다. cellCutouts도 사용자가 칸마다 직접 켠 값이라
 * 같은 기준으로 들어간다.
 *
 * 이 지문이 보는 것은 "사용자가 손댔는가" 하나뿐이라, 어떤 값이 서버로 가는지와는
 * 무관하다. cellCutouts의 저장 계약은 docs/backend-contract.md 가 쥔다.
 *
 * 배경의 `url`은 뺀다. IMAGE 배경은 저장된 key만 들고 오고 서명 URL은 불러온 뒤에
 * 따로 주입하는 렌더 전용 값이라, 포함하면 사용자가 아무것도 안 해도 지문이 바뀐다.
 */
function buildEditorSignature(
  components: ReturnType<typeof useThemeEditorStore.getState>["components"],
  background: ReturnType<typeof useThemeEditorStore.getState>["background"],
  backgroundColor: string,
  cellCutouts: boolean[],
) {
  return JSON.stringify({
    components,
    background:
      background.type === "IMAGE"
        ? {
            type: "IMAGE",
            key: background.key ?? null,
            opacity: background.opacity ?? null,
          }
        : { type: "COLOR", value: background.value },
    backgroundColor,
    cellCutouts,
  });
}

/**
 * 모바일(< lg)에서 하단 시트에 띄울 도구. 데스크톱은 캔버스 옆에 전부 나란히 둔다.
 *
 * 예전에는 모바일에서도 패널을 캔버스 아래로 전부 쌓아서, 속성을 고치려면 캔버스를 화면 밖으로
 * 밀어내고 내려가야 했다 — 고친 결과를 보면서 고칠 수가 없었다. 기획 R5 5절 「모바일은 캔버스를
 * 유지하며 도구를 하단 시트로 연다」.
 */
const MOBILE_TOOLS = [
  { id: "assets", label: "추가", Icon: ImagePlus },
  { id: "background", label: "배경", Icon: Paintbrush },
  { id: "cutout", label: "누끼", Icon: Scissors },
  { id: "layers", label: "레이어", Icon: Layers },
  { id: "inspector", label: "속성", Icon: SlidersHorizontal },
] as const;
type MobileTool = (typeof MOBILE_TOOLS)[number]["id"];

const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeViewport(onChange: () => void) {
  const query = window.matchMedia?.(DESKTOP_QUERY);
  query?.addEventListener?.("change", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    query?.removeEventListener?.("change", onChange);
    window.removeEventListener("resize", onChange);
  };
}

/**
 * 모바일에서 캔버스에 줄 세로 상한. 위 헤더(약 92px)·여백과 아래 도구 시트(최대 30dvh)·도구
 * 막대(64px)를 뺀 나머지다. 0.70h − 180 은 그 합(0.30h + 64 + 92 + 여백 24)을 뺀 값이다.
 * 클래식처럼 세로로 긴 판형은 이 높이가 곧 캔버스 크기라, 넉넉히 잡되 시트에 가리지 않게 한다
 * (e2e theme-editor-mobile 이 겹침을 잰다). 데스크톱은 undefined — 기본값(useStageFit)을 쓴다.
 */
function useMobileCanvasMaxHeight(): number | undefined {
  return useSyncExternalStore(
    subscribeViewport,
    () =>
      window.matchMedia?.(DESKTOP_QUERY).matches
        ? undefined
        : Math.max(200, Math.round(window.innerHeight * 0.7 - 180)),
    () => undefined,
  );
}

export function ThemeEditorPage({ frameId }: { frameId: FrameId }) {
  const router = useRouter();
  const setFrameId = useThemeEditorStore((s) => s.setFrameId);
  const exportJson = useThemeEditorStore((s) => s.exportJson);
  const importJson = useThemeEditorStore((s) => s.importJson);
  const resetPhotos = useThemeEditorStore((s) => s.resetPhotos);
  const hydrateDraft = useThemeEditorStore((s) => s.hydrateDraft);
  const background = useThemeEditorStore((s) => s.background);
  const backgroundColor = useThemeEditorStore((s) => s.backgroundColor);
  const setBackgroundImageUrl = useThemeEditorStore((s) => s.setBackgroundImageUrl);
  const editorComponents = useThemeEditorStore((s) => s.components);
  const storeFrameId = useThemeEditorStore((s) => s.frameId);
  const cellCutouts = useThemeEditorStore((s) => s.cellCutouts);
  const undo = useThemeEditorStore((s) => s.undo);
  const redo = useThemeEditorStore((s) => s.redo);
  const nudge = useThemeEditorStore((s) => s.nudge);
  const activeId = useThemeEditorStore((s) => s.activeId);
  const mobileCanvasMaxHeight = useMobileCanvasMaxHeight();
  const [mobileTool, setMobileTool] = useState<MobileTool>("assets");
  // 캔버스에서 레이어를 새로 고르면 속성 시트로 넘긴다 — 고른 것을 바로 고치러 온 것이다.
  const [seenActiveId, setSeenActiveId] = useState(activeId);
  if (seenActiveId !== activeId) {
    setSeenActiveId(activeId);
    if (activeId) setMobileTool("inspector");
  }

  /*
    되돌리기 단축키. Ctrl/⌘+Z 는 되돌리기, Ctrl/⌘+Shift+Z 와 Ctrl+Y 는 다시 하기다.
    글자를 입력하는 칸에 포커스가 있으면 브라우저의 입력 되돌리기를 그대로 둔다 — 문구를
    고치다 Ctrl+Z 를 눌렀는데 캔버스 레이어가 사라지면 안 된다.
  */
  useEffect(() => {
    const ARROWS: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      // 방향키: 고른 레이어를 움직인다. 버튼·링크에 포커스가 있으면 그 조작을 가로채지 않는다.
      const arrow = ARROWS[event.key];
      if (arrow && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const activeId = useThemeEditorStore.getState().activeId;
        if (!activeId || (target && ["BUTTON", "A"].includes(target.tagName))) return;
        event.preventDefault();
        const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
        nudge(activeId, arrow[0] * step, arrow[1] * step);
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, nudge]);
  const { remoteFrameId } = useThemeSession();
  // 저장 다이얼로그에서 알려 준다. 예전에는 저장을 누른 순간 window.alert 로 끼어들었다.
  const hiddenLayerCount = editorComponents.filter((c) => c.hidden).length;

  // 편집 중 판정은 "콘텐츠가 있는지"가 아니라 "기준 상태에서 바뀌었는지"로 한다.
  // 콘텐츠 유무로 보면 컴포넌트나 이미지 배경이 있는 저장 프레임을 열기만 해도
  // 매번 이탈 경고가 떠서, 아무것도 고치지 않은 사용자까지 붙잡는다.
  const editorSignature = useMemo(
    () =>
      buildEditorSignature(editorComponents, background, backgroundColor, cellCutouts),
    [editorComponents, background, backgroundColor, cellCutouts],
  );
  // 기준은 프레임마다 새로 잡되, 스토어가 이 프레임 상태로 자리잡은 뒤에 잡는다.
  // 너무 일찍 잡으면 기준이 남의 상태가 된다.
  // - 새 프레임: 이전 프레임을 편집하다 들어오면 첫 렌더에는 스토어에 이전 상태가 남아 있고,
  //   아래 setFrameId effect가 그때서야 초기화한다. 스토어 frameId가 맞춰질 때까지 기다린다.
  // - 원격 프레임: 불러오기가 끝나야 기준이 정해진다(importJson이 스토어 frameId를 저장본 값으로
  //   바꾸므로 여기서는 frameId 일치를 조건으로 쓸 수 없다).
  const baselineKey = `${frameId}:${remoteFrameId ?? ""}`;
  const [baseline, setBaseline] = useState<{
    key: string;
    signature: string | null;
  }>({ key: baselineKey, signature: null });
  const [isRemoteFrameSettled, setIsRemoteFrameSettled] = useState(false);
  const isBaselineReady = remoteFrameId
    ? isRemoteFrameSettled
    : storeFrameId === frameId;

  if (baseline.key !== baselineKey) {
    setBaseline({ key: baselineKey, signature: null });
    setIsRemoteFrameSettled(false);
  } else if (baseline.signature === null && isBaselineReady) {
    setBaseline({ key: baselineKey, signature: editorSignature });
  }

  const hasUnsavedCanvasChanges =
    baseline.key === baselineKey &&
    baseline.signature !== null &&
    baseline.signature !== editorSignature;

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingFrame, setIsLoadingFrame] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // 원격 프레임은 불러온 값으로 채우고, 새 프레임은 기본값에서 시작한다.
  const [title, setTitle] = useState(remoteFrameId ? "" : DEFAULT_FRAME_TITLE);
  const [description, setDescription] = useState(
    remoteFrameId ? "" : DEFAULT_FRAME_DESCRIPTION,
  );
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [saveDialogError, setSaveDialogError] = useState<string | null>(null);
  /*
    저장이 도는 중에는 닫지 않는다. 취소 버튼은 비활성인데 Escape 만 열려 있으면,
    업로드·미리보기 생성·API 호출이 끝나기 전에 편집기로 돌아가 캔버스를 더 만질 수 있다.
    그러면 서버에는 예전 상태가 저장되는데 "저장됨" 기준선은 지금 상태로 갱신돼,
    그 뒤의 편집이 저장된 것처럼 보인다(이탈 경고도 안 뜬다).

    isSaving 을 의존성에 넣지 않고 ref 로 읽는다 — 콜백 정체성이 바뀌면 useModalDialog 의
    effect 가 다시 돌면서 포커스를 첫 컨트롤로 되돌려, 저장을 누른 순간 포커스가 튄다.
  */
  const isSavingRef = useRef(false);
  /*
    마지막으로 서버에 있는 것으로 아는 프레임의 **출력 지문**.

    저장할 때 이 값과 비교해 「합성 결과가 달라졌는가」를 가른다. 판정의 소유자는
    `buildFrameContentKey` 다(AGENTS.md 「규칙의 소유자」) — 편집기의 이탈 경고용 지문
    (`buildEditorSignature`)을 대신 쓰면 안 된다. 그쪽은 `locked` 처럼 **그림에 안 나오는
    값**까지 「고쳤다」로 보므로, 레이어를 잠그기만 해도 멱등키가 버려져 같은 그림이 두 벌
    접수된다.

    지문은 불러온 뒤 `exportJson()` 으로 잡는다 — 저장할 때와 **같은 파이프라인**이라야
    왕복 정규화 차이가 「고쳤다」로 잡히지 않는다.
  */
  const savedContentKeyRef = useRef<string | null>(null);
  /**
   * 불러온 저장본의 낙관적 잠금 버전(ADR-0006 §3). 수정 저장에 보내고, 응답의 새 값으로 바꾼다.
   * 다른 기기가 먼저 저장했으면 서버가 409 FRAME-002 와 현재 버전을 준다 — 그때는 조용히 덮지 않고
   * 사용자에게 고르게 한다(기획 R5 5절 「두 기기 편집은 version 기반으로 검사」, F16).
   */
  const frameVersionRef = useRef<number | null>(null);
  const [versionConflict, setVersionConflict] = useState<{ currentVersion: number | null } | null>(null);
  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);
  const closeSaveDialog = useCallback(() => {
    if (isSavingRef.current) return;
    setIsSaveDialogOpen(false);
  }, []);
  const saveDialogRef = useModalDialog(isSaveDialogOpen, closeSaveDialog);

  // 저장 다이얼로그에 입력한 이름·설명도 아직 서버에 안 올라간 작업이다.
  // 다이얼로그를 열면 현재 값으로 채워지므로, 그 값에서 달라졌을 때만 편집으로 센다.
  const hasUnsavedSaveDialogInput =
    isSaveDialogOpen && (draftTitle !== title || draftDescription !== description);

  useUnsavedWorkGuard(hasUnsavedCanvasChanges || hasUnsavedSaveDialogInput);
  const hasRemoteLoadFailure = Boolean(remoteFrameId && loadError);

  useEffect(() => {
    setFrameId(frameId);
  }, [frameId, setFrameId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRemoteFrame() {
      if (!remoteFrameId) {
        setLoadError(null);
        return;
      }

      setIsLoadingFrame(true);
      setLoadError(null);

      try {
        const remoteFrame = await getFrame(remoteFrameId);
        if (cancelled) return;
        frameVersionRef.current = typeof remoteFrame.version === "number" ? remoteFrame.version : null;
        // 컴포넌트 자산은 S3 key 로 저장돼 있다. 그릴 주소를 먼저 붙여 두지 않으면
        // 캔버스에 빈칸이 뜨고, 그 상태로 다시 저장하면 미리보기까지 빈 채로 올라간다.
        const imported = await resolveThemeAssetUrls(toThemeExportJson(remoteFrame));
        if (cancelled) return;
        importJson(imported);
        savedContentKeyRef.current = buildFrameContentKey(
          useThemeEditorStore.getState().exportJson(),
        );
        setTitle(remoteFrame.title || "");
        setDescription(remoteFrame.description || "");
        // 저장본이 에디터에 다 들어온 시점이 곧 편집 기준이다. 아래 배경 URL 해석까지
        // 기다리면, 그 사이 사용자가 고친 내용이 기준으로 잡혀 이탈 경고가 안 뜬다
        // (해석을 기다리는 동안에도 에디터는 조작 가능하다). 지문은 url을 안 보므로
        // 여기서 확정해도 뒤따르는 URL 주입에 영향받지 않는다.
        setIsRemoteFrameSettled(true);

        // IMAGE 배경(key만 있음)은 url을 해석해 캔버스/썸네일에 렌더되도록 주입.
        // 그래야 수정 저장 시 배경이 빠진 단색 썸네일로 저장되지 않는다.
        const importedKey =
          imported.background?.type === "IMAGE" ? imported.background.key : undefined;
        // 서버가 key 자리에 이미 서명된 URL을 준 경우엔 그대로 쓴다(재서명하면 주소가 깨진다).
        const importedUrl =
          imported.background?.type === "IMAGE" ? imported.background.url : undefined;
        if (importedUrl) {
          setBackgroundImageUrl(importedUrl);
        } else if (importedKey) {
          const url = await getImageUrlByKey(importedKey);
          // 해석을 기다리는 동안 사용자가 새 배경(로컬 파일/다른 key)을 골랐을 수 있다.
          // 현재 배경이 여전히 같은 원격 key일 때만 적용해 stale URL 덮어쓰기를 막는다.
          const current = useThemeEditorStore.getState();
          if (
            !cancelled &&
            url &&
            !current.pendingBackgroundFile &&
            current.background.type === "IMAGE" &&
            current.background.key === importedKey
          ) {
            setBackgroundImageUrl(url);
          }
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setLoadError("저장한 프레임을 불러오지 못했어요.");
        }
      } finally {
        if (!cancelled) {
          // 불러오기가 실패한 경우에도 기준은 잡아 둔다. 안 잡으면 이후 편집이
          // 아무리 쌓여도 이탈 경고가 영영 안 뜬다(성공 경로는 위에서 이미 잡았다).
          setIsRemoteFrameSettled(true);
          setIsLoadingFrame(false);
        }
      }
    }

    loadRemoteFrame();

    return () => {
      cancelled = true;
    };
  }, [importJson, remoteFrameId, setBackgroundImageUrl]);

  // 새 프레임(원격 id 없음)이면 기본 이름·설명을 채운다.
  // 원격 프레임에서 새 프레임으로 바뀌는 전환도 렌더 중에 맞춘다.
  const [syncedRemoteFrameId, setSyncedRemoteFrameId] = useState(remoteFrameId);
  if (syncedRemoteFrameId !== remoteFrameId) {
    setSyncedRemoteFrameId(remoteFrameId);
    if (!remoteFrameId) {
      setTitle(DEFAULT_FRAME_TITLE);
      setDescription(DEFAULT_FRAME_DESCRIPTION);
    }
  }

  useEffect(() => {
    return () => {
      resetPhotos();
    };
  }, [resetPhotos]);

  /*
    초안의 주인. 초안은 계정 × 프레임 종류마다 따로 둔다(lib/themeEditorDraft.ts).
    공용 기기에서 앞 사람이 로그아웃하지 않고 떠나도, 다음 사람이 그 사진이 든 초안을 복원하지
    않게 하려면 지금 계정을 알아야 한다. 모르면 복원도 자동 저장도 하지 않는다 — 주인 없는
    초안을 남기는 것보다 이번 편집의 자동 저장을 건너뛰는 편이 안전하다.
  */
  const [draftOwnerId, setDraftOwnerId] = useState<string | null>(null);
  useEffect(() => {
    if (remoteFrameId) return;
    let cancelled = false;
    void getMyUserInfo()
      .then((user) => {
        if (!cancelled && user.id) setDraftOwnerId(user.id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [remoteFrameId]);

  // 새 프레임 작업 시: 새로고침/이탈로 남은 WIP 초안(localStorage)이 있으면 복원한다.
  // 원격 프레임 수정 중에는 저장본을 불러오므로 초안 복원을 하지 않는다.
  const didRestoreDraftRef = useRef(false);
  useEffect(() => {
    if (remoteFrameId || !draftOwnerId || didRestoreDraftRef.current) return;
    didRestoreDraftRef.current = true;
    // 계정 조회는 왕복이라 그 사이 사용자가 이미 편집을 시작했을 수 있다. 그 편집을 초안으로
    // 덮지 않는다(초안은 남아 있다가 다음 자동 저장이 새 편집으로 바꾼다).
    // 배경색만 바꾼 편집은 아래 모양으로는 처음과 같아 보여서 히스토리로도 판정한다.
    const s = useThemeEditorStore.getState();
    const pristine =
      s.past.length === 0 &&
      s.components.length === 0 &&
      s.background.type === "COLOR" &&
      !s.cellCutouts.some(Boolean);
    if (!pristine) return;
    const draft = loadEditorDraft(draftOwnerId, frameId);
    if (draft) hydrateDraft(draft);
  }, [frameId, remoteFrameId, hydrateDraft, draftOwnerId]);

  const stopDraftAutosaveRef = useRef<(() => void) | null>(null);
  // 편집 중 상태를 localStorage에 자동 저장(디바운스). S3 temp 업로드 대신 로컬 보관.
  useEffect(() => {
    if (remoteFrameId || !draftOwnerId) return;
    let timer: number | undefined;
    let idle: number | undefined;
    let stopped = false;
    const cancelScheduled = () => {
      window.clearTimeout(timer);
      if (idle !== undefined) {
        if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
        else window.clearTimeout(idle);
        idle = undefined;
      }
    };

    // 저장은 5MB 문자열을 만들고 쓰는 동기 작업이라 메인 스레드를 잡는다. 디바운스가 끝난
    // 순간이 하필 사용자가 스티커를 끌고 있는 순간일 수 있어, 한가한 프레임까지 한 번 더
    // 미룬다. 지원하지 않는 브라우저에서는 다음 틱에 그냥 실행한다.
    const whenIdle = (run: () => void) => {
      const ric = (
        window as typeof window & {
          requestIdleCallback?: (
            cb: IdleRequestCallback,
            o?: IdleRequestOptions,
          ) => number;
        }
      ).requestIdleCallback;
      idle = ric ? ric(() => run(), { timeout: 2000 }) : window.setTimeout(run, 0);
    };

    const schedule = () => {
      cancelScheduled();
      timer = window.setTimeout(() => {
        whenIdle(() => {
          idle = undefined;
          if (stopped) return;
          const s = useThemeEditorStore.getState();
          if (!s.frameId) return;
          // 레이어가 없어도 배경색·칸별 설정은 편집 내용이다. 함께 보관한다.
          void saveEditorDraft({
            ownerId: draftOwnerId,
            frameId: s.frameId,
            backgroundColor: s.backgroundColor,
            background: s.background,
            cellCutouts: s.cellCutouts,
            components: s.components,
            now: Date.now(),
          });
        });
      }, 1000);
    };
    const unsubscribe = useThemeEditorStore.subscribe(schedule);
    // 구독은 계정 조회가 끝난 뒤에 시작한다. 그 사이에 한 편집은 구독이 못 봤으니 지금 한 번 맡긴다.
    if (useThemeEditorStore.getState().past.length > 0) schedule();
    const stop = () => {
      stopped = true;
      cancelScheduled();
      unsubscribe();
    };
    stopDraftAutosaveRef.current = stop;
    return stop;
  }, [remoteFrameId, draftOwnerId]);

  const openSaveDialog = () => {
    setDraftTitle(title);
    setDraftDescription(description);
    setSaveDialogError(null);
    setIsSaveDialogOpen(true);
  };

  const onDone = async () => {
    if (isSaving || isLoadingFrame) return;
    if (hasRemoteLoadFailure) {
      setSaveDialogError("저장한 프레임을 불러오지 못해 수정 저장을 막았어요.");
      return;
    }

    const nextTitle = draftTitle.trim() || "테마 프레임";
    const nextDescription =
      draftDescription.trim() ||
      (remoteFrameId ? "프레임 꾸미기 수정" : "프레임 꾸미기 저장");

    setIsSaving(true);
    setSaveDialogError(null);
    setVersionConflict(null);
    try {
      if (!remoteFrameId) {
        const usage = await getSubscriptionUsage();
        if (!usage.frameRetentionUnlimited && usage.frameRetentionLimit >= 0 && usage.frameRetentionRemainingCount === 0) {
          setSaveDialogError("저장 공간이 없어요. 기존 프레임을 수정하거나 마이페이지에서 보관 한도를 확인해 주세요.");
          return;
        }
      }
      // 로컬 배경 이미지가 있으면 먼저 업로드해 IMAGE 배경 key를 채운다.
      const editorState = useThemeEditorStore.getState();
      if (
        editorState.pendingBackgroundFile &&
        editorState.background.type === "IMAGE" &&
        !editorState.background.key
      ) {
        // key 만 받아 둔다. 배경은 이미 고른 파일의 로컬 주소로 그려져 있고
        // `setBackgroundImageKey` 도 url 을 건드리지 않으니, 업로드가 덤으로 해 주는
        // 조회용 URL 해석(왕복 1회)은 버려진다 — 건너뛴다.
        const { key } = await uploadToS3WithPresigned({
          file: editorState.pendingBackgroundFile,
          type: PRESIGNED_UPLOAD_TYPES.FRAME,
          skipUrlResolve: true,
        });
        useThemeEditorStore.getState().setBackgroundImageKey(key);
      }

      // 캔버스에 올라간 사진·스티커를 이 시점에 S3로 올리고, 글자 층을 구워 둔다
      // (편집 중엔 임시 업로드를 하지 않는다). 이걸 건너뛰면 저장은 되지만
      // 그 프레임으로 찍은 네컷 합성이 400 GEN-002 로 죽는다.
      await useThemeEditorStore.getState().finalizeAssetsForSave();

      const themeJson = exportJson();
      if (!themeJson) {
        setIsSaving(false);
        return;
      }

      const previewBlob = await renderThemePreviewPng(themeJson);
      const previewFile = new File([previewBlob], `theme-preview-${Date.now()}.png`, {
        type: "image/png",
      });
      // 미리보기 PNG 는 저장 요청에 previewKey 로만 실린다 — 올린 뒤 이 화면에서
      // 다시 그리지 않으므로 조회용 URL 해석(왕복 1회)을 건너뛴다.
      const { key: previewKey } = await uploadToS3WithPresigned({
        file: previewFile,
        type: PRESIGNED_UPLOAD_TYPES.FRAME,
        skipUrlResolve: true,
      });

      const body = toCreateFrameRequest(themeJson, {
        title: nextTitle,
        description: nextDescription,
        previewKey,
      });

      if (remoteFrameId) {
        const saved = await updateFrame(remoteFrameId, {
          ...body,
          ...(frameVersionRef.current !== null ? { version: frameVersionRef.current } : {}),
        });
        frameVersionRef.current = typeof saved?.version === "number" ? saved.version : null;
        /*
          **합성 결과가 달라진 저장에만** 촬영 세션의 결과와 멱등키를 버린다.

          왜 버리나: 프레임 수정은 같은 id 로 가는 PUT 이라 `remoteFrameId` 가 안 변한다.
          촬영 세션이 쓰던 멱등키를 그대로 다시 보내면 서버가 **수정 전 작업을 재생한다**
          (docs/backend-contract.md D-4). 결과 화면도 프레임 내용의 지문으로 같은 것을
          막지만, 그 지문은 프레임 **조회가 성공했을 때만** 생긴다 — 조회가 실패한
          세션에서는 여기서 버리는 것만이 유일한 방어다.

          왜 조건을 다나: 이름·설명만 고치거나 아무것도 안 고치고 다시 저장해도
          `updateFrame` 은 200 이다. 그때까지 버리면 결과 화면이 **같은 그림을 새 멱등키로
          다시 접수해** 보관함에 두 벌이 남는다(2026-08-24 에 실제로 남았다).

          비교는 **방금 서버로 보낸 `themeJson`** 으로 한다. 사용자가 누른 시점의 편집기
          상태가 아니라 `finalizeAssetsForSave()` 까지 끝난 뒤의 값이라, 저장을 누른 직후
          끝난 누끼 작업처럼 **대기 중에 바뀐 것**도 여기 들어 있다.
        */
        const savedContentKey = buildFrameContentKey(themeJson);
        if (savedContentKey !== savedContentKeyRef.current) {
          useShootSession.getState().noteRemoteFrameEdited(remoteFrameId);
        }
        savedContentKeyRef.current = savedContentKey;
      } else {
        await createFrame(body);
      }

      stopDraftAutosaveRef.current?.();
      if (draftOwnerId) discardEditorDraft(draftOwnerId, frameId);
      // 저장했으니 지금 상태가 새 기준이다. 이탈 경고를 그대로 두면 저장 직후
      // /theme로 나가는 길에도 경고가 뜬다.
      setBaseline({ key: baselineKey, signature: editorSignature });
      setTitle(nextTitle);
      setDescription(nextDescription);
      setIsSaveDialogOpen(false);
      router.push("/theme");
    } catch (error) {
      console.error(error);
      const details = getApiErrorDetails(error);
      if (details.code === "FRAME-002") {
        const data = (error as { data?: { data?: { currentVersion?: unknown } } }).data?.data;
        setVersionConflict({
          currentVersion: typeof data?.currentVersion === "number" ? data.currentVersion : null,
        });
      }
      /*
        올리기 전에 우리가 걸러낸 것(형식·용량·빈 파일)만 자기 문구를 살린다.
        저장 한 번에 배경·사진·스티커·글자 층·미리보기가 줄줄이 올라가는데,
        그중 무엇이 왜 막혔는지는 이 문구에만 있다 — 코드 매핑으로 넘기면
        `UploadValidationError` 에는 status·code 가 없어 폴백만 남는다.

        "ApiRequestError 가 아니면 로컬 오류" 로 가르면 안 된다 — S3 PUT 은 fetch 를
        직접 부르므로 오프라인의 `TypeError("Failed to fetch")` 와 비정상 응답의
        `Error("S3 upload failed: 403")` 도 ApiRequestError 가 아니다. 그것들까지
        로컬로 오인하면 영문 원문이 화면에 나간다. 우리가 던진 것만 타입으로 가른다
        (app/mypage/page.tsx 의 프로필 이미지 업로드도 같은 규칙이다).
      */
      setSaveDialogError(
        error instanceof UploadValidationError
          ? error.message
          : getUserFacingApiErrorMessage(error, "저장에 실패했어요."),
      );
    } finally {
      setIsSaving(false);
    }
  };

  // 되돌릴 수 없는 삭제는 window.confirm 대신 ConfirmDialog 로 묻는다 — 브라우저 창은 모바일
  // 사파리에서 탭을 멈추고 진행 상태를 그릴 수 없다(components/ui/ConfirmDialog.tsx).
  const onDelete = () => {
    if (!remoteFrameId || isDeleting) return;
    setActionError(null);
    setIsDeleteConfirmOpen(true);
  };

  const performDelete = async () => {
    if (!remoteFrameId || isDeleting) return;

    setIsDeleting(true);
    try {
      await deleteFrame(remoteFrameId);
      setIsDeleteConfirmOpen(false);
      router.push("/theme");
    } catch (error) {
      console.error(error);
      setIsDeleteConfirmOpen(false);
      /*
        상한을 넘겨 클라이언트가 끊은 경우(lib/remoteFrameApi.ts 의 DELETE_DEADLINE_MS).
        끊긴 쪽에서는 서버가 이미 지웠는지 알 수 없으니 "지우지 못했어요"라고 하지 않는다 —
        실제로 지워졌다면 다음에 목록을 연 사용자가 없는 프레임을 보게 된다. 여기서는
        `/theme` 로 옮기지도 않는다(성공 경로만 옮긴다). 이름은 클래스가 아니라 name 으로
        본다 — 이 화면의 테스트가 remoteFrameApi 를 통째로 목으로 갈아 끼운다.
      */
      const errorName = (error as { name?: unknown } | null)?.name;
      if (errorName === "FrameDeleteTimeoutError") {
        setActionError(
          "응답이 없어 삭제 결과를 확인하지 못했어요. 잠시 후 프레임 목록에서 확인해 주세요.",
        );
        return;
      }
      // 이 경로가 내는 코드는 기다린다고 풀리지 않는다 — 없는 프레임(GEN-031),
      // 시스템 프레임이라 소유자가 아님(GEN-021, remoteFrameApi.ts 참고),
      // 보관 기간 초과(SUBS-002). 아래 폴백은 네트워크 오류처럼 정말 다시 시도해
      // 볼 만한 갈래에만 남는다.
      setActionError(
        getUserFacingApiErrorMessage(
          error,
          "프레임을 지우지 못했어요. 잠시 후 다시 시도해 주세요.",
        ),
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-(--hc-text)">
      <div className="mx-auto w-full max-w-6xl flex flex-col gap-4 lg:gap-6">
        {/*
          다른 흐름 화면과 같은 PageHeader — [<] 제목 [저장]. 예전에는 로고 + 밑줄 링크(16px 높이) +
          초록 알약이었고 화면 제목(h1)이 없어서 여기가 어디인지 헤더가 말하지 않았다.
          모바일에서는 저장이 캔버스 두 화면 위에 있어 헤더를 붙여 둔다(lg 이상은 한 화면에 다 들어온다).
        */}
        <div className="sticky top-0 z-20 -mx-4 -mt-6 bg-(--hc-surface-soft) px-4 pb-2 pt-6 backdrop-blur-md lg:static lg:mx-0 lg:mt-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <PageHeader
            backHref="/theme"
            backLabel="프레임 목록으로"
            title={remoteFrameId ? "프레임 수정" : "프레임 꾸미기"}
            onBackClick={() => {
              stopDraftAutosaveRef.current?.();
              useThemeEditorStore.getState().reset();
              if (draftOwnerId) discardEditorDraft(draftOwnerId, frameId);
            }}
            rightSlot={
              <button
                type="button"
                onClick={openSaveDialog}
                disabled={isSaving || isLoadingFrame || hasRemoteLoadFailure}
                className="hc-button-primary inline-flex h-11 items-center rounded-full px-5 text-[13px] font-extrabold disabled:opacity-50"
              >
                {isSaving ? "저장 중…" : remoteFrameId ? "수정 저장" : "저장"}
              </button>
            }
          />
        </div>
        {/*
          삭제는 헤더에 같이 두지 않는다. 처음 뗀 이유는 겹침이었다 — 그때 PageHeader 는 제목
          좌우로 7rem(112px)만 비웠고 `삭제`+`수정 저장`은 152px 이라 320px 에서 48px 겹쳤다.
          그 원인은 이제 PageHeader 쪽에서 없앴다(칸이 실제 내용 폭을 갖는다). 그래도 떼어 둔
          채로 두는 것은 아래 이유 때문이다.
          한 줄 내려서 고정 바 밖에 두는 이유 — 되돌릴 수 없는 동작이라 캔버스 위에 붙박이로
          띄워 둘 것이 아니고, 고정 바가 76px 그대로라 좁은 화면에서 캔버스도 안 뺏긴다.
        */}
        {remoteFrameId ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting || isSaving}
              className="inline-flex h-11 items-center rounded-full border border-(--hc-danger-border) px-4 text-[13px] font-semibold text-(--hc-danger) hover:bg-(--hc-danger-soft-bg) disabled:opacity-50"
            >
              {isDeleting ? "삭제 중…" : "삭제"}
            </button>
          </div>
        ) : null}
        {loadError || actionError ? (
          <p role="alert" className="text-[12px] text-(--hc-danger)">
            {loadError ?? actionError}
          </p>
        ) : null}

        {isLoadingFrame ? (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
            저장한 프레임을 불러오고 있어요.
          </section>
        ) : null}

        <div className="grid grid-cols-1 gap-4 pb-[calc(30dvh+5rem)] lg:gap-6 lg:pb-0 lg:grid-cols-[380px_minmax(0,1fr)] lg:auto-rows-min">
          <div className="lg:col-start-1 lg:row-start-1 lg:row-span-3">
            {/* 모바일은 캔버스 자리가 모자라 카드 테두리·제목 줄을 걷는다. */}
            <section className="flex flex-col gap-3 lg:rounded-2xl lg:border lg:border-zinc-800 lg:bg-zinc-900/60 lg:p-4">
              <div className="flex items-center justify-between max-lg:hidden">
                <p className="text-sm font-semibold">미리보기</p>
                <p className="text-[12px] text-(--hc-muted)">
                  스티커, 사진, 글을 조합해 나만의 프레임을 만들어요.
                </p>
              </div>

              {/* 캔버스가 스스로 크기를 정한다. 고정 높이를 주면 방금 늘린 캔버스가 잘린다. */}
              <div className="flex items-center justify-center lg:min-h-82.5">
                <CanvasStage maxHeight={mobileCanvasMaxHeight} />
              </div>
            </section>
          </div>
          {/*
            모바일: 고른 도구 하나만 하단 시트에 띄운다. 데스크톱: `lg:contents` 로 감싼 칸이
            사라져 각 패널이 오른쪽 열의 제자리로 들어간다(예전 배치 그대로).
          */}
          <div
            id="theme-editor-tool-sheet"
            className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 max-h-[30dvh] overflow-y-auto overscroll-contain border-t border-(--hc-border) bg-(--hc-surface-soft) px-4 pb-3 pt-3 lg:contents"
          >
            <div className={`lg:col-start-2 lg:row-start-1 min-w-0 ${mobileTool === "assets" ? "" : "max-lg:hidden"}`}>
              <AssetPanel />
            </div>
            <div className={`lg:col-start-2 lg:row-start-2 ${mobileTool === "background" ? "" : "max-lg:hidden"}`}>
              <BackgroundPanel frameId={frameId} />
            </div>
            <div className={`lg:col-start-2 lg:row-start-3 ${mobileTool === "cutout" ? "" : "max-lg:hidden"}`}>
              <CutoutPanel />
            </div>
            <div className={`lg:col-start-2 lg:row-start-4 ${mobileTool === "layers" ? "" : "max-lg:hidden"}`}>
              <LayersPanel />
            </div>
            <div className={`lg:col-start-2 lg:row-start-5 ${mobileTool === "inspector" ? "" : "max-lg:hidden"}`}>
              <InspectorPanel />
            </div>
          </div>
        </div>
        <nav
          aria-label="편집 도구"
          className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-(--hc-border) bg-(--hc-card) pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {MOBILE_TOOLS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={mobileTool === id}
              aria-controls="theme-editor-tool-sheet"
              onClick={() => setMobileTool(id)}
              className={`flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                mobileTool === id ? "text-(--hc-text)" : "text-(--hc-muted)"
              }`}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {isDeleteConfirmOpen && remoteFrameId ? (
        <ConfirmDialog
          title="이 프레임을 지울까요?"
          description="지운 프레임은 되돌릴 수 없어요."
          confirmLabel="지우기"
          runningLabel="지우는 중…"
          running={isDeleting}
          destructive
          onClose={() => setIsDeleteConfirmOpen(false)}
          onConfirm={() => void performDelete()}
        />
      ) : null}

      {isSaveDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 py-5 sm:items-center">
          <div
            ref={saveDialogRef}
            aria-modal="true"
            aria-labelledby="theme-save-dialog-title"
            role="dialog"
            className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
          >
            <div>
              <h2
                className="text-base font-semibold text-zinc-50"
                id="theme-save-dialog-title"
              >
                {remoteFrameId ? "저장한 프레임 수정" : "프레임 저장"}
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-(--hc-muted)">
                저장할 프레임 이름과 설명을 입력해 주세요.
              </p>
              {hiddenLayerCount > 0 ? (
                <p className="mt-2 text-[12px] leading-5 text-(--hc-muted)">
                  숨긴 레이어가 {hiddenLayerCount}개 있어요.
                </p>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5 text-[12px] font-semibold text-zinc-300">
                프레임 이름
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="hc-input h-11 rounded-xl border px-3 text-sm font-normal"
                  disabled={isSaving}
                  maxLength={40}
                  placeholder="프레임 이름을 입력해 주세요"
                />
              </label>
              <label className="grid gap-1.5 text-[12px] font-semibold text-zinc-300">
                프레임 설명
                <textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  className="hc-input min-h-24 rounded-xl border px-3 py-2 text-sm font-normal"
                  disabled={isSaving}
                  maxLength={160}
                  placeholder="프레임 설명을 입력해 주세요"
                />
              </label>
              {saveDialogError ? (
                <p className="text-[11px] leading-5 text-(--hc-danger)">
                  {saveDialogError}
                </p>
              ) : null}
              {versionConflict ? (
                <div className="flex flex-col gap-2 rounded-xl border border-(--hc-danger-border) p-3 text-[12px]">
                  <p>다른 기기에서 이 프레임을 먼저 저장했어요. 어떻게 할까요?</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => window.location.reload()}
                      className="h-11 rounded-full border border-zinc-700 px-4 font-semibold"
                    >
                      저장본 다시 불러오기
                    </button>
                    <button
                      type="button"
                      disabled={isSaving || versionConflict.currentVersion === null}
                      onClick={() => {
                        // 서버의 현재 버전 위에 지금 편집을 덮어쓴다 — 사용자가 고른 경우에만.
                        frameVersionRef.current = versionConflict.currentVersion;
                        void onDone();
                      }}
                      className="h-11 rounded-full border border-(--hc-danger-border) px-4 font-semibold text-(--hc-danger)"
                    >
                      내 편집으로 덮어쓰기
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!isSaving) {
                    setIsSaveDialogOpen(false);
                  }
                }}
                disabled={isSaving}
                className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-300 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void onDone()}
                disabled={isSaving}
                className="hc-button-primary rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
              >
                {isSaving ? "저장 중…" : remoteFrameId ? "수정 저장" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
