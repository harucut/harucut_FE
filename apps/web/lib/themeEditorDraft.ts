"use client";

import type { FrameId } from "@/constants/frames";
import type { EditorComponent, ThemeBackground } from "@/lib/types/themeEditor";

// 프레임 꾸미기 작업 중 상태(WIP)를 브라우저 localStorage에 임시 보관한다.
// 편집 중에는 S3 temp 업로드를 하지 않으므로, 새로고침/이탈 대비 초안을 로컬에 둔다.
// 로컬 이미지(blob:)는 dataURL로 변환해 저장하고, 최종 저장 시 finalizePhotosForSave가 S3로 올린다.
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

  try {
    // 같은 blob을 여러 컴포넌트가 공유할 수 있어 src→dataURL 변환을 캐시한다.
    const cache = new Map<string, string>();
    const resolve = async (src: string) => {
      const cached = cache.get(src);
      if (cached) return cached;
      const dataUrl = await toDataUrl(src);
      cache.set(src, dataUrl);
      return dataUrl;
    };

    const components: EditorComponent[] = [];
    for (const c of input.components) {
      if (c.type === "PHOTO" && isLocalSrc(c.source)) {
        components.push({ ...c, source: await resolve(c.source) });
      } else {
        components.push(c);
      }
    }

    let background = input.background;
    if (background.type === "IMAGE" && isLocalSrc(background.url)) {
      background = { ...background, url: await resolve(background.url) };
    }

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
      clearEditorDraft();
      return;
    }
    window.localStorage.setItem(DRAFT_KEY, json);
  } catch {
    // 직렬화/용량 오류는 무시한다(초안 저장은 베스트 에포트).
  }
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

export function clearEditorDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {}
}
