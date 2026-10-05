import type { RemoteFrame, RemoteFrameType } from "@/lib/api-types";

export type ServerAssetKind = "background" | "sticker";
export type ServerAsset = {
  id: string;
  kind: ServerAssetKind;
  category: string | null;
  name: string;
  frameType: RemoteFrameType;
  imageUrl: string | null;
  thumbUrl: string | null;
  color: string | null;
};
export type ServerAssetCatalog = {
  stickers: ServerAsset[];
  backgrounds: ServerAsset[];
};
const TAGS: Record<string, ServerAssetKind> = {
  배경: "background",
  background: "background",
  backgrounds: "background",
  bg: "background",
  스티커: "sticker",
  sticker: "sticker",
  stickers: "sticker",
};

export function parseAssetTitle(title?: string | null) {
  const match = (title ?? "")
    .normalize("NFKC")
    .trim()
    .match(/^[\[【]([^\]】]*)[\]】]\s*(.*)$/u);
  if (!match) return null;
  const tag = match[1].replace(/\s/g, "").toLowerCase();
  if (!Object.hasOwn(TAGS, tag)) return null;
  const slash = match[2].indexOf("/");
  return {
    kind: TAGS[tag],
    category: slash < 0 ? null : match[2].slice(0, slash).trim().slice(0, 20) || null,
    name: (slash < 0 ? match[2] : match[2].slice(slash + 1)).trim().slice(0, 40),
  };
}

export function isAssetFrame(frame: RemoteFrame): boolean {
  return frame.isSystem === true && parseAssetTitle(frame.title) !== null;
}

/** 형식 검사다. 실제 접근 권한은 S3 서명이 검증하며, 외부 URL을 프록시하지 않는다. */
export function toTrustedImageUrl(value?: string | null): string | null {
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    if (!/^[a-z0-9][a-z0-9.-]*\.s3\.ap-northeast-2\.amazonaws\.com$/.test(url.hostname))
      return null;
    if (
      !/^\/uploads\/users\/[^/]+\/(frames|components)\/[^/]+\.(png|jpe?g|webp|gif)$/i.test(
        url.pathname,
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function toServerAssetCatalog(frames: RemoteFrame[]): ServerAssetCatalog {
  const result: ServerAssetCatalog = { stickers: [], backgrounds: [] };
  for (const frame of [...frames].sort((a, b) => a.frameId - b.frameId)) {
    const title = frame.isSystem === true ? parseAssetTitle(frame.title) : null;
    if (!title?.name) continue;
    const asset: ServerAsset = {
      ...title,
      id: `server-${frame.frameId}`,
      frameType: frame.frameType,
      imageUrl: null,
      thumbUrl: toTrustedImageUrl(frame.source),
      color: null,
    };
    if (title.kind === "sticker") {
      if (!asset.thumbUrl) continue;
      asset.imageUrl = asset.thumbUrl;
      result.stickers.push(asset);
    } else {
      if (frame.background?.type === "COLOR") {
        if (!/^#?[0-9a-f]{6}$/i.test(frame.background.value)) continue;
        asset.color = `#${frame.background.value.replace(/^#/, "").toLowerCase()}`;
      } else if (frame.background?.type === "IMAGE") {
        asset.imageUrl = toTrustedImageUrl(frame.background.url);
        if (!asset.imageUrl) continue;
        asset.thumbUrl ??= asset.imageUrl;
      } else continue;
      result.backgrounds.push(asset);
    }
  }
  return result;
}
