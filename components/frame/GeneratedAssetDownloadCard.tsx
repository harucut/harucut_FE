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
  isSavingName: boolean;
  isDownloading: boolean;
};

export function GeneratedAssetDownloadCard({
  title,
  description,
  asset,
  draftName,
  onChangeName,
  onSaveName,
  onDownload,
  isSavingName,
  isDownloading,
}: GeneratedAssetDownloadCardProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <p className="mt-1 text-[11px] text-zinc-500">{description}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[11px] text-zinc-300">파일 이름</label>
          <div className="flex gap-2">
            <input
              value={draftName}
              onChange={(e) => onChangeName(e.target.value)}
              className="h-9 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-[11px] text-zinc-100 outline-none focus:border-emerald-500"
              placeholder={asset.displayName}
            />
            <button
              type="button"
              onClick={onSaveName}
              disabled={isSavingName}
              className="rounded-full border border-zinc-700 px-3 py-2 text-[11px] font-medium text-zinc-100 hover:bg-zinc-800 disabled:opacity-40"
            >
              {isSavingName ? "저장 중..." : "파일명 수정"}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onDownload}
          disabled={isDownloading}
          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          {isDownloading ? "다운로드 중..." : "다운로드"}
        </button>
      </div>
    </section>
  );
}
