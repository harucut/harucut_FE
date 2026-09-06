"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { BACKGROUND_COLORS } from "@/constants/colors";
import { CanvasStage } from "@/components/theme/editor/canvas/CanvasStage";
import { AssetPanel } from "@/components/theme/editor/AssetPanel";
import { LayersPanel } from "@/components/theme/editor/LayersPanel";
import { InspectorPanel } from "@/components/theme/editor/InspectorPanel";
import { CutoutPanel } from "@/components/theme/editor/CutoutPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toCreateFrameRequest, toThemeExportJson } from "@/lib/frameApi";
import { resolveThemeAssetUrls } from "@/lib/frameAssets";
import {
  createFrame,
  deleteFrame,
  getFrame,
  updateFrame,
} from "@/lib/remoteFrameApi";
import {
  PRESIGNED_UPLOAD_TYPES,
  SUPPORTED_IMAGE_ACCEPT,
  UNSUPPORTED_UPLOAD_MESSAGE,
  getImageUrlByKey,
  isSupportedUploadFile,
  uploadToS3WithPresigned,
} from "@/lib/presignedUploadApi";
import { renderThemePreviewPng } from "@/lib/canvas/renderThemePreview";
import {
  buildFrameContentKey,
  useShootSession,
} from "@/lib/shootSessionStore";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { useThemeEditorStore } from "@/lib/themeEditorStore";
import { useThemeSession } from "@/lib/themeSessionStore";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
import {
  clearEditorDraft,
  loadEditorDraft,
  saveEditorDraft,
} from "@/lib/themeEditorDraft";

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
        ? { type: "IMAGE", key: background.key ?? null, opacity: background.opacity ?? null }
        : { type: "COLOR", value: background.value },
    backgroundColor,
    cellCutouts,
  });
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
  const setBackgroundColor = useThemeEditorStore((s) => s.setBackgroundColor);
  const setBackgroundImage = useThemeEditorStore((s) => s.setBackgroundImage);
  const setBackgroundImageUrl = useThemeEditorStore((s) => s.setBackgroundImageUrl);
  const clearBackgroundImage = useThemeEditorStore((s) => s.clearBackgroundImage);
  const editorComponents = useThemeEditorStore((s) => s.components);
  const storeFrameId = useThemeEditorStore((s) => s.frameId);
  const cellCutouts = useThemeEditorStore((s) => s.cellCutouts);
  const { remoteFrameId } = useThemeSession();
  // 저장 다이얼로그에서 알려 준다. 예전에는 저장을 누른 순간 window.alert 로 끼어들었다.
  const hiddenLayerCount = editorComponents.filter((c) => c.hidden).length;

  // 편집 중 판정은 "콘텐츠가 있는지"가 아니라 "기준 상태에서 바뀌었는지"로 한다.
  // 콘텐츠 유무로 보면 컴포넌트나 이미지 배경이 있는 저장 프레임을 열기만 해도
  // 매번 이탈 경고가 떠서, 아무것도 고치지 않은 사용자까지 붙잡는다.
  const editorSignature = useMemo(
    () =>
      buildEditorSignature(
        editorComponents,
        background,
        backgroundColor,
        cellCutouts,
      ),
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
    isSaveDialogOpen &&
    (draftTitle !== title || draftDescription !== description);

  useUnsavedWorkGuard(hasUnsavedCanvasChanges || hasUnsavedSaveDialogInput);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
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

  // 새 프레임 작업 시: 새로고침/이탈로 남은 WIP 초안(localStorage)이 있으면 복원한다.
  // 원격 프레임 수정 중에는 저장본을 불러오므로 초안 복원을 하지 않는다.
  const didRestoreDraftRef = useRef(false);
  useEffect(() => {
    if (remoteFrameId || didRestoreDraftRef.current) return;
    didRestoreDraftRef.current = true;
    const draft = loadEditorDraft();
    if (draft && draft.frameId === frameId) {
      hydrateDraft(draft);
    }
  }, [frameId, remoteFrameId, hydrateDraft]);

  // 편집 중 상태를 localStorage에 자동 저장(디바운스). S3 temp 업로드 대신 로컬 보관.
  useEffect(() => {
    if (remoteFrameId) return;
    let timer: number | undefined;
    let idle: number | undefined;

    // 저장은 5MB 문자열을 만들고 쓰는 동기 작업이라 메인 스레드를 잡는다. 디바운스가 끝난
    // 순간이 하필 사용자가 스티커를 끌고 있는 순간일 수 있어, 한가한 프레임까지 한 번 더
    // 미룬다. 지원하지 않는 브라우저에서는 다음 틱에 그냥 실행한다.
    const whenIdle = (run: () => void) => {
      const ric = (
        window as typeof window & {
          requestIdleCallback?: (cb: IdleRequestCallback, o?: IdleRequestOptions) => number;
        }
      ).requestIdleCallback;
      idle = ric
        ? ric(() => run(), { timeout: 2000 })
        : window.setTimeout(run, 0);
    };

    const unsubscribe = useThemeEditorStore.subscribe(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        whenIdle(() => {
          const s = useThemeEditorStore.getState();
          if (!s.frameId) return;
          const isEmptyDefault =
            s.components.length === 0 && s.background.type === "COLOR";
          if (isEmptyDefault) {
            clearEditorDraft();
            return;
          }
          void saveEditorDraft({
            frameId: s.frameId,
            backgroundColor: s.backgroundColor,
            background: s.background,
            cellCutouts: s.cellCutouts,
            components: s.components,
            now: Date.now(),
          });
        });
      }, 1000);
    });
    return () => {
      window.clearTimeout(timer);
      if (idle !== undefined) {
        const cic = (
          window as typeof window & { cancelIdleCallback?: (id: number) => void }
        ).cancelIdleCallback;
        if (cic) cic(idle);
        else window.clearTimeout(idle);
      }
      unsubscribe();
    };
  }, [remoteFrameId]);

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
    try {
      // 로컬 배경 이미지가 있으면 먼저 업로드해 IMAGE 배경 key를 채운다.
      const editorState = useThemeEditorStore.getState();
      if (
        editorState.pendingBackgroundFile &&
        editorState.background.type === "IMAGE" &&
        !editorState.background.key
      ) {
        const { key } = await uploadToS3WithPresigned({
          file: editorState.pendingBackgroundFile,
          type: PRESIGNED_UPLOAD_TYPES.FRAME,
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
      const previewFile = new File(
        [previewBlob],
        `theme-preview-${Date.now()}.png`,
        { type: "image/png" },
      );
      const { key: previewKey } = await uploadToS3WithPresigned({
        file: previewFile,
        type: PRESIGNED_UPLOAD_TYPES.FRAME,
      });

      const body = toCreateFrameRequest(themeJson, {
        title: nextTitle,
        description: nextDescription,
        previewKey,
      });

      if (remoteFrameId) {
        await updateFrame(remoteFrameId, body);
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

      clearEditorDraft();
      // 저장했으니 지금 상태가 새 기준이다. 이탈 경고를 그대로 두면 저장 직후
      // /theme로 나가는 길에도 경고가 뜬다.
      setBaseline({ key: baselineKey, signature: editorSignature });
      setTitle(nextTitle);
      setDescription(nextDescription);
      setIsSaveDialogOpen(false);
      router.push("/theme");
    } catch (error) {
      console.error(error);
      setSaveDialogError(
        getUserFacingApiErrorMessage(error, "저장에 실패했어요."),
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
      setActionError("프레임을 지우지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-[color:var(--hc-text)]">
      <div className="mx-auto w-full max-w-6xl flex flex-col gap-4 lg:gap-6">
        {/*
          다른 흐름 화면과 같은 PageHeader — [<] 제목 [저장]. 예전에는 로고 + 밑줄 링크(16px 높이) +
          초록 알약이었고 화면 제목(h1)이 없어서 여기가 어디인지 헤더가 말하지 않았다.
          모바일에서는 저장이 캔버스 두 화면 위에 있어 헤더를 붙여 둔다(lg 이상은 한 화면에 다 들어온다).
        */}
        <div className="sticky top-0 z-20 -mx-4 -mt-6 bg-[color:var(--hc-surface-soft)] px-4 pb-2 pt-6 backdrop-blur-md lg:static lg:mx-0 lg:mt-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <PageHeader
            backHref="/theme"
            backLabel="프레임 목록으로"
            title={remoteFrameId ? "프레임 수정" : "프레임 꾸미기"}
            onBackClick={() => {
              useThemeEditorStore.getState().reset();
              clearEditorDraft();
            }}
            rightSlot={
              <div className="flex items-center gap-2">
                {remoteFrameId ? (
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={isDeleting || isSaving}
                    className="inline-flex h-11 items-center rounded-full border border-[color:var(--hc-danger-border)] px-4 text-[13px] font-semibold text-[color:var(--hc-danger)] hover:bg-[color:var(--hc-danger-soft-bg)] disabled:opacity-50"
                  >
                    {isDeleting ? "삭제 중…" : "삭제"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={openSaveDialog}
                  disabled={isSaving || isLoadingFrame || hasRemoteLoadFailure}
                  className="hc-button-primary inline-flex h-11 items-center rounded-full px-5 text-[13px] font-extrabold disabled:opacity-50"
                >
                  {isSaving ? "저장 중…" : remoteFrameId ? "수정 저장" : "저장"}
                </button>
              </div>
            }
          />
        </div>
        {loadError || actionError ? (
          <p role="alert" className="text-[12px] text-[color:var(--hc-danger)]">
            {loadError ?? actionError}
          </p>
        ) : null}

        {isLoadingFrame ? (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
            저장한 프레임을 불러오고 있어요.
          </section>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:auto-rows-min">
          <div className="lg:col-start-2 lg:row-start-1 min-w-0">
            <AssetPanel />
          </div>

          <div className="lg:col-start-2 lg:row-start-2">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold">배경</p>
              <div className="flex flex-wrap gap-2">
                {BACKGROUND_COLORS.map((color) => {
                  const selected = backgroundColor === color.value;
                  return (
                    // 라벨을 스와치 위에 얹으면 색마다 대비가 1.4~3.5:1 로 널뛴다.
                    // 스와치는 색만 보여주고 이름은 아래에 둔다.
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => setBackgroundColor(color.value)}
                      aria-pressed={selected}
                      className={`flex min-w-16 flex-col items-center gap-1 rounded-lg border p-1 text-[12px] ${
                        selected
                          ? "border-[color:var(--hc-primary)] bg-[color:var(--hc-accent-soft-bg)] text-[color:var(--hc-primary-strong)]"
                          : "border-[color:var(--hc-border)] text-[color:var(--hc-muted)]"
                      }`}
                    >
                      <span
                        aria-hidden
                        className="block h-6 w-full rounded border border-[color:var(--hc-border-subtle)]"
                        style={{ backgroundColor: `#${color.value}` }}
                      />
                      {color.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="배경색 직접 고르기"
                  value={`#${backgroundColor}`}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="hc-input h-11 w-12 shrink-0 rounded-lg border"
                />
                {/* 값은 '#' 없이 저장된다. 코드 입력이라는 것이 보이게 접두를 화면에만 붙인다. */}
                <div className="hc-input flex h-11 min-w-0 flex-1 items-center gap-1 rounded-lg border px-3">
                  <span aria-hidden className="font-mono text-[13px] text-[color:var(--hc-muted)]">
                    #
                  </span>
                  <input
                    aria-label="배경색 코드"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent font-mono text-[13px] tracking-[0.06em] text-[color:var(--hc-text)] outline-none"
                    placeholder="ffffff"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    maxLength={7}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-lg border border-[color:var(--hc-border)] px-3 text-[12px] font-semibold text-[color:var(--hc-text)] hover:border-[color:var(--hc-primary)]">
                  {background.type === "IMAGE" ? "배경 이미지 변경" : "배경 이미지"}
                  <input
                    type="file"
                    accept={SUPPORTED_IMAGE_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;

                      // heic/avif 같은 형식은 저장 단계에서야 실패한다.
                      // 편집을 다 끝낸 뒤 막히지 않도록 고른 즉시 걸러낸다.
                      if (!isSupportedUploadFile(file)) {
                        setBackgroundError(UNSUPPORTED_UPLOAD_MESSAGE);
                        return;
                      }

                      setBackgroundError(null);
                      setBackgroundImage(file);
                    }}
                  />
                </label>
                {background.type === "IMAGE" ? (
                  <button
                    type="button"
                    onClick={clearBackgroundImage}
                    className="h-11 rounded-lg border border-[color:var(--hc-border)] px-3 text-[12px] font-semibold text-[color:var(--hc-muted)] hover:border-[color:var(--hc-primary)]"
                  >
                    이미지 제거
                  </button>
                ) : null}
              </div>
              {backgroundError ? (
                <p className="text-[11px] leading-4 text-[color:var(--hc-danger)]">
                  {backgroundError}
                </p>
              ) : null}
              <p className="text-[12px] leading-5 text-[color:var(--hc-muted)]">
                배경 이미지는 사진 칸 뒤에 깔려요. PNG·JPG·WEBP·GIF만 올릴 수
                있어요.
              </p>
            </section>
          </div>

          <div className="lg:col-start-1 lg:row-start-1 lg:row-span-3">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">미리보기</p>
                <p className="text-[12px] text-[color:var(--hc-muted)]">
                  스티커, 사진, 글을 조합해 나만의 프레임을 만들어요.
                </p>
              </div>

              {/* 캔버스가 스스로 크기를 정한다. 고정 높이를 주면 방금 늘린 캔버스가 잘린다. */}
              <div className="flex min-h-[330px] items-center justify-center">
                <CanvasStage />
              </div>
            </section>
          </div>

          <div className="lg:col-start-2 lg:row-start-3">
            <CutoutPanel />
          </div>

          <div className="lg:col-start-2 lg:row-start-4">
            <LayersPanel />
          </div>

          <div className="lg:col-start-2 lg:row-start-5">
            <InspectorPanel />
          </div>
        </div>
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
              <p className="mt-1 text-[13px] leading-5 text-[color:var(--hc-muted)]">
                저장할 프레임 이름과 설명을 입력해 주세요.
              </p>
              {hiddenLayerCount > 0 ? (
                <p className="mt-2 text-[12px] leading-5 text-[color:var(--hc-muted)]">
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
                <p className="text-[11px] leading-5 text-[color:var(--hc-danger)]">
                  {saveDialogError}
                </p>
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

