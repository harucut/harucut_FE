"use client";
import { useRef, useState } from "react";
import { Check, ImagePlus } from "lucide-react";
import type { FrameId } from "@/constants/frames";
import { BACKGROUND_COLORS } from "@/constants/colors";
import { useThemeEditorStore } from "@/lib/themeEditorStore";
import { toUploadableFile } from "@/lib/imageDecode";
import { frameTypeFromFrameId } from "@/lib/frameApi";
import { useServerAssets } from "@/hooks/useServerAssets";
import { fetchServerAssetFile } from "@/lib/serverAssetFile";
import { ServerAssetPicker } from "@/components/theme/editor/ServerAssetPicker";
import {
  EMPTY_UPLOAD_MESSAGE,
  MAX_UPLOAD_BYTES,
  MIN_UPLOAD_BYTES,
  SUPPORTED_IMAGE_ACCEPT,
  UNSUPPORTED_UPLOAD_MESSAGE,
  UPLOAD_TOO_LARGE_MESSAGE,
  UploadValidationError,
} from "@/lib/presignedUploadApi";

/** 고른 견본의 테두리. 견본과 사이를 띄워 밝은 색·어두운 색 어디서나 보인다. */
const SELECTED_RING = "outline-2 outline-offset-2 outline-(--hc-text)";
/** 목록에 없는 색을 고르는 견본. 무지개로 「아무 색이나」를 말한다. */
const RAINBOW =
  "conic-gradient(from 90deg, #ff5f5f, #ffbf4d, #f6f05a, #5fd38a, #4db8ff, #8a6bff, #ff5fc8, #ff5f5f)";

/** 밝은 색 위에는 어두운 체크, 어두운 색 위에는 흰 체크. */
function SelectedCheck({ hex }: { hex: string }) {
  const n = Number.parseInt(hex, 16);
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return <Check aria-hidden strokeWidth={3} className={`size-4 ${luma > 150 ? "text-[#14140F]" : "text-white"}`} />;
}

export function BackgroundPanel({ frameId }: { frameId: FrameId }) {
  const background = useThemeEditorStore((s) => s.background);
  const backgroundColor = useThemeEditorStore((s) => s.backgroundColor);
  const setBackgroundColor = useThemeEditorStore((s) => s.setBackgroundColor);
  const setBackgroundImage = useThemeEditorStore((s) => s.setBackgroundImage);
  const clearBackgroundImage = useThemeEditorStore((s) => s.clearBackgroundImage);
  const fileRef = useRef<HTMLInputElement>(null);
  const catalog = useServerAssets();
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  /**
   * 배경 선택 회차 번호.
   *
   * HEIC 변환은 비동기라, 느린 사진을 고른 뒤 다른 이미지를 고르거나 배경을 제거하면
   * 먼저 시작한 변환이 나중에 끝나면서 최신 선택을 덮는다. 고르기·제거 때마다 번호를
   * 올리고, 변환 전후로 번호가 같을 때만 반영한다.
   */
  const backgroundGenerationRef = useRef(0);

  /*
    색을 고르는 것도 배경을 바꾸는 동작이다 — `setBackgroundColor` 는 배경 이미지를 해제한다.
    번호를 안 올리면 변환 중이던 사진이 나중에 끝나 사용자가 고른 색을 도로 덮는다.
  */
  const pickBackgroundColor = (value: string) => {
    backgroundGenerationRef.current += 1;
    setBackgroundColor(value);
  };
  const isImage = background.type === "IMAGE";
  const current = backgroundColor.toLowerCase();
  const presetSelected = !isImage && BACKGROUND_COLORS.some((color) => color.value === current);
  const customSelected = !isImage && !presetSelected;
  const openFilePicker = () => fileRef.current?.click();

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3">
      <p className="text-sm font-semibold">배경</p>
      <ServerAssetPicker
        assets={catalog.backgrounds.filter(
          (asset) => asset.frameType === frameTypeFromFrameId(frameId),
        )}
        onSelect={async (asset) => {
          const generation = ++backgroundGenerationRef.current;
          if (asset.color) {
            setBackgroundColor(asset.color);
            return;
          }
          if (!asset.imageUrl) return;
          const file = await toUploadableFile(
            await fetchServerAssetFile(asset.imageUrl),
          );
          if (backgroundGenerationRef.current === generation) setBackgroundImage(file);
        }}
      />

      {/*
        색은 동그란 견본을 눌러 고른다(2026-11-09). 견본은 44px 다 — 터치 화면의 최소 높이(globals.css)에
        못 미치면 세로로 늘어나 타원이 된다. 예전에는 이름 붙은 상자 다섯 개 뒤에 색 코드
        입력칸이 있어, 다른 색을 쓰려면 코드를 알아야 했다. 목록에 없는 색은 맨 끝 무지개 견본이
        기기의 색 고르기 창을 연다. 배경 사진을 깔았으면 어떤 색도 고른 상태로 그리지 않는다.
      */}
      <div role="group" aria-label="배경색" className="flex flex-wrap gap-2.5">
        {BACKGROUND_COLORS.map((color) => {
          const selected = !isImage && current === color.value;
          return (
            <button
              key={color.id}
              type="button"
              onClick={() => pickBackgroundColor(color.value)}
              aria-pressed={selected}
              aria-label={color.label}
              title={color.label}
              className={`grid size-11 place-items-center rounded-full border border-black/10 transition ${selected ? SELECTED_RING : ""}`}
              style={{ backgroundColor: `#${color.value}` }}
            >
              {selected ? <SelectedCheck hex={color.value} /> : null}
            </button>
          );
        })}
        <span
          title="다른 색"
          className={`relative grid size-11 place-items-center rounded-full border border-black/10 has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-(--hc-text) ${customSelected ? SELECTED_RING : ""}`}
          style={{ background: customSelected ? `#${current}` : RAINBOW }}
        >
          {customSelected ? <SelectedCheck hex={current} /> : null}
          <input
            type="color"
            aria-label="다른 색 고르기"
            value={`#${current}`}
            onChange={(e) => pickBackgroundColor(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer rounded-full opacity-0"
          />
        </span>
      </div>

      {/*
        배경 사진은 한 줄짜리 큰 단추로 둔다. 예전에는 작은 「배경 이미지」 단추 밑에 형식·용량
        설명이 붙어 있었다 — 설명은 실패했을 때 그 사유로만 말한다. 깔았으면 그 사진을 보여 주고
        바꾸기·지우기를 둔다.
      */}
      {isImage ? (
        <div className="flex items-center gap-3 rounded-xl border border-(--hc-border) bg-(--hc-surface-strong) p-2 pr-3">
          {background.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={background.url} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
          ) : (
            <span aria-hidden className="size-12 shrink-0 rounded-lg bg-(--hc-surface-muted)" />
          )}
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">배경 사진</span>
          <button
            type="button"
            onClick={openFilePicker}
            className="hc-button-secondary h-9 shrink-0 rounded-full border px-3.5 text-[12px] font-semibold"
          >
            바꾸기
          </button>
          <button
            type="button"
            onClick={() => {
              backgroundGenerationRef.current += 1;
              clearBackgroundImage();
            }}
            className="h-9 shrink-0 rounded-full px-2 text-[12px] font-semibold text-(--hc-muted) transition hover:text-(--hc-text)"
          >
            지우기
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openFilePicker}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-(--hc-border-strong) bg-(--hc-surface-strong) text-[14px] font-semibold text-(--hc-text) transition hover:border-(--hc-primary-line) hover:bg-(--hc-accent-soft-bg)"
        >
          <ImagePlus aria-hidden className="size-4.5" />
          사진으로 배경 넣기
        </button>
      )}
      <input
        ref={fileRef}
        aria-label="배경 이미지 파일"
        type="file"
        accept={SUPPORTED_IMAGE_ACCEPT}
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          // `await` 뒤에는 이 요소가 이미 null 이다. 먼저 비운다 —
          // 안 그러면 같은 파일을 다시 골라도 change 가 안 온다.
          e.target.value = "";
          if (!file) return;
          backgroundGenerationRef.current += 1;
          const generation = backgroundGenerationRef.current;

          /*
                    고른 **즉시** 백엔드가 받는 형식과 크기로 맞춘다.

                    저장 단계에서야 막으면 편집을 다 끝낸 뒤에 막힌다. 그렇다고 거르기만
                    하면 아이폰 사진(HEIC)으로는 배경을 아예 못 넣는다. 여기서 바꿔 두면
                    캔버스 미리보기도 그 파일을 쓰므로, 안드로이드에서 원본 HEIC 가
                    빈칸으로 뜨던 것도 같이 사라진다.
                  */
          try {
            const uploadable = await toUploadableFile(file);
            // 변환 중에 다른 배경을 고르거나 제거했으면 늦게 온 결과는 버린다.
            if (backgroundGenerationRef.current !== generation) return;

            /*
                      크기는 **바꾼 뒤에** 잰다. 서버 한도(1~10MB)를 넘는 크기도 저장
                      단계에서야 실패하니 고른 즉시 같은 규칙으로 걸러내되,
                      `toUploadableFile` 이 한도를 넘는 사진은 줄여서 돌려주므로 원본을
                      먼저 재면 줄이면 들어올 고화소 사진까지 막는다. 규칙의 주인은
                      uploadToS3WithPresigned 이고 여기는 사유를 먼저 말하는 층이다.
                    */
            if (uploadable.size < MIN_UPLOAD_BYTES) {
              setBackgroundError(EMPTY_UPLOAD_MESSAGE);
              return;
            }
            if (uploadable.size > MAX_UPLOAD_BYTES) {
              setBackgroundError(UPLOAD_TOO_LARGE_MESSAGE);
              return;
            }

            setBackgroundError(null);
            setBackgroundImage(uploadable);
          } catch (error) {
            // 오류도 마찬가지다 — 이미 바뀐 배경 위에 지난 실패를 띄우지 않는다.
            if (backgroundGenerationRef.current !== generation) return;
            setBackgroundError(
              error instanceof UploadValidationError
                ? error.message
                : UNSUPPORTED_UPLOAD_MESSAGE,
            );
          }
        }}
      />
      {backgroundError ? (
        <p role="alert" className="text-sm leading-5 text-(--hc-danger)">
          {backgroundError}
        </p>
      ) : null}
    </section>
  );
}
