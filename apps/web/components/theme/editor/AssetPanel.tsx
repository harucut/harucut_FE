"use client";

import Image from "next/image";

import React, { useRef, useState } from "react";
import { ImagePlus, Scissors, X } from "lucide-react";
import { useThemeEditorStore } from "@/lib/themeEditorStore";
import {
  SUPPORTED_IMAGE_ACCEPT,
  UNSUPPORTED_UPLOAD_MESSAGE,
  isSupportedUploadFile,
} from "@/lib/presignedUploadApi";

export function AssetPanel() {
  const tab = useThemeEditorStore((state) => state.tab);
  const setTab = useThemeEditorStore((state) => state.setTab);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">소재</p>
        <div className="flex gap-2">
          <TabButton active={tab === "PHOTO"} onClick={() => setTab("PHOTO")}>
            사진
          </TabButton>
          <TabButton active={tab === "STICKER"} onClick={() => setTab("STICKER")}>
            스티커
          </TabButton>
          <TabButton active={tab === "TEXT"} onClick={() => setTab("TEXT")}>
            텍스트
          </TabButton>
        </div>
      </div>

      {tab === "PHOTO" ? <PhotoTab /> : null}
      {tab === "STICKER" ? <StickerTab /> : null}
      {tab === "TEXT" ? <TextTab /> : null}
    </section>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-xs",
        active
          ? "border-[color:var(--hc-primary)] bg-[color:var(--hc-accent-soft-bg)] text-[color:var(--hc-primary-strong)]"
          : "border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] text-[color:var(--hc-muted)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function PhotoTab() {
  const photos = useThemeEditorStore((state) => state.assets.photos);
  const addAssets = useThemeEditorStore((state) => state.addPhotoAssets);
  const addComponent = useThemeEditorStore((state) => state.addComponentFromAsset);
  const removePhotoAsset = useThemeEditorStore((state) => state.removePhotoAsset);
  const removePhotoBackground = useThemeEditorStore(
    (state) => state.removePhotoBackground,
  );

  const [isDraggingTiles, setIsDraggingTiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [processingAssetId, setProcessingAssetId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] leading-5 text-zinc-400">
          업로드한 사진은 여러 번 사용할 수 있고, 필요한 사진은 누끼를 딴 버전으로
          바로 바꿔 쓸 수 있어요. 첫 실행은 모델 다운로드 때문에 조금 오래 걸릴 수
          있어요.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={SUPPORTED_IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={async (event) => {
          if (!event.target.files) return;

          // 지원하지 않는 형식은 올리기 전에 걸러 사유를 먼저 알려준다.
          const picked = Array.from(event.target.files);
          const supported = picked.filter(isSupportedUploadFile);
          const skipped = picked.length - supported.length;

          if (skipped > 0) {
            alert(`${skipped}개는 지원하지 않는 형식이라 제외했어요. ${UNSUPPORTED_UPLOAD_MESSAGE}`);
          }

          if (supported.length === 0) {
            event.currentTarget.value = "";
            return;
          }

          setIsUploading(true);
          const result = await addAssets(supported);
          if (result.failed > 0) {
            alert(`${result.failed}개의 파일 업로드에 실패했어요.`);
          }
          setIsUploading(false);
          event.currentTarget.value = "";
        }}
      />

      {photos.length === 0 ? (
        <div className="rounded-xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] p-3 text-[11px] text-[color:var(--hc-muted)]">
          아직 업로드한 사진이 없어요. 아래 추가 버튼으로 사진을 넣어보세요.
        </div>
      ) : null}

      <div
        className="
          flex gap-2 overflow-x-auto pb-2
          snap-x snap-mandatory
          [-webkit-overflow-scrolling:touch]
          [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
        "
      >
        <HorizontalScroller onDragStateChange={setIsDraggingTiles}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            className="
              group relative
              aspect-square w-[96px] shrink-0
              snap-start overflow-hidden rounded-xl
              border border-dashed border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)]
              hover:border-[color:var(--hc-primary)] hover:bg-[color:var(--hc-accent-soft-bg)] disabled:opacity-50
            "
            title="사진 업로드"
          >
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[color:var(--hc-muted)] group-hover:text-[color:var(--hc-primary-strong)]">
              <ImagePlus size={18} />
              <span className="text-[10px]">
                {isUploading ? "업로드 중" : "추가"}
              </span>
            </div>
          </button>

          {photos.map((photo) => {
            const isProcessing = processingAssetId === photo.id;

            return (
              <div
                key={photo.id}
                className="relative aspect-square w-[96px] shrink-0 snap-start overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isDraggingTiles || isProcessing) return;
                    addComponent("PHOTO", photo.src);
                  }}
                  className="h-full w-full"
                  title={photo.name ?? "photo"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.src}
                    alt={photo.name ?? "photo"}
                    className={`h-full w-full object-cover transition ${
                      isProcessing ? "opacity-60" : "hover:opacity-85"
                    }`}
                    draggable={false}
                  />
                </button>

                {isProcessing ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[rgba(6,20,10,0.5)] px-2 text-center text-[10px] font-medium text-white">
                    누끼를 정리하는 중이에요.
                  </div>
                ) : null}

                <div className="absolute inset-x-1 bottom-1 flex gap-1">
                  <button
                    type="button"
                    onClick={async (event) => {
                      event.stopPropagation();
                      setProcessingAssetId(photo.id);
                      const result = await removePhotoBackground(photo.id);
                      setProcessingAssetId(null);

                      if (!result.ok && result.reason === "PROCESS_FAILED") {
                        alert("누끼 제거에 실패했어요.");
                      }
                    }}
                    disabled={isProcessing}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[rgba(255,255,255,0.24)] bg-[rgba(6,20,10,0.72)] px-2 py-1 text-[10px] font-medium text-white backdrop-blur hover:bg-[rgba(6,20,10,0.82)] disabled:opacity-50"
                    title="누끼 제거"
                  >
                    <Scissors className="h-3 w-3" />
                    <span>{isProcessing ? "처리 중" : "누끼"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      const result = removePhotoAsset(photo.id);
                      if (!result.ok && result.reason === "IN_USE") {
                        alert("프레임에 사용 중인 사진은 삭제할 수 없어요.");
                      }
                    }}
                    className="flex items-center justify-center rounded-lg border border-[rgba(255,255,255,0.24)] bg-[rgba(6,20,10,0.72)] p-1.5 text-white backdrop-blur hover:bg-[rgba(6,20,10,0.82)]"
                    title="사진 삭제"
                    aria-label="사진 삭제"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </HorizontalScroller>
      </div>
    </div>
  );
}

function StickerTab() {
  const [isDraggingTiles, setIsDraggingTiles] = useState(false);
  const stickers = useThemeEditorStore((state) => state.assets.stickers);
  const addComponent = useThemeEditorStore((state) => state.addComponentFromAsset);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="
          flex gap-2 overflow-x-auto pb-2
          snap-x snap-mandatory
          [-webkit-overflow-scrolling:touch]
          [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
        "
      >
        <HorizontalScroller onDragStateChange={setIsDraggingTiles}>
          {stickers.map((sticker) => (
            <button
              key={sticker.id}
              type="button"
              onClick={() => {
                if (isDraggingTiles) return;
                addComponent("STICKER", sticker.src);
              }}
              className="
                group relative aspect-square w-[72px] shrink-0
                snap-start overflow-hidden rounded-xl
                border border-zinc-800 bg-zinc-950
              "
              title={sticker.name ?? "sticker"}
            >
              {/*
                72px 타일에 원본 PNG(최대 2MB, 39장 합계 40MB)를 그대로 내려받고 있었다.
                next/image 로 바꾸면 같은 파일이 3KB대로 줄고 화면 밖 타일은 늦게 받는다.
                캔버스에 얹을 때는 원본(sticker.src)을 그대로 쓴다.
              */}
              <Image
                src={sticker.src}
                alt={sticker.name ?? "스티커"}
                width={72}
                height={72}
                sizes="72px"
                className="h-full w-full object-contain p-2"
                draggable={false}
              />
            </button>
          ))}
        </HorizontalScroller>
      </div>
    </div>
  );
}

function TextTab() {
  const addText = useThemeEditorStore((state) => state.addText);
  const [text, setText] = useState("하루컷");
  const [fontSize, setFontSize] = useState(256);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
        <span>텍스트 내용</span>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="텍스트를 입력해 주세요"
          className="w-full rounded-lg border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] px-3 py-2 text-xs text-[color:var(--hc-text)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
        <span>폰트 크기</span>
        <input
          type="number"
          min={12}
          max={420}
          value={fontSize}
          onChange={(event) => setFontSize(Number(event.target.value) || 0)}
          className="w-full rounded-lg border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] px-3 py-2 text-xs text-[color:var(--hc-text)]"
        />
      </label>

      <button
        type="button"
        onClick={() => addText({ text, fontSize })}
        className="hc-button-primary rounded-xl px-4 py-2 text-xs font-semibold"
      >
        텍스트 추가
      </button>

      <div className="text-[11px] text-zinc-400">
        추가한 뒤 속성 패널에서 글꼴, 크기, 정렬을 바꿀 수 있어요.
      </div>
    </div>
  );
}

export function HorizontalScroller({
  children,
  onDragStateChange,
}: {
  children: React.ReactNode;
  onDragStateChange?: (isDraggingOrJustDragged: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startScrollLeft = useRef(0);
  const didDrag = useRef(false);

  const DRAG_THRESHOLD = 6;

  const endDrag = () => {
    const element = ref.current;
    if (element) {
      element.classList.add("snap-x", "snap-mandatory");
      element.classList.remove("cursor-grabbing");
    }
    isDragging.current = false;

    if (didDrag.current) {
      onDragStateChange?.(true);
      window.setTimeout(() => {
        onDragStateChange?.(false);
        didDrag.current = false;
      }, 0);
    } else {
      onDragStateChange?.(false);
    }
  };

  return (
    <div
      ref={ref}
      onMouseDown={(event) => {
        const element = ref.current;
        if (!element) return;

        isDragging.current = true;
        didDrag.current = false;
        startX.current = event.clientX;
        startScrollLeft.current = element.scrollLeft;

        element.classList.remove("snap-x", "snap-mandatory");
        element.classList.add("cursor-grabbing");
      }}
      onMouseMove={(event) => {
        if (!isDragging.current) return;
        const element = ref.current;
        if (!element) return;

        const delta = event.clientX - startX.current;
        if (Math.abs(delta) > DRAG_THRESHOLD) {
          didDrag.current = true;
          onDragStateChange?.(true);
        }

        event.preventDefault();
        element.scrollLeft = startScrollLeft.current - delta;
      }}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onDragStart={(event) => event.preventDefault()}
      className="
        flex gap-2 overflow-x-auto pb-2
        cursor-grab select-none
        snap-x snap-mandatory
        [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
      "
    >
      {children}
    </div>
  );
}
