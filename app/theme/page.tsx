"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FrameId } from "@/constants/frames";
import { FramePreview } from "@/components/frame/FramePreview";
import { FramePicker } from "@/components/frame/FramePicker";
import { PageHeader } from "@/components/layout/PageHeader";
import { frameIdFromFrameType, matchesFrameType } from "@/lib/frameApi";
import { listMyFrames } from "@/lib/remoteFrameApi";
import { useThemeDraftStore } from "@/lib/themeDraftStore";
import { useThemeSession } from "@/lib/themeSessionStore";
import type { RemoteFrame } from "@/lib/api-types";

export default function ThemePage() {
  const router = useRouter();
  const {
    frameId,
    setFrameId,
    setDraftId,
    setRemoteFrameId,
    reset,
  } = useThemeSession();
  const drafts = useThemeDraftStore((s) => s.drafts);

  const [selectedFrameId, setSelectedFrameId] = useState<FrameId>(
    frameId ?? "classic-4",
  );
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [remoteFrames, setRemoteFrames] = useState<RemoteFrame[]>([]);
  const [isLoadingFrames, setIsLoadingFrames] = useState(true);
  const [framesError, setFramesError] = useState<string | null>(null);

  useEffect(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    let cancelled = false;

    async function loadFrames() {
      setIsLoadingFrames(true);
      setFramesError(null);

      try {
        const frames = await listMyFrames();
        if (!cancelled) {
          setRemoteFrames(frames);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setFramesError("저장한 프레임을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFrames(false);
        }
      }
    }

    loadFrames();
    return () => {
      cancelled = true;
    };
  }, []);

  const allowedDraftId =
    selectedDraftId &&
    drafts.some(
      (draft) => draft.id === selectedDraftId && draft.frameId === selectedFrameId,
    )
      ? selectedDraftId
      : null;

  const matchingRemoteFrames = useMemo(
    () =>
      remoteFrames.filter((frame) =>
        matchesFrameType(selectedFrameId, frame.frameType),
      ),
    [remoteFrames, selectedFrameId],
  );

  const handleConfirmNewFrame = () => {
    setFrameId(selectedFrameId);
    setDraftId(allowedDraftId);
    setRemoteFrameId(null);
    router.push("/theme/sticker");
  };

  const handleOpenRemoteFrame = (frame: RemoteFrame) => {
    setFrameId(frameIdFromFrameType(frame.frameType));
    setDraftId(null);
    setRemoteFrameId(frame.frameId);
    router.push("/theme/sticker");
  };

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-2 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <PageHeader
          title="프레임 꾸미기"
          backHref="/home"
          backLabel="처음으로"
          description={<>새 프레임을 만들거나 저장한 프레임을 이어서 수정할 수 있어요.</>}
        />

        <FramePicker
          selectedFrameId={selectedFrameId}
          onChangeSelected={setSelectedFrameId}
          onConfirm={handleConfirmNewFrame}
          confirmLabel="새 프레임 만들기"
          drafts={drafts}
          selectedDraftId={allowedDraftId}
          onSelectDraft={setSelectedDraftId}
        />

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">저장한 프레임</h2>
              <p className="mt-1 text-[11px] text-zinc-500">
                선택한 레이아웃과 같은 타입의 프레임만 보여줍니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsLoadingFrames(true);
                setFramesError(null);
                listMyFrames()
                  .then((frames) => setRemoteFrames(frames))
                  .catch((error) => {
                    console.error(error);
                    setFramesError("저장한 프레임을 불러오지 못했습니다.");
                  })
                  .finally(() => setIsLoadingFrames(false));
              }}
              className="rounded-full border border-zinc-700 px-3 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
            >
              새로고침
            </button>
          </div>

          {framesError ? (
            <p className="mt-3 text-[11px] text-red-300">{framesError}</p>
          ) : null}

          {isLoadingFrames ? (
            <p className="mt-3 text-[11px] text-zinc-500">불러오는 중...</p>
          ) : matchingRemoteFrames.length === 0 ? (
            <p className="mt-3 text-[11px] text-zinc-500">
              이 레이아웃으로 저장된 프레임이 아직 없습니다.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3">
              {matchingRemoteFrames.map((frame) => (
                <button
                  key={frame.frameId}
                  type="button"
                  onClick={() => handleOpenRemoteFrame(frame)}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 text-left hover:border-emerald-400/80"
                >
                  <div className="flex gap-3">
                    <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                      {frame.source ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={frame.source}
                          alt={frame.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <FramePreview frameId={frameIdFromFrameType(frame.frameType)} />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                      <div>
                        <p className="truncate text-sm font-semibold text-zinc-100">
                          {frame.title || `프레임 #${frame.frameId}`}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">
                          {frame.description || "저장된 프레임을 이어서 수정합니다."}
                        </p>
                      </div>
                      <span className="text-[10px] text-emerald-300">
                        불러와서 수정하기
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
