"use client";

import { useEffect, useMemo, useState } from "react";
import { DEMO_PHOTOS } from "@/constants/demoPhotos";
import { BoothIdleView, BoothResultView } from "@/components/participation/BoothScreen";
import {
  CAPTURE_GUIDE_DEFAULT,
  CAPTURE_TOP_BAR_CLASS,
  CameraProblem,
  CaptureGauge,
  ConsentStep,
  FrameStep,
  HomeStep,
  IntroStep,
  captureBandClass,
  captureRailClass,
  captureStageClass,
  slotAspectOf,
  viewfinderClass,
  viewfinderStyle,
  viewfinderWrapClass,
} from "@/components/participation/EventParticipation";
import {
  EventActionBar,
  EventButton,
  EventContact,
  EventLogo,
  EventSurface,
  EventTitle,
  useEventCopy,
} from "@/components/participation/EventSurface";
import { DevelopingPlaceholder } from "@/components/participation/DevelopingPhoto";
import { FrameWithPhotos, frameFitStyle, frameIsTall } from "@/components/participation/FrameWithPhotos";
import type { ResolvedPageTheme } from "@/lib/event/pageTheme";
import { RESULT_FAILED_RETAKE_COPY, pageThemeCopy } from "@/lib/event/pageTheme";
import type { ConsentItem, EventFrameRef, PublicEvent } from "@/lib/event/types";

/** Studio → iframe 메시지. 같은 출처에서만 받는다. */
export const EVENT_PREVIEW_MESSAGE = "harucut:event-preview";
export const EVENT_PREVIEW_READY = "harucut:event-preview-ready";

export type EventPreviewScreen =
  | "intro"
  | "consent"
  | "frame"
  | "capture"
  | "composing"
  | "done"
  | "error"
  | "expired"
  | "closed"
  | "revisit"
  | "camera-error"
  | "booth-idle"
  | "booth-consent"
  | "booth-frame"
  | "booth-capture"
  | "booth-result"
  | "booth-closed";

export type EventPreviewData = {
  name: string;
  theme: ResolvedPageTheme | null;
  frames: EventFrameRef[];
  consentItems: ConsentItem[];
};

const noop = () => {};

function toEvent(data: EventPreviewData, captureOpen: boolean): PublicEvent {
  return {
    eventId: "preview",
    name: data.name,
    status: "LIVE",
    captureOpen,
    byodEnabled: true,
    boothEnabled: true,
    experienceVersion: 0,
    allowedLayouts: ["CLASSIC", "WIDE", "GRID", "POLAROID"],
    frames: data.frames,
    consentItems: data.consentItems,
    theme: data.theme ?? undefined,
    freeText: null,
  };
}

/**
 * 프레임 칸에 시험 사진을 넣은 완성 예시. 실제 참가자 사진을 쓰지 않는다(기획 R5 — 미리보기에는 시험 사진).
 * 칸 위 글자·스티커가 사진과 어떻게 겹치는지 여기서 보인다. 마지막 확인은 시험 촬영으로 한다.
 */
function SamplePhoto({ frame, className }: { frame: EventFrameRef | null; className?: string }) {
  return (
    <FrameWithPhotos
      frame={frame ?? { layoutType: "CLASSIC" }}
      photos={DEMO_PHOTOS}
      className={`rounded-xl bg-white shadow-[0_14px_34px_rgba(0,0,0,0.18)] ${className ?? ""}`}
      style={frameFitStyle(frame?.layoutType ?? "CLASSIC")}
    />
  );
}

function CapturePreview({ frame, booth }: { frame: EventFrameRef | null; booth: boolean }) {
  const ratio = slotAspectOf(frame);
  const wide = ratio >= 1;
  const guide = useEventCopy("captureGuide", CAPTURE_GUIDE_DEFAULT);
  return (
    <section className={captureStageClass(booth, wide)}>
      <div className={CAPTURE_TOP_BAR_CLASS}>
        <span className={`font-semibold text-(--ev-muted) ${booth ? "text-[clamp(1rem,2.2vmin,1.25rem)]" : "text-[14px]"}`}>
          {booth ? "처음으로" : "뒤로"}
        </span>
        <CaptureGauge previews={[DEMO_PHOTOS[0], null, null, null]} nextEmpty={1} ratio={ratio} booth={booth} />
      </div>
      <div className={viewfinderWrapClass(wide)}>
        <div className={viewfinderClass(wide)} style={viewfinderStyle(ratio)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={DEMO_PHOTOS[1]} alt="" className="size-full object-cover" />
        </div>
      </div>
      <div className={captureRailClass(wide)}>
        <div className={captureBandClass(booth, wide)}>
          <p className={`break-keep text-(--ev-muted) ${booth ? "text-[clamp(1.125rem,3vmin,1.75rem)]" : "text-[14px]"}`}>{guide}</p>
        </div>
        <EventButton size={booth ? "booth" : "xl"}>이어서 찍기</EventButton>
      </div>
    </section>
  );
}

function ResultPreview({ data, kind }: { data: EventPreviewData; kind: "composing" | "done" | "error" | "expired" }) {
  const done = useEventCopy("done", "사진이 완성됐어요.");
  const composing = useEventCopy("composing", "사진을 만들고 있어요. 이 화면을 열어 두면 준비되는 대로 보여 드려요.");
  const failed = useEventCopy("error", RESULT_FAILED_RETAKE_COPY);
  const expired = useEventCopy("expired", "사진을 받을 수 있는 기간이 지났어요.");
  const frame = data.frames.find((f) => f.isDefault) ?? data.frames[0] ?? null;
  return (
    <div className="flex w-full max-w-md flex-1 flex-col gap-4 self-center px-5 pt-5">
      <EventLogo />
      <div className="ev-readable">
        <EventTitle className="text-[clamp(1.5rem,6.4vw,1.875rem)]">{data.name}</EventTitle>
      </div>
      {kind === "composing" ? (
        <div className="flex flex-col items-center gap-4">
          <div aria-hidden className="flex h-[52svh] w-full items-center justify-center [container-type:size]">
            {frame?.previewUrl ? (
              <FrameWithPhotos
                frame={frame}
                photos={DEMO_PHOTOS}
                className="ev-developing rounded-xl shadow-[0_14px_34px_rgba(0,0,0,0.18)]"
                style={frameFitStyle(frame.layoutType)}
              />
            ) : (
              <DevelopingPlaceholder />
            )}
          </div>
          <p className="break-keep text-center text-[15px] leading-relaxed text-(--ev-muted)">{composing}</p>
        </div>
      ) : null}
      {kind === "done" ? (
        <>
          <p className="ev-readable break-keep text-[16px] leading-relaxed">{done}</p>
          <div className="flex h-[56svh] items-center justify-center [container-type:size]">
            <SamplePhoto frame={frame} />
          </div>
          <EventActionBar>
            <EventButton>사진 저장</EventButton>
          </EventActionBar>
        </>
      ) : null}
      {kind === "error" ? (
        <>
          <p className="break-keep text-[16px] font-semibold leading-relaxed text-(--ev-danger)">{failed}</p>
          <EventContact />
          <EventActionBar>
            <EventButton>다시 찍기</EventButton>
          </EventActionBar>
        </>
      ) : null}
      {kind === "expired" ? (
        <>
          <p className="break-keep text-[16px] leading-relaxed text-(--ev-muted)">{expired}</p>
          <EventContact />
        </>
      ) : null}
    </div>
  );
}

function PreviewBody({ data, screen }: { data: EventPreviewData; screen: EventPreviewScreen }) {
  const frame = data.frames.find((f) => f.isDefault) ?? data.frames[0] ?? null;
  const open = useMemo(() => toEvent(data, true), [data]);
  const closed = useMemo(() => toEvent(data, false), [data]);
  const phoneShell = (children: React.ReactNode, compact = true) => (
    <div className="flex w-full max-w-md flex-1 flex-col gap-4 self-center px-5 pt-5">
      {compact ? (
        <header className="flex min-h-9 items-center gap-2.5">
          <EventLogo className="h-7 w-auto max-w-[40%] shrink-0 object-contain" />
          <h1 className="min-w-0 truncate text-[15px] font-bold">{data.name}</h1>
        </header>
      ) : (
        <EventLogo />
      )}
      {children}
    </div>
  );
  const boothShell = (children: React.ReactNode, title = true) => (
    <div className="flex w-full flex-1 flex-col gap-[clamp(1rem,2.5vmin,2rem)] px-[clamp(1.25rem,4vmin,3.5rem)] pt-[clamp(1.25rem,3vmin,2.5rem)]">
      <header className="flex min-h-11 items-center gap-3">
        <EventLogo className="h-[clamp(2.25rem,5vmin,3.5rem)] w-auto max-w-[40vw] shrink-0 object-contain" />
        {title ? <h1 className="min-w-0 truncate text-[clamp(1rem,2.4vmin,1.5rem)] font-bold">{data.name}</h1> : null}
      </header>
      {children}
    </div>
  );
  switch (screen) {
    case "intro":
      return phoneShell(<IntroStep event={open} frames={data.frames} busy={false} onJoin={noop} />, false);
    case "closed":
      return phoneShell(<IntroStep event={closed} frames={data.frames} busy={false} onJoin={noop} />, false);
    case "revisit":
      return phoneShell(
        <HomeStep
          event={open}
          frames={data.frames}
          results={[{ jobId: 1, status: "DONE" }, { jobId: 2, status: "PENDING" }]}
          onStart={noop}
          onShare={noop}
          onDownload={noop}
          onRevoke={noop}
          onWithdraw={noop}
          onRefresh={noop}
        />,
        false,
      );
    case "camera-error":
      return phoneShell(<CameraProblem state="denied" booth={false} onRetry={noop} onLeave={noop} leaveLabel="뒤로" />);
    case "consent":
      return phoneShell(<ConsentStep items={data.consentItems} onSubmit={noop} />);
    case "frame":
      return phoneShell(<FrameStep frames={data.frames} selected={frame} onSelect={noop} onNext={noop} />);
    case "capture":
      return <CapturePreview frame={frame} booth={false} />;
    case "composing":
    case "done":
    case "error":
    case "expired":
      return <ResultPreview data={data} kind={screen} />;
    case "booth-idle":
      return boothShell(<BoothIdleView event={open} frames={data.frames} busy={false} onStart={noop} />, false);
    case "booth-closed":
      return boothShell(<BoothIdleView event={closed} frames={data.frames} busy={false} onStart={noop} />, false);
    case "booth-consent":
      return boothShell(
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
          <ConsentStep variant="booth" items={data.consentItems} onSubmit={noop} />
        </div>,
      );
    case "booth-frame":
      return boothShell(<FrameStep variant="booth" frames={data.frames} selected={frame} onSelect={noop} onNext={noop} />);
    case "booth-capture":
      return <CapturePreview frame={frame} booth />;
    case "booth-result":
      return boothShell(
        <BoothResultView
          photo={<SamplePhoto frame={frame} />}
          tall={frame ? frameIsTall(frame.layoutType) : true}
          resultLink="미리보기 화면의 예시 QR 입니다"
          message={pageThemeCopy(data.theme, "done", "사진이 완성됐어요.")}
          armed={false}
          onNext={noop}
        />,
      );
  }
}

/** iframe 안쪽. 부모가 보낸 값만 그린다. 누르는 것은 막아 둔다 — 미리보기에서 동의가 저장되는 일이 없어야 한다(아무 요청도 나가지 않는다). */
export function EventPreviewHost() {
  const [message, setMessage] = useState<{ data: EventPreviewData; screen: EventPreviewScreen } | null>(null);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== EVENT_PREVIEW_MESSAGE) return;
      setMessage({ data: event.data.data, screen: event.data.screen });
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: EVENT_PREVIEW_READY }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  if (!message) return <main className="ev-surface min-h-dvh" />;
  return (
    <EventSurface theme={message.data.theme} className="flex min-h-dvh flex-col">
      <PreviewBody data={message.data} screen={message.screen} />
    </EventSurface>
  );
}
