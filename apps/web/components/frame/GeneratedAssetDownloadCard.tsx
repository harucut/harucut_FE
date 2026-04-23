"use client";

import type { GeneratedFourcutAsset } from "@/lib/fourcutOutput";

type GeneratedAssetDownloadCardProps = {
  title: string;
  description: string;
  asset: GeneratedFourcutAsset;
  draftName: string;
  onChangeName: (value: string) => void;
  onSaveName: () => void | Promise<void>;
  onDownload: () => void | Promise<void>;
  onShare?: () => void | Promise<void>;
  isSavingName: boolean;
  isDownloading: boolean;
  isSharing?: boolean;
  metaLabel?: string;
};

export function GeneratedAssetDownloadCard({
  title,
  description,
  asset,
  draftName,
  onChangeName,
  onSaveName,
  onDownload,
  onShare,
  isSavingName,
  isDownloading,
  isSharing = false,
  metaLabel,
}: GeneratedAssetDownloadCardProps) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            {metaLabel ? (
              <span className="inline-flex rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-zinc-300">
                {metaLabel}
              </span>
            ) : null}
            <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
            <p className="mt-1 text-[11px] text-zinc-500">{description}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[11px] text-zinc-300">파일 이름</label>
          <div className="flex gap-2">
            <input
              value={draftName}
              onChange={(e) => onChangeName(e.target.value)}
              className="hc-input h-9 flex-1 rounded-xl border px-3 text-[11px]"
              placeholder={asset.displayName}
            />
            <button
              type="button"
              onClick={onSaveName}
              disabled={isSavingName}
              className="hc-button-secondary rounded-full border px-3 py-2 text-[11px] font-medium disabled:opacity-40"
            >
              {isSavingName ? "저장 중..." : "파일명 수정"}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onDownload}
          disabled={isDownloading}
          className="hc-button-primary rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
        >
          {isDownloading ? "다운로드 중..." : "다운로드"}
        </button>

        {onShare ? (
          <button
            type="button"
            onClick={onShare}
            disabled={isSharing}
            className="hc-button-secondary rounded-full border px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            {isSharing ? "공유 준비 중..." : "공유 링크 만들기"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
