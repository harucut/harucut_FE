import type { FrameId } from "@/constants/frames";

export type ComponentType = "PHOTO" | "STICKER" | "TEXT";

export type TextStyleJson = {
  fontFamily: string;
  fontSize: number;
  color: string;
  textAlign: "left" | "center" | "right";
  opacity?: number;
};

export type CommonStyleJson = {
  opacity?: number;
};

export type BaseComponent = {
  id: string;
  type: ComponentType;

  // PHOTO/STICKER: 이미지 src, TEXT: 텍스트 내용
  source: string;

  x: number;
  y: number;
  width: number;
  height: number;

  scale: number;
  rotation: number;
  zIndex: number;

  styleJson?: CommonStyleJson | TextStyleJson;
  locked?: boolean;
  hidden?: boolean;
};

export type PhotoComponent = BaseComponent & {
  type: "PHOTO";
  styleJson?: CommonStyleJson;
};

export type StickerComponent = BaseComponent & {
  type: "STICKER";
  styleJson?: CommonStyleJson;
};

export type TextComponent = BaseComponent & {
  type: "TEXT";
  styleJson: TextStyleJson;
};

export type EditorComponent = PhotoComponent | StickerComponent | TextComponent;

export type Asset = { id: string; src: string; name?: string; s3Key?: string };

export type ThemeExportJson = {
  frameId: FrameId;
  components: Array<{
    id: string;
    type: ComponentType;
    source: string;
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    rotation: number;
    zIndex: number;
    styleJson?: Record<string, unknown>;
  }>;
};
