"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useShootSession } from "@/lib/shootSessionStore";
import { FRAME_CONFIGS, type FrameId } from "@/constants/frames";
import { FramePreview, type FrameMedia } from "@/components/frame/FramePreview";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";

const BORDER_COLORS = [
  { id: "black", label: "블랙", value: "#000000" },
  { id: "white", label: "화이트", value: "#ffffff" },
  { id: "zinc", label: "다크 그레이", value: "#18181b" },
  { id: "pink", label: "핑크", value: "#f973b6" },
  { id: "blue", label: "블루", value: "#38bdf8" },
] as const;
const MAX_SECONDS = 8;
export default function ResultPage() {
  const router = useRouter();
  const { frameId, shots, selectedIndexes } = useShootSession();

  const [borderColor, setBorderColor] = useState<string>("#18181b");
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetDuration = MAX_SECONDS;

  // 선택 개수
  const selectedCount = useMemo(
    () => selectedIndexes.filter((i) => i != null).length,
    [selectedIndexes]
  );

  useEffect(() => {
    if (!frameId) {
      router.replace("/shoot");
      return;
    }
    if (!shots.length) {
      router.replace("/shoot/capture");
      return;
    }
    if (selectedCount !== 4) {
      router.replace("/shoot/select");
      return;
    }
  }, [frameId, shots.length, selectedCount, router]);

  // 슬롯에 들어갈 media (선택 순서 그대로)
  const slotMedia: (FrameMedia | null)[] = useMemo(
    () =>
      selectedIndexes.map((idx) => {
        if (idx == null) return null;
        const shot = shots[idx];
        if (!shot) return null;

        if (shot.video) {
          return { type: "video", src: shot.video };
        }
        return { type: "image", src: shot.photo };
      }),
    [selectedIndexes, shots]
  );

  // PNG 합성을 위한 "사진만" 배열 (선택 순서 그대로)
  const selectedPhotosForFrame: string[] = useMemo(
    () =>
      selectedIndexes
        .map((idx) => (idx == null ? null : shots[idx]?.photo ?? null))
        .filter((p): p is string => Boolean(p))
        .slice(0, 4),
    [selectedIndexes, shots]
  );

  // 영상 합성용: 선택된 4칸 모두에 video가 있는지
  const hasAllVideos = useMemo(
    () =>
      selectedIndexes.every((idx) => {
        if (idx == null) return false;
        return Boolean(shots[idx]?.video);
      }),
    [selectedIndexes, shots]
  );

  if (!frameId) return null;

  const frameConfig = FRAME_CONFIGS.find((f) => f.id === frameId);
  const layout = FRAME_LAYOUTS[frameId as FrameId];
  if (!layout) return null;

  // PNG 다운로드
  const handleDownloadPng = async () => {
    if (selectedPhotosForFrame.length !== 4) return;
    if (!canvasRef.current) return;

    setIsDownloadingImage(true);
    try {
      const images = await Promise.all(
        selectedPhotosForFrame.map(
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
      setIsDownloadingImage(false);
    }
  };

  // 프레임 안에 4개 영상이 동시에 들어간 하나의 영상 만들기
  const handleDownloadVideo = async () => {
    if (!hasAllVideos) {
      alert("선택된 4개의 샷에 모두 영상이 있어야 합니다.");
      return;
    }
    if (!canvasRef.current) return;

    setIsDownloadingVideo(true);
    try {
      const { totalWidth, totalHeight, slots } = layout;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = totalWidth;
      canvas.height = totalHeight;

      // 선택된 4개의 샷 가져오기
      const shotItems = selectedIndexes.map((idx) =>
        idx == null ? null : shots[idx] ?? null
      );

      // 각 슬롯용 <video> 준비 (blob URL 사용)
      const videos = await Promise.all(
        shotItems.map(
          (shot, i) =>
            new Promise<HTMLVideoElement>((resolve, reject) => {
              if (!shot?.video) {
                return reject(
                  new Error(`slot ${i} has no video, but hasAllVideos=true?`)
                );
              }
              const v = document.createElement("video");
              v.src = shot.video;
              v.loop = true;
              v.muted = true;
              v.playsInline = true;
              v.crossOrigin = "anonymous";

              const onLoaded = () => {
                v.removeEventListener("loadedmetadata", onLoaded);
                resolve(v);
              };
              const onError = () => {
                v.removeEventListener("error", onError);
                reject(
                  new Error(
                    `video load error (slot ${i}): ${
                      v.error?.message ?? "unknown error"
                    }`
                  )
                );
              };

              v.addEventListener("loadedmetadata", onLoaded);
              v.addEventListener("error", onError);
            })
        )
      );

      // 재생 길이(초) 결정
      const duration = targetDuration;

      // 모두 처음부터 시작
      videos.forEach((v) => {
        v.currentTime = 0;
        v.loop = true;
      });

      // canvas 스트림 캡처해서 MediaRecorder로 녹화
      const fps = 30;
      const stream = canvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
      });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const frameName = frameConfig?.name ?? "recorday";

      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: "video/webm" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${frameName.replace(/\s+/g, "_")}-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          resolve();
        };
      });

      recorder.start();

      // 비디오들 재생 시작
      await Promise.all(
        videos.map((v) =>
          v
            .play()
            .catch((err) =>
              console.warn(
                "video play error (user gesture 필요할 수 있음):",
                err
              )
            )
        )
      );

      const start = performance.now();

      const renderFrame = () => {
        const elapsed = (performance.now() - start) / 1000;
        if (elapsed >= duration) {
          recorder.stop();
          videos.forEach((v) => v.pause());
          return;
        }

        // 배경(테두리 색) 칠하기
        ctx.fillStyle = borderColor;
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        // 각 슬롯에 해당 비디오 프레임 그리기
        slots.forEach((slot, index) => {
          const v = videos[index];
          if (!v || v.readyState < 2) return;

          const { x, y, width, height } = slot;
          const vw = v.videoWidth || 1;
          const vh = v.videoHeight || 1;
          const scale = Math.max(width / vw, height / vh);
          const sw = vw * scale;
          const sh = vh * scale;
          const dx = x + (width - sw) / 2;
          const dy = y + (height - sh) / 2;

          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, width, height);
          ctx.clip();
          ctx.drawImage(v, dx, dy, sw, sh);
          ctx.restore();
        });

        requestAnimationFrame(renderFrame);
      };

      renderFrame();

      // duration 지난 뒤 자동 stop → onstop에서 다운로드
      await stopped;
    } catch (e) {
      console.error(e);
      alert("영상 합성 중 오류가 발생했어요. 다시 시도해 주세요.");
    } finally {
      setIsDownloadingVideo(false);
    }
  };

  const handleGoHome = () => {
    router.push("/home");
  };

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        {/* 헤더 */}
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

        {/* 미리보기 */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium text-zinc-300">
            사진 + 영상 미리보기
          </h2>

          <div className="flex h-[330px] justify-center">
            <FramePreview
              variant={frameId as FrameId}
              media={slotMedia}
              className="bg-transparent border-none p-0"
              borderColor={borderColor}
            />
          </div>

          <div className="flex h-[330px] justify-center">
            <FramePreview
              variant={frameId as FrameId}
              images={selectedPhotosForFrame}
              className="bg-transparent border-none p-0"
              borderColor={borderColor}
            />
          </div>

          <p className="text-[10px] text-zinc-500 text-center">
            위 프레임 구성으로 PNG / 영상이 생성돼요. 테두리 색은 둘 다에
            반영됩니다.
          </p>
        </section>

        {/* 테두리 색 선택 */}
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

        <section className="mt-4 flex flex-wrap justify-end gap-2">
          {/* 사진다운로드 */}
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={isDownloadingImage || selectedCount !== 4}
            className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isDownloadingImage ? "이미지 생성 중..." : "사진 다운로드 (PNG)"}
          </button>

          {/* 동영상 다운로드 */}
          <button
            type="button"
            onClick={handleDownloadVideo}
            disabled={isDownloadingVideo || !hasAllVideos}
            className="rounded-full bg-zinc-700 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isDownloadingVideo ? "영상 생성 중..." : "동영상 다운로드"}
          </button>

          {/* 홈으로 돌아가기 */}
          <button
            type="button"
            onClick={handleGoHome}
            className="rounded-full bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            홈으로 돌아가기
          </button>
        </section>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </main>
  );
}
