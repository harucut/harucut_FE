import { FREE_CELL_COUNT, type FreeCell } from "@/lib/frameCells";
import { isFrameId, type FrameId } from "@/constants/frames";
import type { EditorComponent, ThemeBackground } from "@/lib/types/themeEditor";

/**
 * 서버 초안에 넣는 편집기 문서(ADR-0006 §5). 서버는 해석하지 않으므로 모양의 소유자는 이 파일이다.
 *
 * 로컬 초안(`lib/themeEditorDraft.ts`)과 다른 점은 **이미지를 담지 않는다**는 것 하나다.
 * 로컬 초안은 사진을 dataURL 로 넣지만, 서버 초안은 256KB 상한이고 다른 기기에서 열어야 하므로
 * 자산으로 먼저 올린 key·assetId 만 넣는다. 아직 안 올린 이미지가 있으면 문서를 만들지 않는다 —
 * 호출부가 먼저 올린다(`themeEditorStore.uploadLocalImagesForDraft`).
 *
 * 그릴 주소(`renderUrl`, 배경 `url`)는 넣지 않는다. 이 기기의 blob 주소거나 몇 분이면 끝나는
 * 서명 URL 이라 다른 기기에서 쓸모가 없다. 여는 쪽이 key 로 다시 해석한다.
 */
export const SERVER_DOCUMENT_SCHEMA_VERSION = 1;

export type ServerEditorDocument = {
  schemaVersion: typeof SERVER_DOCUMENT_SCHEMA_VERSION;
  frameId: FrameId;
  backgroundColor: string;
  background: ThemeBackground;
  cellCutouts: boolean[];
  /**
   * 자유 사진 칸(P5). 고정 레이아웃이면 키가 없다. 필드만 더한 것이라 schemaVersion 은 그대로다 — 올리면 옛 앱이 문서를 통째로 버린다.
   */
  cells?: FreeCell[];
  components: EditorComponent[];
};

/** 다른 기기·앱 버전이 쓴 칸 목록은 모양만 확인한다. 값의 범위는 저장할 때 서버가 다시 본다. */
function isCellList(value: unknown): value is FreeCell[] {
  return (
    Array.isArray(value) &&
    value.length === FREE_CELL_COUNT &&
    value.every(
      (cell) =>
        isRecord(cell) &&
        ["x", "y", "width", "height", "rotation", "shotIndex"].every((k) => typeof cell[k] === "number") &&
        isRecord(cell.shape) &&
        (cell.shape.type === "RECT" || cell.shape.type === "ELLIPSE"),
    )
  );
}

type EditorSnapshot = Omit<ServerEditorDocument, "schemaVersion" | "cells"> & {
  cells?: FreeCell[] | null;
  /** 아직 안 올린 배경 파일. 있으면 문서를 만들 수 없다. */
  pendingBackgroundFile?: File | null;
};

function isLocalSource(src: string) {
  return src.startsWith("blob:") || src.startsWith("data:");
}

/** 자산으로 올려야 문서에 넣을 수 있는 이미지가 남아 있는가. 정적 스티커 경로(`/stickers/…`)는 우리 웹 자산이라 그대로 둔다. */
export function hasLocalImages(state: EditorSnapshot): boolean {
  if (state.components.some((c) => c.type !== "TEXT" && isLocalSource(c.source))) return true;
  // 고른 배경 파일이 남아 있어도 이미 올려 key 가 생겼으면 문서에 넣을 수 있다. 파일이 남은 것만 보면
  // 배경을 쓰는 동안 서버 초안이 한 번도 저장되지 않는다(Codex 리뷰 #528).
  return state.background.type === "IMAGE" && !state.background.key;
}

/**
 * 문서와 그 문서가 쓰는 자산 id. 올리지 않은 이미지가 있으면 null.
 *
 * `assetIds` 를 빠뜨리면 정리 배치가 그 자산을 「아무도 안 쓴다」고 보고 지울 수 있다.
 * 그래서 문서에 든 id 를 **여기서 한꺼번에** 모은다 — 구운 글자(`renderedAssetId`)도 넣는다.
 */
export function toServerDocument(
  state: EditorSnapshot,
): { document: ServerEditorDocument; assetIds: string[] } | null {
  if (hasLocalImages(state)) return null;

  const components = state.components.map((c) => {
    const rest = { ...c };
    delete rest.renderUrl;
    return rest;
  });
  const background: ThemeBackground =
    state.background.type === "IMAGE"
      ? {
          type: "IMAGE",
          key: state.background.key,
          ...(state.background.assetId ? { assetId: state.background.assetId } : {}),
          ...(state.background.opacity !== undefined ? { opacity: state.background.opacity } : {}),
        }
      : state.background;

  const assetIds = new Set<string>();
  for (const c of components) {
    if (c.assetId) assetIds.add(c.assetId);
    if (c.renderedAssetId) assetIds.add(c.renderedAssetId);
  }
  if (background.type === "IMAGE" && background.assetId) assetIds.add(background.assetId);

  return {
    document: {
      schemaVersion: SERVER_DOCUMENT_SCHEMA_VERSION,
      frameId: state.frameId,
      backgroundColor: state.backgroundColor,
      background,
      cellCutouts: [...state.cellCutouts],
      ...(state.cells ? { cells: state.cells } : {}),
      components,
    },
    assetIds: Array.from(assetIds),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 서버에서 받은 문서를 읽는다. 모양이 다르거나 다른 판형의 초안이면 null.
 *
 * 다른 기기의 다른 앱 버전이 쓴 문서일 수 있어 필요한 것만 확인한다. 낯선 schemaVersion 은
 * 버린다 — 반쯤 읽어 복원하면 잃는 레이어가 생겨도 사용자가 알 수 없다.
 */
export function parseServerDocument(raw: unknown, frameId: FrameId): ServerEditorDocument | null {
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== SERVER_DOCUMENT_SCHEMA_VERSION) return null;
  if (typeof raw.frameId !== "string" || !isFrameId(raw.frameId) || raw.frameId !== frameId) return null;
  if (!Array.isArray(raw.components) || !raw.components.every(isRecord)) return null;
  if (!isRecord(raw.background) || (raw.background.type !== "COLOR" && raw.background.type !== "IMAGE")) {
    return null;
  }
  return {
    schemaVersion: SERVER_DOCUMENT_SCHEMA_VERSION,
    frameId: raw.frameId,
    backgroundColor: typeof raw.backgroundColor === "string" ? raw.backgroundColor : "111827",
    background: raw.background as ThemeBackground,
    cellCutouts: [0, 1, 2, 3].map((i) => Array.isArray(raw.cellCutouts) && raw.cellCutouts[i] === true),
    ...(isCellList(raw.cells) ? { cells: raw.cells } : {}),
    components: raw.components as EditorComponent[],
  };
}
