"use client";

import { Rect } from "react-konva";
import type Konva from "konva";
import type { GroupConfig } from "konva/lib/Group";

import type { EditorComponent, TextComponent } from "@/lib/types/themeEditor";
import { getOpacity } from "./utils";
import { ImageNode } from "./nodes/ImageNode";
import { TextNode } from "./nodes/TextNode";

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
  // 이미지(스티커/사진) 로드 완료 시 캔버스 리렌더를 유도하는 콜백.
  // 어떤 스토어든 쓸 수 있도록 store 의존 대신 prop으로 주입한다.
  onAssetReady: () => void;
};

function isText(c: EditorComponent): c is TextComponent {
  return c.type === "TEXT";
}

export function EditableNode({
  c,
  isActive,
  onSelect,
  onCommit,
  onAssetReady,
}: Props) {
  if (c.hidden) return null;
  const opacity = getOpacity(c.styleJson);

  // 선택된 요소에만 테두리 표시
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

  const offsetX = c.width / 2;
  const offsetY = c.height / 2;

  // 드래그/선택 등 공통 Konva 그룹 설정
  const common: Partial<GroupConfig> & {
    onClick: () => void;
    onTap: () => void;
    onMouseDown: () => void;
    onTouchStart: () => void;
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  } = {
    id: `node-${c.id}`,
    x: c.x + offsetX,
    y: c.y + offsetY,
    offsetX,
    offsetY,
    rotation: c.rotation ?? 0,
    opacity,
    draggable: !c.locked,

    onMouseDown: onSelect,
    onTouchStart: onSelect,
    onClick: onSelect,
    onTap: onSelect,

    onDragEnd: (e) => {
      const node = e.target;
      onCommit({ x: node.x() - offsetX, y: node.y() - offsetY });
    },
  };

  // TEXT는 자동 크기 측정 로직 포함
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
      onAssetReady={onAssetReady}
    />
  );
}
