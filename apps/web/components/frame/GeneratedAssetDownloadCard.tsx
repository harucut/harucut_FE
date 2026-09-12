"use client";

import type { GeneratedFourcutAsset } from "@/lib/fourcutOutput";

// 서버가 받는 파일명은 최대 255자다(2026-09-07 로컬 /v3/api-docs 의 DisplayNameUpdateRequest).
// 넘겨 보내면 400 이 오는데 사유가 영문이라 안내가 「잠시 후 다시 시도해 주세요」로 뭉개진다 —
// 기다려도 풀리지 않는 실패다. 그래서 왕복하기 전에 입력창에서 막는다.
const DISPLAY_NAME_MAX_LENGTH = 255;

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
    <section className="hc-surface-card rounded-[28px] border p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            {metaLabel ? (
              <span className="inline-flex rounded-full border border-(--hc-border) bg-(--hc-surface-muted) px-2 py-1 text-[11px] text-(--hc-muted)">
                {metaLabel}
              </span>
            ) : null}
            <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
            <p className="mt-1 text-[12px] leading-[1.6] text-(--hc-muted)">{description}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="fourcut-file-name" className="text-[12px] text-(--hc-muted)">
            파일 이름
          </label>
          <div className="flex gap-2">
            <input
              id="fourcut-file-name"
              value={draftName}
              onChange={(e) => onChangeName(e.target.value)}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              className="hc-input h-11 min-w-0 flex-1 rounded-xl border px-3 text-[13px]"
              placeholder={asset.displayName}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
            />
            <button
              type="button"
              onClick={onSaveName}
              disabled={isSavingName}
              className="hc-button-secondary inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-[13px] font-semibold disabled:opacity-40"
            >
              {isSavingName ? "저장 중…" : "파일명 수정"}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onDownload}
          disabled={isDownloading}
          className="hc-button-primary inline-flex h-12 items-center justify-center rounded-full px-5 text-[15px] font-extrabold disabled:opacity-40"
        >
          {isDownloading ? "다운로드 중…" : "다운로드"}
        </button>

        {onShare ? (
          <button
            type="button"
            onClick={onShare}
            disabled={isSharing}
            className="hc-button-secondary inline-flex h-11 items-center justify-center rounded-full border px-5 text-[13px] font-semibold disabled:opacity-40"
          >
            {isSharing ? "공유 준비 중…" : "공유 링크 만들기"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
