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
  components: Array<{
    id?: string;
    type: "PHOTO" | "STICKER" | "TEXT";
    source: string;
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

  // 서버는 IMAGE 배경 응답의 key 자리에 **이미 서명된 조회 URL**을 넣어 준다
  // (FrameComponentAssembler.resolveBackgroundUrl → presignIfManaged). 이걸 다시 key로 보고
  // presigned-img를 부르면 URL 문자열 자체를 S3 키로 서명해 깨진 주소가 나온다.
  // 그래서 URL이면 렌더용 url을 함께 채워, 재서명 경로가 타지 않게 한다.
  // (저장 시에는 서버가 normalizeManagedKey로 URL→키를 되돌리므로 key는 그대로 보내면 된다)
  const rawKey = background.key;
  const isResolvedUrl = typeof rawKey === "string" && /^https?:\/\//i.test(rawKey);

  // 응답에도 같은 기본값을 적용해, 왕복(불러오기→저장) 시 opacity가 사라지지 않게 한다.
  return {
    type: "IMAGE",
    key: rawKey,
    ...(isResolvedUrl ? { url: rawKey } : {}),
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
    components: json.components.map((c) => ({
      type: c.type,
      source: c.source,
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

// 서버는 저장 시 컴포넌트 source의 선행 슬래시를 지운다(FrameAssetManager.stripLeadingSlash).
// 그래서 로컬 스티커 "/stickers/x.png"가 "stickers/x.png"로 돌아오고, 에디터 경로(/theme/…)를
// 기준으로 상대 해석돼 404가 난다. 읽을 때 다시 앞에 붙여 준다.
// TEXT는 source 자리가 본문 텍스트라 절대 건드리면 안 된다.
function restoreComponentSource(type: string, source: string) {
  if (type === "TEXT" || !source) return source;
  if (/^(https?:|data:|blob:|s3:|\/)/i.test(source)) return source;
  // S3 키는 우리 정적 자산이 아니다(별도 서명이 필요하므로 손대지 않는다).
  if (source.startsWith("uploads/")) return source;
  return `/${source}`;
}

export function toThemeExportJson(frame: RemoteFrame): ThemeExportJson {
  return {
    frameId: frameIdFromFrameType(frame.frameType),
    background: toThemeBackground(frame.background),
    components: frame.components.map((component, index) => ({
      id: String(component.id ?? `${component.type}-${index}`),
      type: component.type,
      source: restoreComponentSource(
        component.type,
        component.source || component.key || "",
      ),
      x: component.x,
      y: component.y,
      width: component.width,
      height: component.height,
      scale: component.scale ?? 1,
      rotation: component.rotation ?? 0,
      zIndex: component.zIndex ?? index + 1,
      styleJson:
        (component.styleJson ?? component.style ?? {}) as Record<string, unknown>,
    })),
  };
}
