"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { downloadFromUrl } from "@/lib/canvas/composeFrame";
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

export default function HistoryPage() {
  const [filter, setFilter] = useState<FilterValue>("ALL");
  const [items, setItems] = useState<UserMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

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

  const emptyText = useMemo(() => {
    if (filter === "PHOTO") return "저장된 사진 기록이 없어요.";
    if (filter === "VIDEO") return "저장된 영상 기록이 없어요.";
    return "저장된 기록이 없어요.";
  }, [filter]);

  const handleDownload = async (item: UserMedia) => {
    setDownloadingId(item.mediaId);

    try {
      const url = await getMediaDownloadUrl(item.mediaId);
      await downloadFromUrl(url);
    } catch (downloadError) {
      console.error(downloadError);
      alert("다운로드에 실패했어요.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <main className="min-h-dvh bg-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <PageHeader
          title="사진 기록"
          backHref="/home"
          backLabel="홈으로"
          description={<>내가 만든 사진과 영상을 다시 확인하고 다운로드할 수 있어요.</>}
        />

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
            <p className="text-[11px] text-zinc-400">불러오는 중...</p>
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
                      <div className="grid h-full w-full place-items-center text-[10px] text-zinc-500">
                        미리보기를 준비 중이에요
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

                    <button
                      type="button"
                      onClick={() => handleDownload(item)}
                      disabled={downloadingId === item.mediaId}
                      className="rounded-full bg-emerald-500 px-3 py-2 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {downloadingId === item.mediaId
                        ? "다운로드 중..."
                        : "다시 다운로드"}
                    </button>
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
