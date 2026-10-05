"use client";

import { useState } from "react";
import type { ServerAsset } from "@/lib/serverAssets";

export function ServerAssetPicker({
  assets,
  onSelect,
}: {
  assets: ServerAsset[];
  onSelect: (asset: ServerAsset) => void | Promise<void>;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const categories = [
    ...new Set(assets.map((a) => a.category).filter((c): c is string => !!c)),
  ];
  const selectedCategory = categories.includes(category ?? "") ? category : null;
  if (!assets.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {categories.length > 1 ? (
        <div className="flex flex-wrap gap-2" aria-label="소재 분류">
          {[null, ...categories].map((item) => (
            <button
              key={item ?? "all"}
              type="button"
              aria-pressed={selectedCategory === item}
              onClick={() => setCategory(item)}
              className="hc-button-ghost rounded-full border border-(--hc-border) px-3 py-2 text-sm"
            >
              {item ?? "전체"}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {assets
          .filter((a) => !selectedCategory || a.category === selectedCategory)
          .map((asset) => (
            <button
              key={asset.id}
              type="button"
              disabled={busy !== null}
              aria-label={`${asset.kind === "sticker" ? "스티커" : "배경"} ${asset.name}`}
              onClick={async () => {
                setBusy(asset.id);
                setError(null);
                try {
                  await onSelect(asset);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "소재를 불러오지 못했어요.",
                  );
                } finally {
                  setBusy(null);
                }
              }}
              className="w-20 shrink-0 rounded-xl border border-(--hc-border) p-1 text-xs disabled:opacity-50"
            >
              {asset.color ? (
                <span
                  className="block aspect-square rounded-lg"
                  style={{ backgroundColor: asset.color }}
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={asset.thumbUrl ?? asset.imageUrl ?? ""}
                  alt=""
                  width={72}
                  height={72}
                  loading="lazy"
                  crossOrigin="anonymous"
                  className="aspect-square w-full object-contain"
                  onError={(e) => {
                    e.currentTarget.closest("button")!.hidden = true;
                  }}
                  onLoad={(e) => {
                    if (
                      e.currentTarget.naturalWidth * e.currentTarget.naturalHeight >
                      16_000_000
                    ) {
                      e.currentTarget.closest("button")!.hidden = true;
                    }
                  }}
                />
              )}
              <span className="block truncate py-1">
                {busy === asset.id ? "불러오는 중…" : asset.name}
              </span>
            </button>
          ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-(--hc-danger)">
          {error}
        </p>
      ) : null}
    </div>
  );
}
