"use client";
import { useRef, useState } from "react";
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
      <div className="flex flex-wrap gap-2">
        {BACKGROUND_COLORS.map((color) => {
          const selected = backgroundColor === color.value;
          return (
            // 라벨을 스와치 위에 얹으면 색마다 대비가 1.4~3.5:1 로 널뛴다.
            // 스와치는 색만 보여주고 이름은 아래에 둔다.
            <button
              key={color.id}
              type="button"
              onClick={() => pickBackgroundColor(color.value)}
              aria-pressed={selected}
              className={`flex min-w-16 flex-col items-center gap-1 rounded-lg border p-1 text-[12px] ${
                selected
                  ? "border-(--hc-primary) bg-(--hc-accent-soft-bg) text-(--hc-primary-strong)"
                  : "border-(--hc-border) text-(--hc-muted)"
              }`}
            >
              <span
                aria-hidden
                className="block h-6 w-full rounded border border-(--hc-border-subtle)"
                style={{ backgroundColor: `#${color.value}` }}
              />
              {color.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="배경색 직접 고르기"
          value={`#${backgroundColor}`}
          onChange={(e) => pickBackgroundColor(e.target.value)}
          className="hc-input h-11 w-12 shrink-0 rounded-lg border"
        />
        {/* 스토어의 normalizeHexColor 가 '#' 를 떼고 6자리로만 저장한다 —
                    프리셋을 누르든 저장본을 불러오든 손으로 치든 결과는 같다.
                    그래서 '#' 는 화면에만 붙이고 입력값에는 넣지 않는다. 넣으면 '##' 로 겹친다. */}
        <div className="hc-input flex h-11 min-w-0 flex-1 items-center gap-1 rounded-lg border px-3">
          <span aria-hidden className="font-mono text-[13px] text-(--hc-muted)">
            #
          </span>
          <input
            aria-label="배경색 코드"
            value={backgroundColor}
            onChange={(e) => pickBackgroundColor(e.target.value)}
            className="min-w-0 flex-1 bg-transparent font-mono text-[13px] tracking-[0.06em] text-(--hc-text) outline-none"
            placeholder="ffffff"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={6}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="inline-flex h-11 cursor-pointer items-center justify-center rounded-lg border border-(--hc-border) px-3 text-[12px] font-semibold text-(--hc-text) hover:border-(--hc-primary)">
          <button
            type="button"
            className="h-full"
            onClick={() => fileRef.current?.click()}
          >
            {background.type === "IMAGE" ? "배경 이미지 변경" : "배경 이미지"}
          </button>
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
        </div>
        {background.type === "IMAGE" ? (
          <button
            type="button"
            onClick={() => {
              backgroundGenerationRef.current += 1;
              clearBackgroundImage();
            }}
            className="h-11 rounded-lg border border-(--hc-border) px-3 text-[12px] font-semibold text-(--hc-muted) hover:border-(--hc-primary)"
          >
            이미지 제거
          </button>
        ) : null}
      </div>
      {backgroundError ? (
        <p role="alert" className="text-sm leading-5 text-(--hc-danger)">
          {backgroundError}
        </p>
      ) : null}
      <p className="text-[12px] leading-5 text-(--hc-muted)">
        배경 이미지는 사진 칸 뒤에 깔려요. 10MB 이하 PNG·JPG·WEBP·GIF·HEIC만 올릴 수
        있어요.
      </p>
    </section>
  );
}
