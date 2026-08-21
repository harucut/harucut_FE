import type { FrameId } from "@/constants/frames";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import type {
  RemoteFrameBackground,
  RemoteFrame,
  RemoteFrameType,
} from "@/lib/api-types";
import type { ThemeBackground, ThemeExportJson } from "@/lib/types/themeEditor";

export type CreateFrameRequest = {
  title: string;
  description: string;
  previewKey: string;
  frameType: RemoteFrameType;
  canvasWidth: number;
  canvasHeight: number;
  background: RemoteFrameBackground;
  /**
   * 칸별 누끼. 보내려면 **정확히 4개**여야 하고 촬영 슬롯 순서다(스웨거).
   * 생략하면 서버가 전부 끈 것으로 본다.
   */
  cellCutouts?: boolean[];
  components: Array<{
    id?: string;
    type: "PHOTO" | "STICKER" | "TEXT";
    source: string;
    /**
     * TEXT 전용. 글자 층을 구운 투명 PNG 의 S3 key.
     * 저장 시점에는 선택이지만 **없으면 그 프레임으로 합성이 400 GEN-002 로 죽는다.**
     */
    renderedKey?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    rotation: number;
    // 스웨거 ComponentRequest의 레이어 순서 필드는 zIndex(required) 하나다.
    // 소문자 zindex는 과거 하위호환 입력일 뿐 계약에 없으므로 보내지 않는다.
    zIndex: number;
    styleJson: Record<string, unknown>;
  }>;
};

/**
 * S3 key 로 쓸 수 있는 값만 통과시킨다.
 *
 * 서버는 `source` 를 key 로 정규화하는데, presigned 조회 URL 은 경로가
 * `.../uploads/users/xxx/...` 라 잘라내면 key 가 나온다. 반면 `/stickers/x.png` 처럼
 * 우리 웹서버가 주는 정적 경로는 S3 에 존재하지 않아 합성이 거부된다.
 * 예전에 URL 을 그대로 저장한 프레임을 다시 저장할 때도 여기서 key 로 되돌린다.
 */
export function toStorageKey(source: string): string {
  const value = source.trim();
  if (!/^https?:\/\//i.test(value)) return value;

  try {
    const path = new URL(value).pathname.replace(/^\/+/, "");
    const marker = path.indexOf("uploads/");
    return marker >= 0 ? path.slice(marker) : path;
  } catch {
    return value;
  }
}

export function frameTypeFromFrameId(frameId: FrameId): RemoteFrameType {
  if (frameId.startsWith("wide")) return "WIDE";
  if (frameId.startsWith("grid")) return "GRID";
  if (frameId.startsWith("polaroid")) return "POLAROID";
  return "CLASSIC";
}

export function frameIdFromFrameType(frameType: RemoteFrameType): FrameId {
  switch (frameType) {
    case "WIDE":
      return "wide-4";
    case "GRID":
      return "grid-4";
    case "POLAROID":
      return "polaroid-4";
    case "CLASSIC":
    default:
      return "classic-4";
  }
}

export function matchesFrameType(frameId: FrameId, frameType: RemoteFrameType) {
  return frameTypeFromFrameId(frameId) === frameType;
}

function normalizeHexColor(input: string) {
  const cleaned = input.trim().replace(/^#/, "");
  if (!cleaned) return "000000";
  return cleaned.toLowerCase();
}

function toRequestBackground(background?: ThemeBackground): RemoteFrameBackground {
  if (!background) {
    return { type: "COLOR", value: "000000" };
  }

  if (background.type === "COLOR") {
    return {
      type: "COLOR",
      value: normalizeHexColor(background.value),
    };
  }

  // 스웨거 ImageBackgroundAttributes는 key·opacity가 모두 required다.
  // 에디터가 불투명도를 따로 안 만지면 값이 비므로 기본값 1(불투명)을 채워 보낸다.
  return {
    type: "IMAGE",
    key: background.key,
    opacity: background.opacity ?? 1,
  };
}

function toThemeBackground(background?: RemoteFrameBackground): ThemeBackground | undefined {
  if (!background) {
    return undefined;
  }

  if (background.type === "COLOR") {
    return {
      type: "COLOR",
      value: normalizeHexColor(background.value),
    };
  }

  // 서버가 key(저장 키)와 url(서명된 조회 URL)을 분리해 내려준다.
  // 응답에도 opacity 기본값을 적용해, 왕복(불러오기→저장) 시 값이 사라지지 않게 한다.
  return {
    type: "IMAGE",
    key: background.key,
    ...(background.url ? { url: background.url } : {}),
    opacity: background.opacity ?? 1,
  };
}

export function toCreateFrameRequest(
  json: ThemeExportJson,
  meta: { title: string; description: string; previewKey: string },
): CreateFrameRequest {
  const layout = FRAME_LAYOUTS[json.frameId];
  const canvasWidth = layout.totalWidth;
  const canvasHeight = layout.totalHeight;

  return {
    title: meta.title,
    description: meta.description,
    previewKey: meta.previewKey,
    frameType: frameTypeFromFrameId(json.frameId),
    canvasWidth,
    canvasHeight,
    background: toRequestBackground(json.background),
    // 4개가 아니면 서버가 거절하므로(minItems/maxItems 4) 온전할 때만 싣는다.
    ...(json.cellCutouts?.length === 4 ? { cellCutouts: [...json.cellCutouts] } : {}),
    components: json.components.map((c) => ({
      type: c.type,
      // renderUrl 은 렌더 전용이라 보내지 않는다. 이미지 source 는 key 로 정규화한다.
      source: c.type === "TEXT" ? c.source : toStorageKey(c.source),
      ...(c.renderedKey ? { renderedKey: c.renderedKey } : {}),
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      scale: c.scale ?? 1,
      rotation: c.rotation ?? 0,
      zIndex: c.zIndex,
      styleJson: (c.styleJson ?? {}) as Record<string, unknown>,
      id: c.id,
    })),
  };
}

export function toThemeExportJson(frame: RemoteFrame): ThemeExportJson {
  return {
    frameId: frameIdFromFrameType(frame.frameType),
    background: toThemeBackground(frame.background),
    // 서버가 안 주면(구 프레임) 전부 꺼진 것으로 본다 — 스웨거의 생략 규칙과 같다.
    cellCutouts:
      frame.cellCutouts?.length === 4
        ? [...frame.cellCutouts]
        : [false, false, false, false],
    components: frame.components.map((component, index) => {
      // 응답은 그릴 값(`source`)과 순수 key(`key`)를 따로 준다.
      // 스웨거: "수정 요청을 다시 만들 때 `source` 자리에 이 `key` 값을 넣는다."
      // 그래서 key 를 source 로 되돌리고, 받은 URL 은 렌더 전용으로 옮긴다.
      // TEXT 의 source 는 글자 내용이라 그대로 둔다.
      const rawSource = component.source ?? "";
      const isText = component.type === "TEXT";
      const storageKey = isText ? rawSource : component.key || rawSource;
      const renderUrl =
        !isText && /^https?:\/\//i.test(rawSource) ? rawSource : undefined;

      return {
        id: String(component.id ?? `${component.type}-${index}`),
        type: component.type,
        source: storageKey,
        ...(renderUrl ? { renderUrl } : {}),
        x: component.x,
        y: component.y,
        width: component.width,
        height: component.height,
        scale: component.scale ?? 1,
        rotation: component.rotation ?? 0,
        zIndex: component.zIndex ?? index + 1,
        styleJson: (component.styleJson ?? component.style ?? {}) as Record<
          string,
          unknown
        >,
      };
    }),
  };
}
