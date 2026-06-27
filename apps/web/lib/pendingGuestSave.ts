"use client";

// 비회원이 "저장"을 눌렀을 때 결과물을 보관해 두고, 로그인/회원가입을 마치면
// 자동으로 서버(기록)에 업로드하기 위한 보관소.
// OAuth는 전체 페이지 리다이렉트라 메모리로는 유실되므로 localStorage(dataURL)에 보관한다.
const KEY = "harucut:pending-guest-save:v1";

export type PendingGuestSave = {
  dataUrl: string;
  displayName: string;
  savedAt: number;
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
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

// 결과물을 보관한다. 용량 초과 등으로 실패하면 false(호출부에서 안내).
export async function setPendingGuestSave(
  blob: Blob,
  displayName: string,
  now: number,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const dataUrl = await blobToDataUrl(blob);
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ dataUrl, displayName, savedAt: now }),
    );
    return true;
  } catch {
    return false;
  }
}

export function getPendingGuestSave(): PendingGuestSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingGuestSave;
    if (!parsed?.dataUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingGuestSave(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}
