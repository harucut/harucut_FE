"use client";

import { Group, Image as KonvaImage, Rect } from "react-konva";
import useImage from "use-image";
import type { GroupConfig } from "konva/lib/Group";
import type Konva from "konva";
import type { EditorComponent } from "@/lib/types/themeEditor";
import { useEffect } from "react";

type Props = {
  c: EditorComponent;
  common: Partial<GroupConfig> & {
    onClick: () => void;
    onTap: () => void;
    onMouseDown: () => void;
    onTouchStart: () => void;
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  };
  outline: React.ReactNode;
  onAssetReady?: () => void;
};

export function ImageNode({ c, common, outline, onAssetReady }: Props) {
  // 원본 이미지를 비동기로 로드
  const [img, status] = useImage(c.source, "anonymous");

  // 로드 완료 시 Transformer 갱신 트리거
  useEffect(() => {
    if (status === "loaded") onAssetReady?.();
  }, [status, onAssetReady]);

  return (
    <Group {...common}>
      {outline}
      <KonvaImage image={img ?? undefined} width={c.width} height={c.height} />
      {!img && (
        <Rect
          width={c.width}
          height={c.height}
          fill="rgba(255,255,255,0.06)"
          listening={false}
        />
      )}
    </Group>
  );
}
