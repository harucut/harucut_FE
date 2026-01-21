"use client";

import { Group, Text as KonvaText } from "react-konva";
import { useLayoutEffect, useRef } from "react";
import type Konva from "konva";
import type { GroupConfig } from "konva/lib/Group";
import type { TextComponent } from "@/lib/types/themeEditor";
import { getOpacity } from "../utils";

type Props = {
  c: TextComponent;
  common: Partial<GroupConfig> & {
    onClick: () => void;
    onTap: () => void;
    onMouseDown: () => void;
    onTouchStart: () => void;
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  };
  outline: React.ReactNode;

  onAutoSize?: (size: { width: number; height: number }) => void;
};

export function TextNode({ c, common, outline, onAutoSize }: Props) {
  const style = c.styleJson;
  const opacity = getOpacity(style);
  const textRef = useRef<Konva.Text | null>(null);

  useLayoutEffect(() => {
    const node = textRef.current;
    if (!node) return;

    const rect = node.getClientRect({ skipTransform: true });

    const nextW = Math.ceil(rect.width);
    const nextH = Math.ceil(rect.height);

    if (Math.abs(nextW - c.width) > 1 || Math.abs(nextH - c.height) > 1) {
      onAutoSize?.({ width: nextW, height: nextH });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.source, style.fontFamily, style.fontSize, style.textAlign]);

  return (
    <Group {...common} opacity={opacity}>
      {outline}
      <KonvaText
        ref={textRef}
        text={c.source}
        fontFamily={style.fontFamily ?? "Pretendard"}
        fontSize={style.fontSize ?? 240}
        fill={style.color ?? "#ffffff"}
        align={style.textAlign ?? "left"}
      />
    </Group>
  );
}
