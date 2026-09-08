"use client";

import type { Config } from "@imgly/background-removal";

let removeBackgroundModulePromise:
  | Promise<typeof import("@imgly/background-removal")>
  | null = null;

function getRemoveBackgroundModule() {
  if (removeBackgroundModulePromise) return removeBackgroundModulePromise;

  // 실패는 캐시하지 않는다. 청크를 못 받는 것은 대개 그 순간의 네트워크이고, 거부된
  // 프로미스를 붙들고 있으면 「누끼」 버튼이 새로고침 전까지 계속 즉시 실패한다 —
  // 앱 셸에는 주소창이 없어 당겨서 새로고침 말고는 풀 길이 없다.
  // 촬영 쪽 `canvas/personCutout.ts` 가 실패까지 캐시하는 것은 4컷이 한꺼번에 받으러
  // 나가는 자리라 그런 것이고, 여기는 버튼 한 번에 한 장이라 그 이유가 없다.
  removeBackgroundModulePromise = import("@imgly/background-removal").catch(
    (error) => {
      removeBackgroundModulePromise = null;
      throw error;
    },
  );

  return removeBackgroundModulePromise;
}

export function buildBackgroundRemovedFileName(fileName: string) {
  const trimmed = fileName.trim();
  const withoutExtension = trimmed.replace(/\.[^.]+$/, "") || "photo";
  return `${withoutExtension}-cutout.png`;
}

export async function removeImageBackground(file: File) {
  const { removeBackground } = await getRemoveBackgroundModule();
  const config: Config = {
    model: "isnet_quint8",
    device: "cpu",
    proxyToWorker: false,
    output: {
      format: "image/png",
      quality: 1,
    },
  };

  const blob = await removeBackground(file, config);

  return new File([blob], buildBackgroundRemovedFileName(file.name), {
    type: "image/png",
  });
}
