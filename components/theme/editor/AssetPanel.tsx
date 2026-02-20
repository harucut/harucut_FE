"use client";

import { useThemeEditorStore } from "@/lib/themeEditorStore";
import React, { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

export function AssetPanel() {
  const tab = useThemeEditorStore((s) => s.tab);
  const setTab = useThemeEditorStore((s) => s.setTab);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">소스</p>
        <div className="flex gap-2">
          <TabButton active={tab === "PHOTO"} onClick={() => setTab("PHOTO")}>
            사진
          </TabButton>
          <TabButton
            active={tab === "STICKER"}
            onClick={() => setTab("STICKER")}
          >
            스티커
          </TabButton>
          <TabButton active={tab === "TEXT"} onClick={() => setTab("TEXT")}>
            텍스트
          </TabButton>
        </div>
      </div>

      {tab === "PHOTO" && <PhotoTab />}
      {tab === "STICKER" && <StickerTab />}
      {tab === "TEXT" && <TextTab />}
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
        "rounded-full px-3 py-1 text-xs border",
        active
          ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
          : "border-zinc-700 bg-zinc-950 text-zinc-300",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function PhotoTab() {
  const photos = useThemeEditorStore((s) => s.assets.photos);
  const addAssets = useThemeEditorStore((s) => s.addPhotoAssets);
  const addComponent = useThemeEditorStore((s) => s.addComponentFromAsset);
  const removePhotoAsset = useThemeEditorStore((s) => s.removePhotoAsset);

  const [blockClick, setBlockClick] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-zinc-400">
          업로드한 사진은 여러 번 사용가능합니다.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          if (!e.target.files) return;
          setIsUploading(true);
          const result = await addAssets(e.target.files);
          if (result.failed > 0) {
            alert(`${result.failed}개 파일 업로드에 실패했습니다.`);
          }
          setIsUploading(false);
          e.currentTarget.value = "";
        }}
      />

      {photos.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-400">
          아직 업로드한 사진이 없습니다. 아래 + 버튼으로 추가해보세요.
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
        <HorizontalScroller onDragStateChange={setBlockClick}>
          {/* 업로드 카드 */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            className="
              group relative
              aspect-square w-[72px] shrink-0
              snap-start
              overflow-hidden rounded-xl
              border border-dashed border-zinc-700 bg-zinc-950
              hover:border-emerald-500/60 hover:bg-emerald-500/5 disabled:opacity-50
            "
            title="사진 업로드"
          >
            <div className="h-full w-full flex flex-col items-center justify-center gap-1 text-zinc-400 group-hover:text-emerald-200">
              <ImagePlus size={18} />
              <span className="text-[10px]">
                {isUploading ? "업로드중" : "업로드"}
              </span>
            </div>
          </button>

          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                if (blockClick) return;
                addComponent("PHOTO", p.src);
              }}
              className="
                group relative
                aspect-square w-[72px] shrink-0
                snap-start
                overflow-hidden rounded-xl
                border border-zinc-800 bg-zinc-950
              "
              title={p.name ?? "photo"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.src}
                alt={p.name ?? "photo"}
                className="h-full w-full object-cover group-hover:opacity-85"
                draggable={false}
              />

              {/* 삭제 버튼 */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const result = removePhotoAsset(p.id);
                  if (!result.ok && result.reason === "IN_USE") {
                    alert("프레임에서 사용 중인 사진은 삭제할 수 없어요.");
                  }
                }}
                className="
                  absolute top-1 right-1 z-10
                  rounded-md border border-white/10 bg-black/60
                  p-1 text-white
                  opacity-0 group-hover:opacity-100
                "
                title="사진 삭제"
                aria-label="사진 삭제"
              >
                <X size={12} />
              </button>
            </button>
          ))}
        </HorizontalScroller>
      </div>
    </div>
  );
}

function StickerTab() {
  const [blockClick, setBlockClick] = React.useState(false);
  const stickers = useThemeEditorStore((s) => s.assets.stickers);
  const addComponent = useThemeEditorStore((s) => s.addComponentFromAsset);
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
        <HorizontalScroller onDragStateChange={setBlockClick}>
          {stickers.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (blockClick) return;
                addComponent("STICKER", s.src);
              }}
              className="
              group relative
              aspect-square w-[72px] shrink-0
              snap-start
              overflow-hidden rounded-xl
              border border-zinc-800 bg-zinc-950
            "
              title={s.name ?? "sticker"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.src}
                alt={s.name ?? "sticker"}
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
  const addText = useThemeEditorStore((s) => s.addText);
  const [text, setText] = useState("HaruCut");
  const [fontSize, setFontSize] = useState(256);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
        <span>텍스트 내용</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="텍스트를 입력하세요"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
        />
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
        <span>폰트 크기</span>
        <input
          type="number"
          min={12}
          max={420}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value) || 0)}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
        />
      </label>

      <button
        type="button"
        onClick={() => addText({ text, fontSize })}
        className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
      >
        텍스트 추가
      </button>
      <div className="text-[11px] text-zinc-400">
        추가 후 속성에서 글자/폰트/색/정렬 바꿀 수 있습니다.
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

  const DRAG_THRESHOLD = 6; // 이 이상 움직이면 드래그로 판정

  const endDrag = () => {
    const el = ref.current;
    if (el) {
      el.classList.add("snap-x", "snap-mandatory");
      el.classList.remove("cursor-grabbing");
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
      onMouseDown={(e) => {
        const el = ref.current;
        if (!el) return;

        isDragging.current = true;
        didDrag.current = false;

        startX.current = e.clientX;
        startScrollLeft.current = el.scrollLeft;

        // 드래그 중에는 snap 끄기
        el.classList.remove("snap-x", "snap-mandatory");
        el.classList.add("cursor-grabbing");
      }}
      onMouseMove={(e) => {
        if (!isDragging.current) return;
        const el = ref.current;
        if (!el) return;

        const delta = e.clientX - startX.current;

        // 일정 이상 움직였으면 드래그로 확정
        if (Math.abs(delta) > DRAG_THRESHOLD) {
          didDrag.current = true;
          onDragStateChange?.(true);
        }

        e.preventDefault();
        el.scrollLeft = startScrollLeft.current - delta;
      }}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      // 브라우저 이미지 drag 방지
      onDragStart={(e) => e.preventDefault()}
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
