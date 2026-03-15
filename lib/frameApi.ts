import type { FrameId } from "@/constants/frames";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import type {
  RemoteFrame,
  RemoteFrameType,
} from "@/lib/api-types";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

export type CreateFrameRequest = {
  title: string;
  description: string;
  previewKey: string;
  frameType: RemoteFrameType;
  canvasWidth: number;
  canvasHeight: number;
  background: { type: "COLOR"; value: string };
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

export function toCreateFrameRequest(
  json: ThemeExportJson,
  meta: { title: string; description: string; previewKey: string },
): CreateFrameRequest {
  const layout = FRAME_LAYOUTS[json.frameId];
  const canvasWidth = layout.totalWidth;
  const canvasHeight = layout.totalHeight;
  const bgRaw = json.background?.value ?? "000000";

  return {
    title: meta.title,
    description: meta.description,
    previewKey: meta.previewKey,
    frameType: frameTypeFromFrameId(json.frameId),
    canvasWidth,
    canvasHeight,
    background: { type: "COLOR", value: normalizeHexColor(bgRaw) },
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

export function toThemeExportJson(frame: RemoteFrame): ThemeExportJson {
  return {
    frameId: frameIdFromFrameType(frame.frameType),
    background:
      frame.background?.type === "COLOR"
        ? {
            type: "COLOR",
            value: normalizeHexColor(frame.background.value),
          }
        : undefined,
    components: frame.components.map((component, index) => ({
      id: String(component.id ?? `${component.type}-${index}`),
      type: component.type,
      source: component.source || component.key || "",
      x: component.x,
      y: component.y,
      width: component.width,
      height: component.height,
      scale: component.scale ?? 1,
      rotation: component.rotation ?? 0,
      zIndex: component.zIndex,
      styleJson:
        (component.styleJson ?? component.style ?? {}) as Record<string, unknown>,
    })),
  };
}
