"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Image as ImageIcon,
  PencilLine,
  Play,
  Search,
  Share2,
} from "lucide-react";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { AppNav } from "@/components/layout/AppNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { downloadFromUrl } from "@/lib/canvas/composeFrame";
import { buildDownloadFilename } from "@/lib/fourcutOutput";
import { shareOrCopyLink } from "@/lib/share";
import { getUserMediaPreview, getUserMediaTitle } from "@/lib/userMediaPreview";
import {
  getMediaDownloadUrl,
  listMyMedia,
  updateMediaDisplayName,
} from "@/lib/userMediaApi";
import type { UserMedia, UserMediaType } from "@/lib/api-types";

type FilterValue = "ALL" | UserMediaType;

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

function sortMedia(items: UserMedia[]) {
  return [...items].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}

export default function HistoryPage() {
  const [filter, setFilter] = useState<FilterValue>("ALL");
  const [items, setItems] = useState<UserMedia[]>([]);
  const [previewItems, setPreviewItems] = useState<UserMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [savingNameId, setSavingNameId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      setLoading(true);
      setError(null);

      try {
        const media = await listMyMedia(filter === "ALL" ? undefined : filter);
        const nextPreviewItems =
          filter === "ALL"
            ? media
            : await listMyMedia().catch(() => media);

        if (!cancelled) {
          setItems(sortMedia(media));
          setPreviewItems(sortMedia(nextPreviewItems));
        }
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) {
          setError(
            getUserFacingApiErrorMessage(loadError, "기록을 불러오지 못했어요."),
          );
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

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;

    return items.filter((item) =>
      getUserMediaTitle(item).toLowerCase().includes(keyword),
    );
  }, [items, search]);

  const stats = useMemo(() => {
    const photos = items.filter((item) => item.mediaType === "PHOTO").length;
    const videos = items.filter((item) => item.mediaType === "VIDEO").length;

    return {
      total: items.length,
      photos,
      videos,
    };
  }, [items]);

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
        buildDownloadFilename(getUserMediaTitle(item), getMediaExtension(item)),
      );
    } catch (downloadError) {
      console.error(downloadError);
      alert(
        getUserFacingApiErrorMessage(
          downloadError,
          "다운로드를 준비하지 못했어요.",
        ),
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const handleShare = async (item: UserMedia) => {
    setSharingId(item.mediaId);

    try {
      const url = await getMediaDownloadUrl(item.mediaId);
      const result = await shareOrCopyLink({
        title: `${getUserMediaTitle(item)} | 하루컷`,
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
      alert(
        getUserFacingApiErrorMessage(
          shareError,
          "공유 링크를 준비하지 못했어요.",
        ),
      );
    } finally {
      setSharingId(null);
    }
  };

  const handleStartRename = (item: UserMedia) => {
    setEditingId(item.mediaId);
    setDraftName(getUserMediaTitle(item));
  };

  const handleSaveName = async (item: UserMedia) => {
    const nextName = draftName.trim();
    if (!nextName) {
      setFeedback("파일 이름은 비워둘 수 없어요.");
      return;
    }

    setSavingNameId(item.mediaId);

    try {
      const updated = await updateMediaDisplayName(item.mediaId, nextName);
      const resolvedName =
        updated.displayName?.trim() || updated.displayname?.trim() || nextName;

      setItems((current) =>
        current.map((currentItem) =>
          currentItem.mediaId === item.mediaId
            ? { ...currentItem, displayName: resolvedName }
            : currentItem,
        ),
      );
      setPreviewItems((current) =>
        current.map((currentItem) =>
          currentItem.mediaId === item.mediaId
            ? { ...currentItem, displayName: resolvedName }
            : currentItem,
        ),
      );
      setEditingId(null);
      setDraftName("");
      setFeedback("파일 이름을 수정했어요.");
    } catch (renameError) {
      console.error(renameError);
      setFeedback("파일 이름을 수정하지 못했어요.");
    } finally {
      setSavingNameId(null);
    }
  };

  const filterOptions: { value: FilterValue; label: string; count: number }[] = [
    { value: "ALL", label: "전체", count: stats.total },
    { value: "PHOTO", label: "사진", count: stats.photos },
    { value: "VIDEO", label: "영상", count: stats.videos },
  ];

  return (
    <main className="hc-page-app min-h-dvh pb-[90px] text-[color:var(--hc-text)] lg:pb-0">
      <AppNav />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:py-6 lg:gap-6 lg:py-8">
        {/* 헤더 */}
        <header className="flex flex-col gap-2 pt-1 lg:flex-row lg:items-end lg:justify-between lg:pt-3">
          <div>
            <h1 className="text-[28px] font-extrabold tracking-tight lg:text-[34px]">
              기록
            </h1>
            <p className="mt-2 text-[13.5px] text-[color:var(--hc-muted)]">
              남긴 하루컷 {loading ? "…" : stats.total}개 · 언제든 다시 내려받을 수
              있어요
            </p>
          </div>
          <div className="hidden gap-2 lg:flex">
            <Link
              href="/shoot"
              className="hc-button-primary rounded-full px-4 py-2.5 text-[13px] font-semibold"
            >
              새 촬영
            </Link>
            <Link
              href="/upload"
              className="hc-button-secondary rounded-full border px-4 py-2.5 text-[13px] font-semibold"
            >
              업로드
            </Link>
          </div>
        </header>

        {/* 필터 + 검색 */}
        <section className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                  filter === option.value
                    ? "bg-[color:var(--hc-primary)] text-[color:var(--hc-primary-contrast)]"
                    : "hc-button-secondary border text-[color:var(--hc-muted)]"
                }`}
              >
                {option.label}
                <span className="ml-1 opacity-70">
                  {loading ? "" : option.count}
                </span>
              </button>
            ))}
          </div>

          <label className="hc-surface-well flex h-11 flex-1 items-center gap-2 rounded-2xl border px-3 text-sm">
            <Search className="h-4 w-4 text-[color:var(--hc-muted-soft)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="파일 이름으로 검색"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[color:var(--hc-muted-soft)]"
            />
          </label>
        </section>

        {feedback ? (
          <div className="hc-feedback rounded-2xl border px-4 py-3 text-[12px]">
            {feedback}
          </div>
        ) : null}

        {error ? (
          <p className="text-[12px] text-[color:var(--hc-primary-strong)]">
            {error}
          </p>
        ) : null}

        {/* 그리드 */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="hc-surface-card flex gap-3 rounded-[20px] border p-4"
              >
                <div className="h-32 w-24 shrink-0 animate-pulse rounded-2xl bg-[color:var(--hc-surface-muted)]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[color:var(--hc-surface-muted)]" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-[color:var(--hc-surface-muted)]" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="hc-surface-card flex flex-col items-center gap-3 rounded-[20px] border p-8 text-center">
            <ImageIcon className="h-7 w-7 text-[color:var(--hc-muted-soft)]" />
            <p className="text-[13px] text-[color:var(--hc-muted)]">
              {search.trim() ? "검색 결과가 없어요." : emptyText}
            </p>
            {!search.trim() ? (
              <Link
                href="/shoot"
                className="hc-button-primary rounded-full px-4 py-2 text-[12px] font-semibold"
              >
                새 네 컷 만들기
              </Link>
            ) : null}
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {filteredItems.map((item) => {
              const preview = getUserMediaPreview(item, previewItems);
              const isVideo = item.mediaType === "VIDEO";

              return (
                <article
                  key={item.mediaId}
                  className="hc-surface-card flex flex-col gap-3 rounded-[20px] border p-4 sm:flex-row"
                >
                  <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-muted)] sm:h-32 sm:w-24">
                    {preview.url ? (
                      preview.kind === "video" ? (
                        <video
                          src={preview.url}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          controls={false}
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={preview.url}
                          alt={getUserMediaTitle(item)}
                          className="h-full w-full object-cover"
                        />
                      )
                    ) : (
                      <div className="grid h-full w-full place-items-center px-2 text-center text-[10px] text-[color:var(--hc-muted-soft)]">
                        미리보기를 준비하는 중이에요.
                      </div>
                    )}
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                      {isVideo ? (
                        <>
                          <Play
                            aria-hidden="true"
                            className="h-2.5 w-2.5"
                            fill="currentColor"
                          />
                          영상
                        </>
                      ) : (
                        <>
                          <ImageIcon aria-hidden="true" className="h-2.5 w-2.5" />
                          사진
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      {editingId === item.mediaId ? (
                        <div className="flex gap-2">
                          <input
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            className="hc-input h-9 flex-1 rounded-xl border px-3 text-[12px]"
                          />
                          <button
                            type="button"
                            onClick={() => void handleSaveName(item)}
                            disabled={savingNameId === item.mediaId}
                            className="hc-button-neutral rounded-full px-3 py-2 text-[11px] font-semibold disabled:opacity-50"
                          >
                            {savingNameId === item.mediaId ? "저장 중" : "저장"}
                          </button>
                        </div>
                      ) : (
                        <p className="truncate text-[15px] font-bold tracking-tight">
                          {getUserMediaTitle(item)}
                        </p>
                      )}

                      <p className="text-[11.5px] text-[color:var(--hc-muted-soft)]">
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleString("ko-KR")
                          : "생성 시간을 확인할 수 없어요."}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDownload(item)}
                        disabled={downloadingId === item.mediaId}
                        className="hc-button-primary flex min-w-[104px] flex-1 items-center justify-center gap-1 rounded-full px-3 py-2 text-[11px] font-semibold disabled:opacity-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>
                          {downloadingId === item.mediaId
                            ? "다운로드 중..."
                            : "다운로드"}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleShare(item)}
                        disabled={sharingId === item.mediaId}
                        className="hc-button-secondary flex min-w-[104px] flex-1 items-center justify-center gap-1 rounded-full border px-3 py-2 text-[11px] font-semibold disabled:opacity-50"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span>
                          {sharingId === item.mediaId
                            ? "링크 준비 중..."
                            : "공유하기"}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          editingId === item.mediaId
                            ? setEditingId(null)
                            : handleStartRename(item)
                        }
                        className="hc-button-secondary flex min-w-[104px] flex-1 items-center justify-center gap-1 rounded-full border px-3 py-2 text-[11px] font-semibold"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        <span>
                          {editingId === item.mediaId ? "취소" : "이름 수정"}
                        </span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
      <MobileTabBar />
    </main>
  );
}
