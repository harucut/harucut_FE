"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useShootSession } from "@/lib/shootSessionStore";
import { FRAME_CONFIGS, type FrameId } from "@/constants/frames";
import { FramePreview, FRAME_LAYOUTS } from "@/components/frame/FramePreview";

const BORDER_COLORS = [
  { id: "black", label: "블랙", value: "#000000" },
  { id: "white", label: "화이트", value: "#ffffff" },
  { id: "zinc", label: "다크 그레이", value: "#18181b" },
  { id: "pink", label: "핑크", value: "#f973b6" },
  { id: "blue", label: "블루", value: "#38bdf8" },
] as const;

export default function ResultPage() {
  const router = useRouter();
  const { frameId, shots, selectedIndexes } = useShootSession();

  const [borderColor, setBorderColor] = useState<string>("#18181b");
  const [isDownloading, setIsDownloading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!frameId) {
      router.replace("/shoot");
      return;
    }
    if (!shots.length) {
      router.replace("/shoot/capture");
      return;
    }
    if (selectedIndexes.length !== 4) {
      router.replace("/shoot/select");
      return;
    }
  }, [frameId, shots.length, selectedIndexes.length, router]);

  const frameConfig = FRAME_CONFIGS.find((f) => f.id === frameId);

  const selectedImagesForFrame = useMemo(() => {
    if (!selectedIndexes.length) return [];
    return selectedIndexes
      .map((idx) => shots[idx])
      .filter((src): src is string => Boolean(src))
      .slice(0, 4);
  }, [selectedIndexes, shots]);

  if (!frameId) {
    return null;
  }

  const layout = FRAME_LAYOUTS[frameId as FrameId];
  if (!layout) {
    return null;
  }

  const handleDownload = async () => {
    if (selectedImagesForFrame.length !== 4) return;
    if (!canvasRef.current) return;

    setIsDownloading(true);
    try {
      const images = await Promise.all(
        selectedImagesForFrame.map(
          (src) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = src;
            })
        )
      );

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { totalWidth, totalHeight, slots } = layout;

      canvas.width = totalWidth;
      canvas.height = totalHeight;

      ctx.fillStyle = borderColor;
      ctx.fillRect(0, 0, totalWidth, totalHeight);

      slots.forEach((slot, index) => {
        const img = images[index];
        if (!img) return;

        const { x, y, width, height } = slot;

        const iw = img.width;
        const ih = img.height;
        const scale = Math.max(width / iw, height / ih);
        const sw = iw * scale;
        const sh = ih * scale;
        const dx = x + (width - sw) / 2;
        const dy = y + (height - sh) / 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.clip();
        ctx.drawImage(img, dx, dy, sw, sh);
        ctx.restore();
      });

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      const frameName = frameConfig?.name ?? "recorday";
      link.download = `${frameName.replace(/\s+/g, "_")}-${Date.now()}.png`;
      link.click();
    } catch (e) {
      console.error(e);
      alert("이미지 생성 중 오류가 발생했어요. 다시 시도해 주세요.");
    } finally {
      setIsDownloading(false);
      router.replace("/");
    }
  };

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <header className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] tracking-[0.16em] text-zinc-500">
              RECORDAY
            </span>
            <h1 className="text-lg font-semibold tracking-tight">
              최종 결과 · 다운로드
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/shoot/select"
              className="text-[11px] text-zinc-400 underline underline-offset-4"
            >
              사진 다시 선택
            </Link>
          </div>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium text-zinc-300">
            완성된 인생네컷 미리보기
          </h2>

          <div className="flex justify-center h-[330px]">
            <FramePreview
              variant={frameId as FrameId}
              images={selectedImagesForFrame}
              className=" bg-transparent border-none p-0"
              borderColor={borderColor}
            />
          </div>

          {frameConfig && (
            <p className="text-[10px] text-zinc-500 text-center">
              테두리 색을 바꿔보고 마음에 드는 조합을 골라보세요.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-zinc-300">테두리 색 선택</h3>
          <div className="flex flex-wrap gap-2">
            {BORDER_COLORS.map((c) => {
              const isActive = borderColor === c.value;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setBorderColor(c.value)}
                  className={[
                    "flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px]",
                    isActive
                      ? "border-emerald-400 bg-zinc-900"
                      : "border-zinc-700 bg-zinc-900/60 hover:border-zinc-500",
                  ].join(" ")}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-zinc-800"
                    style={{ backgroundColor: c.value }}
                  />
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading || selectedIndexes.length !== 4}
            className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isDownloading
              ? "이미지 생성 중..."
              : "PNG로 다운로드 후 메인 화면으로 돌아가기"}
          </button>
        </section>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </main>
  );
}
