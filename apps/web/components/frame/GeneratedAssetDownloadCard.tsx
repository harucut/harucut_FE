"use client";

import type { ReactNode } from "react";
import { isNativeShell } from "@/lib/nativeBridge";
import { DISPLAY_NAME_MAX_LENGTH, type GeneratedFourcutAsset } from "@/lib/fourcutOutput";

// 서버가 받는 파일명은 최대 255자다(2026-09-07 로컬 /v3/api-docs 의 DisplayNameUpdateRequest).
// 넘겨 보내면 400 이 오는데 사유가 영문이라 안내가 「잠시 후 다시 시도해 주세요」로 뭉개진다 —
// 기다려도 풀리지 않는 실패다. 그래서 왕복하기 전에 입력창에서 막는다.

type GeneratedAssetDownloadCardProps = {
  description?: string;
  asset: GeneratedFourcutAsset;
  draftName: string;
  onChangeName: (value: string) => void;
  onSaveName: () => void | Promise<void>;
  onDownload: () => void | Promise<void>;
  onShare?: () => void | Promise<void>;
  isSavingName: boolean;
  isDownloading: boolean;
  isSharing?: boolean;
  localDownload?: { href: string; filename: string };
  shareLabel?: string;
  /** 보조 줄에 함께 놓을 것(사진 다시 고르기 등). 주 버튼은 언제나 맨 아래다. */
  extraActions?: ReactNode;
};

/**
 * 완성 사진으로 할 일.
 *
 * 카드로 묶지 않고 화면 흐름에 그대로 놓는다(`contents`). 주 버튼이 페이지 높이를 기준으로 화면 아래에 붙으려면,
 * 카드 안에 갇히면 안 된다 — sticky 는 부모 상자 안에서만 붙는다. 사진을 보는 동안에도 저장은 엄지 아래에 있다.
 * 파일 이름은 대부분 건드리지 않으므로 접어 둔다.
 */
export function GeneratedAssetDownloadCard({
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
  localDownload,
  shareLabel = "공유 링크 만들기",
  extraActions,
}: GeneratedAssetDownloadCardProps) {
  const primaryClass =
    "hc-button-primary inline-flex h-14 w-full items-center justify-center rounded-full px-5 text-[16px] font-extrabold";
  return (
    <div className="contents">
      {description ? <p className="text-center text-[13px] leading-[1.6] text-(--hc-muted)">{description}</p> : null}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {onShare ? (
          <button
            type="button"
            onClick={onShare}
            disabled={isSharing}
            className="hc-button-secondary inline-flex h-11 items-center justify-center rounded-full border px-5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSharing ? "공유 준비 중…" : shareLabel}
          </button>
        ) : null}
        {extraActions}
      </div>

      <details className="group text-[13px]">
        <summary className="mx-auto flex min-h-11 w-fit cursor-pointer list-none items-center px-3 font-semibold text-(--hc-muted) underline underline-offset-4 group-open:no-underline">
          파일 이름 바꾸기
        </summary>
        <div className="flex flex-col gap-2 pt-1">
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
              className="hc-button-secondary inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSavingName ? "저장 중…" : "파일명 수정"}
            </button>
          </div>
        </div>
      </details>

      <div className="sticky bottom-0 z-10 -mx-4 mt-auto bg-linear-to-t from-(--background) from-75% to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6 lg:-mx-8 lg:px-8">
        {localDownload ? (
          <a
            href={localDownload.href}
            download={localDownload.filename}
            aria-disabled={isDownloading || undefined}
            onClick={(event) => {
              if (isDownloading) {
                event.preventDefault();
                return;
              }
              // Safari는 실제 링크의 기본 동작으로 받는다. 클릭 뒤 URL을 폐기하지 않는다.
              // 앱 셸만 기존 네이티브 저장 브리지를 사용한다.
              if (isNativeShell()) {
                event.preventDefault();
                void onDownload();
              }
            }}
            className={`${primaryClass} aria-disabled:cursor-not-allowed aria-disabled:opacity-40`}
          >
            {isDownloading ? "저장 중…" : "사진 저장"}
          </a>
        ) : (
          <button type="button" onClick={onDownload} disabled={isDownloading} className={`${primaryClass} disabled:cursor-not-allowed disabled:opacity-40`}>
            {isDownloading ? "저장 중…" : "사진 저장"}
          </button>
        )}
      </div>
    </div>
  );
}
