"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  EVENT_PREVIEW_MESSAGE,
  EVENT_PREVIEW_READY,
  type EventPreviewData,
  type EventPreviewScreen,
} from "@/components/participation/EventPreview";

type DeviceId = "phone" | "booth-portrait" | "booth-landscape";

const DEVICES: Record<DeviceId, { label: string; width: number; height: number }> = {
  phone: { label: "휴대폰", width: 390, height: 780 },
  "booth-portrait": { label: "세로 부스", width: 820, height: 1180 },
  "booth-landscape": { label: "가로 부스", width: 1280, height: 800 },
};

const PHONE_SCREENS: Array<{ id: EventPreviewScreen; label: string }> = [
  { id: "intro", label: "처음" },
  { id: "consent", label: "동의" },
  { id: "frame", label: "프레임" },
  { id: "capture", label: "촬영" },
  { id: "composing", label: "만드는 중" },
  { id: "done", label: "완성" },
  { id: "closed", label: "촬영 시간 아님" },
  { id: "error", label: "오류" },
  { id: "expired", label: "기간 지남" },
];

const BOOTH_SCREENS: Array<{ id: EventPreviewScreen; label: string }> = [
  { id: "booth-idle", label: "대기" },
  { id: "booth-consent", label: "동의" },
  { id: "booth-frame", label: "프레임" },
  { id: "booth-capture", label: "촬영" },
  { id: "booth-result", label: "QR 받기" },
];

const MAX_HEIGHT = 560;

/**
 * 게시 전에 참가자가 볼 화면을 그대로 본다(기획 R5 9절 — 휴대폰·세로/가로 부스와 오류 상태). 그림이 아니라 실제 화면
 * 컴포넌트를 기기 크기의 iframe 에 띄우므로, 저장 전의 색·글꼴·문구가 그 자리에서 반영된다. 사진은 시험 사진이다.
 */
export function StudioExperiencePreview({ data }: { data: EventPreviewData }) {
  const [device, setDevice] = useState<DeviceId>("phone");
  const [screen, setScreen] = useState<EventPreviewScreen>("intro");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(320);
  const [ready, setReady] = useState(false);

  const screens = device === "phone" ? PHONE_SCREENS : BOOTH_SCREENS;
  const spec = DEVICES[device];
  const scale = Math.min(boxWidth / spec.width, MAX_HEIGHT / spec.height, 1);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setBoxWidth(box.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const post = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: EVENT_PREVIEW_MESSAGE, data, screen }, window.location.origin);
  }, [data, screen]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === EVENT_PREVIEW_READY) setReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (ready) post();
  }, [ready, post]);

  const chooseDevice = (next: DeviceId) => {
    setDevice(next);
    // 같은 뜻의 화면을 유지한다. 없으면 그 기기의 첫 화면으로.
    const current = screen.replace(/^booth-/, "");
    const list = next === "phone" ? PHONE_SCREENS : BOOTH_SCREENS;
    const same = list.find((item) => item.id.replace(/^booth-/, "") === current);
    setScreen(same?.id ?? list[0].id);
  };

  return (
    <section aria-label="행사 화면 미리보기" className="flex flex-col gap-3">
      <div role="group" aria-label="기기" className="flex flex-wrap gap-1.5">
        {(Object.keys(DEVICES) as DeviceId[]).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={device === id}
            onClick={() => chooseDevice(id)}
            className="h-9 rounded-full border border-(--hc-border) px-3.5 text-[13px] font-semibold text-(--hc-muted) aria-pressed:border-transparent aria-pressed:bg-(--hc-text) aria-pressed:text-(--background)"
          >
            {DEVICES[id].label}
          </button>
        ))}
      </div>
      <div ref={boxRef} className="w-full">
        <div
          className="mx-auto overflow-hidden rounded-[18px] border border-(--hc-border) bg-(--hc-surface-well)"
          style={{ width: spec.width * scale, height: spec.height * scale }}
        >
          <iframe
            ref={iframeRef}
            src="/booth/preview"
            title={`${spec.label} 화면 미리보기`}
            tabIndex={-1}
            onLoad={post}
            className="pointer-events-none origin-top-left border-0"
            style={{ width: spec.width, height: spec.height, transform: `scale(${scale})` }}
          />
        </div>
      </div>
      <div role="group" aria-label="화면" className="flex flex-wrap gap-1.5">
        {screens.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={screen === item.id}
            onClick={() => setScreen(item.id)}
            className="h-9 rounded-full px-3 text-[13px] font-semibold text-(--hc-muted) aria-pressed:bg-(--hc-surface-highlight) aria-pressed:text-(--hc-text)"
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="text-[12px] leading-relaxed text-(--hc-muted)">
        사진은 시험 사진이에요. 프레임 위 장식이 사진에 겹치는 모양은 게시 뒤 시험 촬영으로 확인해 주세요.
      </p>
    </section>
  );
}
