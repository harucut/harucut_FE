"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { downloadFromUrl } from "@/lib/canvas/composeFrame";
import { buildDownloadFilename } from "@/lib/fourcutOutput";
import { shareOrCopyLink } from "@/lib/share";
import { getMediaDownloadUrl, listMyMedia } from "@/lib/userMediaApi";
import type { UserMedia, UserMediaType } from "@/lib/api-types";

type FilterValue = "ALL" | UserMediaType;

function getMediaTitle(item: UserMedia) {
  const preferredName = item.displayName?.trim() || item.displayname?.trim();
  if (preferredName) return preferredName;

  const originalName = item.originalFileName?.trim();
  if (originalName) return originalName;

  return item.s3Key.split("/").pop() || "기록";
}

function getMediaTypeLabel(type: UserMediaType) {
  return type === "PHOTO" ? "사진" : "영상";
}

function getMediaExtension(item: UserMedia) {
  const candidates = [item.downloadUrl, item.originalFileName, item.s3Key];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const normalized = candidate.split("?")[0] ?? candidate;
    const match = normalized.match(/\.([a-z0-9]+)$/i);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }

  return item.mediaType === "VIDEO" ? "mp4" : "png";
}

export default function HistoryPage() {
  const [filter, setFilter] = useState<FilterValue>("ALL");
  const [items, setItems] = useState<UserMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [sharingId, setSharingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      setLoading(true);
      setError(null);

      try {
        const media = await listMyMedia(filter === "ALL" ? undefined : filter);
        if (!cancelled) {
          const sorted = [...media].sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
          });
          setItems(sorted);
        }
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) {
          setError("기록을 불러오지 못했어요.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadItems();

    return () => {
      cancelled = true;
    };
  }, [filter]);

  useEffect(() => {
    if (!feedback) return undefined;

    const timeoutId = window.setTimeout(() => {
      setFeedback(null);
    }, 2400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [feedback]);

  const emptyText = useMemo(() => {
    if (filter === "PHOTO") return "저장한 사진 기록이 아직 없어요.";
    if (filter === "VIDEO") return "저장한 영상 기록이 아직 없어요.";
    return "저장한 기록이 아직 없어요.";
  }, [filter]);

  const handleDownload = async (item: UserMedia) => {
    setDownloadingId(item.mediaId);

    try {
      const url = await getMediaDownloadUrl(item.mediaId);
      await downloadFromUrl(
        url,
        buildDownloadFilename(getMediaTitle(item), getMediaExtension(item)),
      );
    } catch (downloadError) {
      console.error(downloadError);
      alert("다운로드에 실패했어요.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleShare = async (item: UserMedia) => {
    setSharingId(item.mediaId);

    try {
      const url = await getMediaDownloadUrl(item.mediaId);
      const result = await shareOrCopyLink({
        title: `${getMediaTitle(item)} | 하루컷`,
        text: `${getMediaTypeLabel(item.mediaType)} 공유 링크`,
        url,
      });

      if (result === "copied") {
        setFeedback("공유 링크를 복사했어요.");
      } else if (result === "shared") {
        setFeedback("공유 창을 열었어요.");
      }
    } catch (shareError) {
      console.error(shareError);
      alert("공유 링크를 준비하지 못했어요.");
    } finally {
      setSharingId(null);
    }
  };

  return (
    <main className="min-h-dvh bg-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <PageHeader
          title="사진 기록"
          backHref="/home"
          backLabel="홈으로"
          description={
            <>내가 만든 사진과 영상을 다시 확인하고 내려받거나 공유할 수 있어요.</>
          }
        />

        {feedback ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[11px] text-emerald-200">
            {feedback}
          </div>
        ) : null}

        <section className="flex gap-2">
          {(["ALL", "PHOTO", "VIDEO"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-medium ${
                filter === value
                  ? "bg-emerald-500 text-zinc-950"
                  : "border border-zinc-800 bg-zinc-900 text-zinc-300"
              }`}
            >
              {value === "ALL" ? "전체" : value === "PHOTO" ? "사진" : "영상"}
            </button>
          ))}
        </section>

        {error ? <p className="text-[11px] text-red-300">{error}</p> : null}

        {loading ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[11px] text-zinc-400">기록을 불러오는 중이에요.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[11px] text-zinc-500">{emptyText}</p>
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-3">
            {items.map((item) => (
              <article
                key={item.mediaId}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3"
              >
                <div className="flex gap-3">
                  <div className="h-28 w-24 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                    {item.downloadUrl ? (
                      item.mediaType === "VIDEO" ? (
                        <video
                          src={item.downloadUrl}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          controls={false}
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.downloadUrl}
                          alt={getMediaTitle(item)}
                          className="h-full w-full object-cover"
                        />
                      )
                    ) : (
                      <div className="grid h-full w-full place-items-center px-2 text-center text-[10px] text-zinc-500">
                        미리보기를 준비하는 중이에요.
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] tracking-[0.2em] text-emerald-300">
                        {getMediaTypeLabel(item.mediaType)}
                      </span>
                      <p className="truncate text-sm font-semibold text-zinc-100">
                        {getMediaTitle(item)}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleString("ko-KR")
                          : "생성 시간을 확인할 수 없어요."}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleDownload(item)}
                        disabled={downloadingId === item.mediaId}
                        className="flex flex-1 items-center justify-center gap-1 rounded-full bg-emerald-500 px-3 py-2 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>
                          {downloadingId === item.mediaId ? "다운로드 중..." : "다운로드"}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShare(item)}
                        disabled={sharingId === item.mediaId}
                        className="flex flex-1 items-center justify-center gap-1 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-2 text-[11px] font-semibold text-zinc-100 hover:bg-zinc-900 disabled:opacity-50"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span>
                          {sharingId === item.mediaId ? "링크 준비 중..." : "공유하기"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
