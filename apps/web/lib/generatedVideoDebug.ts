"use client";

type GeneratedVideoDebugEntry = {
  filename: string;
  url: string;
  download: () => void;
  open: () => string | null;
};

declare global {
  interface Window {
    __harucutGeneratedWebm?: Record<string, GeneratedVideoDebugEntry>;
    downloadHarucutGeneratedWebm?: (scope?: string) => void;
    openHarucutGeneratedWebm?: (scope?: string) => string | null;
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
  window.downloadHarucutGeneratedWebm = (scope = "latest") => {
    const entries = window.__harucutGeneratedWebm;
    if (!entries) return;

    const resolved = entries[scope] ?? entries.latest;
    resolved?.download();
  };

  window.openHarucutGeneratedWebm = (scope = "latest") => {
    const entries = window.__harucutGeneratedWebm;
    if (!entries) return null;

    const resolved = entries[scope] ?? entries.latest;
    return resolved?.open() ?? null;
  };
}

function cleanupGlobalCommandsIfEmpty() {
  const entries = window.__harucutGeneratedWebm;
  if (entries && Object.keys(entries).length > 0) {
    return;
  }

  delete window.__harucutGeneratedWebm;
  delete window.downloadHarucutGeneratedWebm;
  delete window.openHarucutGeneratedWebm;
}

export function registerGeneratedWebmDebug(args: {
  scope: string;
  blob: Blob;
  filename: string;
  previousUrl?: string | null;
}) {
  if (args.previousUrl) {
    URL.revokeObjectURL(args.previousUrl);
  }

  const url = URL.createObjectURL(args.blob);
  const entry: GeneratedVideoDebugEntry = {
    filename: args.filename,
    url,
    download: () => triggerDownload(url, args.filename),
    open: () => {
      window.open(url, "_blank", "noopener");
      return url;
    },
  };

  window.__harucutGeneratedWebm = window.__harucutGeneratedWebm ?? {};
  window.__harucutGeneratedWebm[args.scope] = entry;
  window.__harucutGeneratedWebm.latest = entry;
  installGlobalCommands();

  return url;
}

export function unregisterGeneratedWebmDebug(
  scope: string,
  currentUrl?: string | null,
) {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
  }

  const entries = window.__harucutGeneratedWebm;
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
