"use client";

import type { GeneratedFourcutAsset } from "@/lib/fourcutOutput";
import { sanitizeDisplayName } from "@/lib/fourcutOutput";
import { uploadFourcutMedia } from "@/lib/presignedUploadApi";

function extractFilenameFromUrlLike(value?: string) {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    const lastSegment = parsed.pathname.split("/").pop()?.trim();
    return lastSegment || null;
  } catch {
    const normalized = value.split("?")[0] ?? value;
    const lastSegment = normalized.split("/").pop()?.trim();
    return lastSegment || null;
  }
}

function stripFileExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

function resolveInitialDisplayName(args: {
  downloadUrl?: string;
  objectUrl?: string;
  fallbackName: string;
}) {
  const filename =
    extractFilenameFromUrlLike(args.downloadUrl) ??
    extractFilenameFromUrlLike(args.objectUrl);

  if (!filename) {
    return sanitizeDisplayName(args.fallbackName, "harucut");
  }

  return sanitizeDisplayName(stripFileExtension(filename), args.fallbackName);
}

export async function uploadGeneratedFourcutFile(args: {
  file: File;
  kind: GeneratedFourcutAsset["kind"];
  displayName: string;
  extension: GeneratedFourcutAsset["extension"];
}) {
  const { file, kind, extension } = args;
  const uploaded = await uploadFourcutMedia(file);
  const displayName = resolveInitialDisplayName({
    downloadUrl: uploaded.downloadUrl,
    objectUrl: uploaded.objectUrl,
    fallbackName: args.displayName,
  });

  return {
    mediaId: uploaded.mediaId,
    kind,
    objectUrl: uploaded.objectUrl,
    downloadUrl: uploaded.downloadUrl,
    extension,
    displayName,
  } satisfies GeneratedFourcutAsset;
}
