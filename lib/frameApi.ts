import type { ThemeExportJson, EditorComponent } from "@/lib/types/themeEditor";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";

type CreateFrameRequest = {
  title: string;
  description: string;
  previewKey: string;
  frameType: "CLASSIC" | "WIDE" | "SQUARE"; // 서버 enum에 맞게
  canvasWidth: number;
  canvasHeight: number;
  background: { type: "COLOR" | "IMAGE"; value: string };
  components: Array<{
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
    // 서버가 id를 받는지 여부에 따라 선택
    id?: string;
  }>;
};

// FrameId에서 서버 enum으로 변환
function inferFrameType(frameId: string): CreateFrameRequest["frameType"] {
  // 너네 FrameId 규칙에 맞게 매핑
  if (frameId.startsWith("wide")) return "WIDE";
  return "CLASSIC";
}

/**
 * 에디터 JSON을 서버 요청 스키마로 변환
 */
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

    frameType: inferFrameType(json.frameId),

    canvasWidth,
    canvasHeight,

    // 배경을 지금 store에서 안 다루는 중이면 일단 기본값 박아두기
    background: { type: "COLOR", value: "#000000" },

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
      // 서버가 필요하면 여기서 넣기
      id: c.id,
    })),
  };
}
