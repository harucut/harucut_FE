"use client";

import { Rect } from "@/lib/reactKonva";
import type Konva from "konva";
import type { GroupConfig } from "konva/lib/Group";

import type { EditorComponent, TextComponent } from "@/lib/types/themeEditor";
import { getOpacity } from "./utils";
import { ImageNode } from "./nodes/ImageNode";
import { TextNode } from "./nodes/TextNode";

type Props = {
  c: EditorComponent;
  bounds: { width: number; height: number };
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
  bounds,
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
        // 화면 픽셀 고정(strokeScaleEnabled=false). 논리 6px 은 폰에서 0.45px 로 사라졌다.
        // 색은 브랜드 초록 하나 — 선택 상태·핸들·누끼 표시가 같은 색을 쓴다.
        stroke="#1ED760"
        strokeWidth={2}
        strokeScaleEnabled={false}
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
    // Konva는 절대 좌표를 넘긴다. 부모의 배율을 역변환해 중심을 프레임 안에 둔다.
    // 가장자리 장식은 반쯤 걸칠 수 있지만, 다시 잡을 부분은 남는다.
    dragBoundFunc: function (position) {
      const transform = this.getParent()?.getAbsoluteTransform();
      if (!transform) return position;
      const local = transform.copy().invert().point(position);
      return transform.point({
        x: Math.max(0, Math.min(bounds.width, local.x)),
        y: Math.max(0, Math.min(bounds.height, local.y)),
      });
    },

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
