"use client";

import { Rect } from "react-konva";
import type Konva from "konva";
import type { GroupConfig } from "konva/lib/Group";

import type { EditorComponent, TextComponent } from "@/lib/types/themeEditor";
import { getOpacity } from "./utils";
import { ImageNode } from "./nodes/ImageNode";
import { TextNode } from "./nodes/TextNode";
import { useThemeEditorStore } from "@/lib/themeEditorStore";

type Props = {
  c: EditorComponent;
  isActive: boolean;
  onSelect: () => void;
  onCommit: (patch: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    scale?: number;
  }) => void;
};

function isText(c: EditorComponent): c is TextComponent {
  return c.type === "TEXT";
}

export function EditableNode({ c, isActive, onSelect, onCommit }: Props) {
  const bumpRenderKey = useThemeEditorStore((s) => s.bumpRenderKey);
  if (c.hidden) return null;
  const opacity = getOpacity(c.styleJson);

  const outline =
    isActive && !c.locked ? (
      <Rect
        x={0}
        y={0}
        width={c.width}
        height={c.height}
        stroke="rgba(16,185,129,0.95)"
        strokeWidth={6}
        cornerRadius={24}
        listening={false}
      />
    ) : null;

  const common: Partial<GroupConfig> & {
    onClick: () => void;
    onTap: () => void;
    onMouseDown: () => void;
    onTouchStart: () => void;
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  } = {
    id: `node-${c.id}`,
    x: c.x,
    y: c.y,
    rotation: c.rotation ?? 0,
    opacity,
    draggable: !c.locked,

    onMouseDown: onSelect,
    onTouchStart: onSelect,
    onClick: onSelect,
    onTap: onSelect,

    onDragEnd: (e) => {
      const node = e.target;
      onCommit({ x: node.x(), y: node.y() });
    },
  };

  if (isText(c)) {
    return (
      <TextNode
        c={c}
        common={common}
        outline={outline}
        onAutoSize={(size) => onCommit(size)}
      />
    );
  }

  // PHOTO / STICKER
  return (
    <ImageNode
      c={c}
      common={common}
      outline={outline}
      onAssetReady={bumpRenderKey}
    />
  );
}
