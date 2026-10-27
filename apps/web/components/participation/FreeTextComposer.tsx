"use client";

import { useEffect, useId, useState } from "react";
import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
import { previewFreeText } from "@/lib/event/eventApi";
import {
  freeTextErrorMessage,
  freeTextLength,
  localFreeTextProblem,
  type PublicFreeText,
  type TextPreview,
} from "@/lib/event/freeText";
import type { EventFrameRef } from "@/lib/event/types";

export type FreeTextValue = { text: string; styleId: string };

/** 입력이 멈춘 뒤 미리보기를 부르기까지. 서버는 참가자당 분당 30회까지 받는다. */
export const FREE_TEXT_PREVIEW_DELAY_MS = 400;

/**
 * 참가자 자유 문구(D06). 문구와 글꼴만 고르고, 미리보기는 최종 합성과 같은 서버 렌더 PNG 다 — 화면에서 따로
 * 그리지 않는다(브라우저 글꼴로 그리면 결과와 달라진다). 비워 두면 프레임 그대로 만든다.
 */
export function FreeTextComposer({
  config,
  token,
  eventId,
  frame,
  value,
  onChange,
  disabled,
}: {
  config: PublicFreeText;
  token: string;
  eventId: string;
  frame: EventFrameRef;
  value: FreeTextValue;
  onChange: (value: FreeTextValue) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const { text, styleId } = value;
  const problem = text === "" ? null : localFreeTextProblem(text, config);
  // 결과는 「어느 입력에 대한 것인지」와 함께 둔다. 지금 입력과 다른 결과는 보이지 않는다 — 늦은 응답도 여기서 걸러진다.
  const wanted = text.trim() !== "" && !problem && styleId !== "";
  const key = wanted ? JSON.stringify([frame.frameVersionId, styleId, text]) : null;
  const [result, setResult] = useState<{ key: string; preview?: TextPreview; error?: string } | null>(null);
  const current = result && result.key === key ? result : null;
  const preview = current?.preview ?? null;
  const previewError = current?.error ?? null;
  const loading = key !== null && current === null;

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      previewFreeText(token, eventId, { frameVersionId: frame.frameVersionId, text, styleId }, controller.signal)
        .then((rendered) => {
          // 서버가 돌려준 text·styleId 가 이 요청과 다르면 버린다(계약: 늦은 응답이 새 미리보기를 덮지 않게).
          if (rendered.text !== text || rendered.styleId !== styleId) return;
          setResult({ key, preview: rendered });
        })
        .catch((cause) => {
          if (controller.signal.aborted) return;
          setResult({
            key,
            error:
              freeTextErrorMessage(cause) ??
              (getApiErrorDetails(cause).code === "GEN-061"
                ? "미리보기를 너무 자주 불렀어요. 잠시 뒤 다시 보여 드릴게요."
                : getUserFacingApiErrorMessage(cause, "미리보기를 만들지 못했어요. 그래도 사진은 만들 수 있어요.")),
          });
        });
    }, FREE_TEXT_PREVIEW_DELAY_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [key, token, eventId, frame.frameVersionId, text, styleId]);

  const multiline = config.maxLines > 1;
  const inputClass =
    "w-full rounded-xl border border-(--ev-border) bg-(--ev-card) px-3 text-[16px] disabled:opacity-60";
  const help = problem ?? previewError;

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={`${id}-title`} className="text-[16px] font-bold">
          사진에 넣을 문구
        </h2>
        <span className="text-[12px] tabular-nums text-(--ev-muted)" aria-live="polite">
          {freeTextLength(text)}/{config.maxLength}자
        </span>
      </div>
      <p className="text-[13px] text-(--ev-muted)">비워 두면 프레임에 있는 그대로 만들어요.</p>
      {multiline ? (
        <textarea
          aria-labelledby={`${id}-title`}
          aria-describedby={help ? `${id}-help` : undefined}
          aria-invalid={Boolean(problem)}
          rows={config.maxLines}
          value={text}
          disabled={disabled}
          onChange={(e) => onChange({ text: e.target.value, styleId })}
          className={`${inputClass} py-2`}
        />
      ) : (
        <input
          type="text"
          enterKeyHint="done"
          aria-labelledby={`${id}-title`}
          aria-describedby={help ? `${id}-help` : undefined}
          aria-invalid={Boolean(problem)}
          value={text}
          disabled={disabled}
          onChange={(e) => onChange({ text: e.target.value, styleId })}
          className={`${inputClass} h-12`}
        />
      )}

      {config.styles.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-semibold">글꼴</legend>
          <div className="flex flex-wrap gap-2">
            {config.styles.map((style) => (
              <label
                key={style.id}
                className={`flex min-h-11 items-center gap-2 rounded-full border px-3 text-[14px] ${
                  styleId === style.id ? "border-(--ev-accent)" : "border-(--ev-border)"
                }`}
              >
                <input
                  type="radio"
                  name={`${id}-style`}
                  className="size-4"
                  checked={styleId === style.id}
                  disabled={disabled}
                  onChange={() => onChange({ text, styleId: style.id })}
                />
                <span
                  aria-hidden
                  className="inline-block size-4 rounded-full border border-(--ev-border)"
                  style={{ background: style.color }}
                />
                <span style={{ fontWeight: style.weight }}>{style.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {help ? (
        <p id={`${id}-help`} role="alert" className="text-[13px] text-(--ev-danger)">
          {help}
        </p>
      ) : null}

      {preview ? (
        <PreviewCanvas preview={preview} frameUrl={frame.previewUrl} />
      ) : loading ? (
        <p role="status" className="text-[13px] text-(--ev-muted)">
          미리보기를 만드는 중…
        </p>
      ) : null}
    </section>
  );
}

/** 프레임 미리보기 위에 서버가 구운 문구 PNG 를 그 자리(캔버스 px → 비율)에 겹친다. 프레임 그림이 없으면 문구만. */
function PreviewCanvas({ preview, frameUrl }: { preview: TextPreview; frameUrl?: string }) {
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  if (!frameUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={preview.image} alt={`미리보기: ${preview.text}`} className="max-h-40 self-center rounded-lg bg-(--ev-card)" />
    );
  }
  return (
    <div
      className="relative mx-auto w-full max-w-60 overflow-hidden rounded-lg border border-(--ev-border)"
      style={{ aspectRatio: `${preview.canvasWidth} / ${preview.canvasHeight}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={frameUrl} alt="" className="absolute inset-0 size-full object-cover" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview.image}
        alt={`미리보기: ${preview.text}`}
        className="absolute"
        style={{
          left: pct(preview.x, preview.canvasWidth),
          top: pct(preview.y, preview.canvasHeight),
          width: pct(preview.width, preview.canvasWidth),
          height: pct(preview.height, preview.canvasHeight),
        }}
      />
    </div>
  );
}
