"use client";

type GeneratedImageDebugEntry = {
  filename: string;
  url: string;
  download: () => void;
  open: () => string | null;
};

declare global {
  interface Window {
    __harucutGeneratedPng?: Record<string, GeneratedImageDebugEntry>;
    downloadHarucutGeneratedPng?: (scope?: string) => void;
    openHarucutGeneratedPng?: (scope?: string) => string | null;
  }
}

function triggerDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function installGlobalCommands() {
  window.downloadHarucutGeneratedPng = (scope = "latest") => {
    const entries = window.__harucutGeneratedPng;
    if (!entries) return;

    const resolved = entries[scope] ?? entries.latest;
    resolved?.download();
  };

  window.openHarucutGeneratedPng = (scope = "latest") => {
    const entries = window.__harucutGeneratedPng;
    if (!entries) return null;

    const resolved = entries[scope] ?? entries.latest;
    return resolved?.open() ?? null;
  };
}

function cleanupGlobalCommandsIfEmpty() {
  const entries = window.__harucutGeneratedPng;
  if (entries && Object.keys(entries).length > 0) {
    return;
  }

  delete window.__harucutGeneratedPng;
  delete window.downloadHarucutGeneratedPng;
  delete window.openHarucutGeneratedPng;
}

export function registerGeneratedPngDebug(args: {
  scope: string;
  blob: Blob;
  filename: string;
  previousUrl?: string | null;
}) {
  if (args.previousUrl) {
    URL.revokeObjectURL(args.previousUrl);
  }

  const url = URL.createObjectURL(args.blob);
  const entry: GeneratedImageDebugEntry = {
    filename: args.filename,
    url,
    download: () => triggerDownload(url, args.filename),
    open: () => {
      window.open(url, "_blank", "noopener");
      return url;
    },
  };

  window.__harucutGeneratedPng = window.__harucutGeneratedPng ?? {};
  window.__harucutGeneratedPng[args.scope] = entry;
  window.__harucutGeneratedPng.latest = entry;
  installGlobalCommands();

  return url;
}

export function unregisterGeneratedPngDebug(
  scope: string,
  currentUrl?: string | null,
) {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
  }

  const entries = window.__harucutGeneratedPng;
  if (!entries) {
    cleanupGlobalCommandsIfEmpty();
    return;
  }

  delete entries[scope];

  if (entries.latest?.url === currentUrl) {
    delete entries.latest;
  }

  cleanupGlobalCommandsIfEmpty();
}
