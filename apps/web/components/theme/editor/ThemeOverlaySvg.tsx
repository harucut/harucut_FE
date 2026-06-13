"use client";

import { useId } from "react";
import type { ThemeExportJson } from "@/lib/types/themeEditor";
import type { FrameLayout } from "@/constants/frameLayouts";

type ThemeOverlaySvgProps = {
  layout: FrameLayout;
  data: ThemeExportJson | null;
  className?: string;
  viewBox?: { x: number; y: number; width: number; height: number };
};

function getOpacity(styleJson?: Record<string, unknown>) {
  const v = styleJson?.opacity;
  if (typeof v !== "number" || Number.isNaN(v)) return 1;
  return Math.min(1, Math.max(0, v));
}

function getTextAnchor(align?: unknown): "start" | "middle" | "end" {
  if (align === "center") return "middle";
  if (align === "right") return "end";
  return "start";
}

export function ThemeOverlaySvg({
  layout,
  data,
  className = "",
  viewBox,
}: ThemeOverlaySvgProps) {
  const clipId = useId().replace(/:/g, "");
  if (!data || data.frameId == null) return null;
  const vb = viewBox ?? {
    x: 0,
    y: 0,
    width: layout.totalWidth,
    height: layout.totalHeight,
  };

  return (
    <svg
      viewBox={`0 0 ${vb.width} ${vb.height}`}
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      className={className}
      style={{ overflow: "hidden" }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={vb.width} height={vb.height} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {data.components.map((c) => {
          const localX = c.x - vb.x;
          const localY = c.y - vb.y;
          const cx = localX + c.width / 2;
          const cy = localY + c.height / 2;
          const scale = c.scale ?? 1;
          const rotation = c.rotation ?? 0;
          const opacity = getOpacity(c.styleJson);
          const transform = `translate(${cx} ${cy}) rotate(${rotation}) scale(${scale}) translate(${-c.width / 2} ${-c.height / 2})`;

          if (c.type === "TEXT") {
            const style = c.styleJson ?? {};
            const fontFamily =
              typeof style.fontFamily === "string"
                ? style.fontFamily
                : "Pretendard";
            const fontSize =
              typeof style.fontSize === "number" ? style.fontSize : 128;
            const fill = typeof style.color === "string" ? style.color : "#ffffff";
            const textAnchor = getTextAnchor(style.textAlign);
            const lines = c.source.split("\n");
            const lineHeight = Math.max(1, Math.round(fontSize * 1.15));
            const x =
              textAnchor === "middle"
                ? c.width / 2
                : textAnchor === "end"
                  ? c.width
                  : 0;

            return (
              <g key={c.id} transform={transform} opacity={opacity}>
                <text
                  x={x}
                  y={0}
                  fill={fill}
                  fontFamily={fontFamily}
                  fontSize={fontSize}
                  textAnchor={textAnchor}
                  dominantBaseline="text-before-edge"
                >
                  {lines.map((line, i) => (
                    <tspan key={`${c.id}-${i}`} x={x} dy={i === 0 ? 0 : lineHeight}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          }

          return (
            <g key={c.id} transform={transform} opacity={opacity}>
              <image
                href={c.source}
                x={0}
                y={0}
                width={c.width}
                height={c.height}
                preserveAspectRatio="none"
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
