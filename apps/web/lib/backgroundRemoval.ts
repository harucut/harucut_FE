"use client";

import type { Config } from "@imgly/background-removal";

let removeBackgroundModulePromise:
  | Promise<typeof import("@imgly/background-removal")>
  | null = null;

function getRemoveBackgroundModule() {
  if (!removeBackgroundModulePromise) {
    removeBackgroundModulePromise = import("@imgly/background-removal");
  }

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
