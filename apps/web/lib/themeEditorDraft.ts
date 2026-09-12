"use client";

import type { FrameId } from "@/constants/frames";
import type { EditorComponent, ThemeBackground } from "@/lib/types/themeEditor";

// 프레임 꾸미기 작업 중 상태(WIP)를 브라우저 localStorage에 임시 보관한다.
// 편집 중에는 S3 temp 업로드를 하지 않으므로, 새로고침/이탈 대비 초안을 로컬에 둔다.
// 로컬 이미지(blob:)는 dataURL로 변환해 저장하고, 최종 저장 시 finalizeAssetsForSave가 S3로 올린다.
const DRAFT_KEY = "harucut:theme-editor-draft:v1";
// localStorage 용량(보통 ~5MB)을 넘기면 저장을 건너뛴다.
const MAX_DRAFT_BYTES = 4_500_000;

export type EditorDraft = {
  frameId: FrameId;
  backgroundColor: string;
  background: ThemeBackground;
  cellCutouts: boolean[];
  components: EditorComponent[];
  savedAt: number;
};

/**
 * blob: → dataURL 변환 결과를 저장 호출 사이에도 들고 있는다.
 *
 * 예전에는 호출마다 캐시를 새로 만들어서, 스티커 하나를 옮길 때마다 사진 네 장을 전부
 * 다시 읽어 base64 로 인코딩했다(1초 디바운스마다 반복). 같은 blob 은 내용이 바뀌지
 * 않으므로 한 번만 읽으면 된다. blob: URL 은 해제되면 다시 못 읽으므로 캐시가 곧 보험이기도 하다.
 *
 * 상한이 둘이다 — **개수와 바이트.** 개수만으로는 메모리가 안 잡힌다:
 * `themeEditorStore.addPhotoAssets` 는 고른 파일을 줄이지 않고 그대로 `createObjectURL` 하므로
 * 요즘 폰 사진 한 장이 base64 로 10MB 를 넘고, 24장이면 수백 MB 다. 게다가 초안 제한을 넘겨
 * localStorage 저장이 취소되는 경우에도 캐시에는 이미 들어간 뒤다.
 *
 * 바이트 예산은 32MB. 아래로 내리면 캐시가 제 일을 못 한다 — 실제로 보관되는 초안은
 * 최대 4.5MB(MAX_DRAFT_BYTES)라 그 7배면 **저장 가능한 초안은 통째로 다 들어간다**.
 * 저장은 안 되지만 편집은 계속되는 경우(폰 사진 네 장 + 배경 ≈ 25~30MB)까지 덮는 선이다.
 * 그보다 큰 원본을 다루는 세션은 디바운스마다 다시 인코딩하지만, 잃는 것은 CPU 지 초안이 아니다.
 */
const MAX_CACHED_SOURCES = 24;
/** dataURL 은 전부 ASCII 라 문자 수를 바이트로 본다. */
const MAX_CACHED_BYTES = 32_000_000;
const dataUrlCache = new Map<string, string>();

function cachedBytes() {
  let total = 0;
  for (const dataUrl of dataUrlCache.values()) total += dataUrl.length;
  return total;
}

/** 직전에 쓴 내용과 같으면 localStorage 쓰기를 건너뛴다(5MB setItem 이 17ms 였다). */
let lastWrittenJson: string | null = null;
// 시작 순서가 저장 순서다. 늦게 끝난 변환이 최신 초안이나 삭제를 되돌리면 안 된다.
let saveRevision = 0;

function isLocalSrc(src: string | undefined): src is string {
  return Boolean(src && (src.startsWith("blob:") || src.startsWith("data:")));
}

async function toDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  const res = await fetch(src);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToFile(dataUrl: string, name: string): File {
  const [meta, b64 = ""] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] ?? "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

// 편집 중 상태를 저장(베스트 에포트). 용량 초과/직렬화 실패 시 조용히 건너뛴다.
export async function saveEditorDraft(input: {
  frameId: FrameId;
  backgroundColor: string;
  background: ThemeBackground;
  cellCutouts: boolean[];
  components: EditorComponent[];
  now: number;
}): Promise<void> {
  if (typeof window === "undefined") return;
  const revision = ++saveRevision;

  try {
    // 같은 blob을 여러 컴포넌트가 공유할 수 있고, 저장은 편집 중 계속 반복된다.
    const resolve = async (src: string) => {
      const cached = dataUrlCache.get(src);
      if (cached) return cached;
      const dataUrl = await toDataUrl(src);
      if (revision !== saveRevision) return dataUrl;
      dataUrlCache.set(src, dataUrl);
      // 오래된 것부터(Map 은 삽입 순) 두 상한 아래로 내려올 때까지 버린다.
      while (
        dataUrlCache.size > MAX_CACHED_SOURCES ||
        cachedBytes() > MAX_CACHED_BYTES
      ) {
        const oldest = dataUrlCache.keys().next().value;
        if (oldest === undefined) break;
        dataUrlCache.delete(oldest);
      }
      return dataUrl;
    };

    const components: EditorComponent[] = [];
    for (const c of input.components) {
      if (revision !== saveRevision) return;
      if (c.type === "PHOTO" && isLocalSrc(c.source)) {
        components.push({ ...c, source: await resolve(c.source) });
      } else {
        components.push(c);
      }
    }

    if (revision !== saveRevision) return;
    let background = input.background;
    if (background.type === "IMAGE" && isLocalSrc(background.url)) {
      background = { ...background, url: await resolve(background.url) };
    }

    if (revision !== saveRevision) return;
    const draft: EditorDraft = {
      frameId: input.frameId,
      backgroundColor: input.backgroundColor,
      background,
      cellCutouts: input.cellCutouts,
      components,
      savedAt: input.now,
    };

    const json = JSON.stringify(draft);
    if (json.length > MAX_DRAFT_BYTES) {
      // 이미지가 너무 커서 보관 불가 — 이전 초안만 비운다.
      // 편집은 계속되므로 캐시는 남긴다(여기서 비우면 디바운스마다 사진을 전부 다시 인코딩한다).
      removeStoredDraft();
      return;
    }
    // savedAt 만 다른 동일 내용이면 쓰지 않는다.
    if (lastWrittenJson !== null && sameExceptSavedAt(lastWrittenJson, json)) return;
    window.localStorage.setItem(DRAFT_KEY, json);
    lastWrittenJson = json;
  } catch {
    // 직렬화/용량 오류는 무시한다(초안 저장은 베스트 에포트).
  }
}

/**
 * savedAt 을 뺀 나머지가 같은지 본다. 초안은 매 저장마다 시각이 바뀌므로 문자열 비교만으로는
 * 항상 다르게 나온다. savedAt 은 JSON 맨 뒤 고정 위치라 그 앞부분만 견주면 된다.
 */
function sameExceptSavedAt(a: string, b: string) {
  const cut = (json: string) => {
    const at = json.lastIndexOf(',"savedAt":');
    return at === -1 ? json : json.slice(0, at);
  };
  return a.length === b.length && cut(a) === cut(b);
}

export function loadEditorDraft(): EditorDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EditorDraft;
    if (!parsed?.frameId || !Array.isArray(parsed.components)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 보관된 초안만 지운다. 세션이 이어지는 경우(용량 초과)에 쓴다. */
function removeStoredDraft(): void {
  if (typeof window === "undefined") return;
  lastWrittenJson = null;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

/**
 * 편집 세션이 끝났다 — 초안과 dataURL 캐시를 함께 비운다.
 *
 * 캐시를 두고 나가면 되쓸 수 없는 메모리가 된다. 나가는 길목마다
 * `useThemeEditorStore.reset()` 이 blob: 을 해제하고, blob: 주소는 매번 새로 발급되므로
 * 남은 항목의 키는 다시 조회되지 않는다. 그대로 두면 세션을 옮겨 다닐수록 쌓인다.
 */
export function clearEditorDraft(): void {
  saveRevision += 1;
  if (typeof window === "undefined") return;
  removeStoredDraft();
  dataUrlCache.clear();
}
