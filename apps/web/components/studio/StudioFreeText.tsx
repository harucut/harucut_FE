"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronRight } from "lucide-react";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { getTextStyles } from "@/lib/event/eventApi";
import {
  FREE_TEXT_DEFAULT_MAX_LENGTH,
  FREE_TEXT_LIMITS,
  type FreeTextBox,
  type FreeTextSettings,
  type TextStyle,
} from "@/lib/event/freeText";

type Enabled = Extract<FreeTextSettings, { enabled: true }>;

const DEFAULT_BOX: FreeTextBox = { x: 0.1, y: 0.86, width: 0.8, height: 0.08 };

/** 칸이 이보다 작으면 글자가 들어가지 않는다. 드래그로 줄일 때의 하한이다. 서버 규칙은 아니다. */
const MIN_BOX_WIDTH = 0.1;
const MIN_BOX_HEIGHT = 0.03;
/** 화살표 한 번에 움직이는 양. */
const KEY_STEP = 0.01;

const BOX_FIELDS: Array<{ key: keyof FreeTextBox; label: string }> = [
  { key: "x", label: "왼쪽에서" },
  { key: "y", label: "위에서" },
  { key: "width", label: "너비" },
  { key: "height", label: "높이" },
];

/** 서버 규칙(D06)과 같은 검사. 저장은 막지 않는다 — 서버가 400 GEN-002 로 다시 본다. */
export function freeTextViolations(value: FreeTextSettings): string[] {
  if (!value.enabled) return [];
  const out: string[] = [];
  const { x, y, width, height } = value.box;
  if ([x, y, width, height].some((v) => !Number.isFinite(v) || v < 0 || v > 1)) out.push("문구 칸은 0~100% 안에서 정해 주세요.");
  if (width <= 0 || height <= 0) out.push("문구 칸의 너비와 높이는 0보다 커야 해요.");
  if (x + width > 1 + 1e-9 || y + height > 1 + 1e-9) out.push("문구 칸이 프레임 밖으로 나가요.");
  if (value.styleIds.length === 0) out.push("글꼴을 하나 이상 골라 주세요.");
  const [minLen, maxLen] = FREE_TEXT_LIMITS.maxLength;
  if (value.maxLength !== undefined && (value.maxLength < minLen || value.maxLength > maxLen))
    out.push(`글자 수는 ${minLen}~${maxLen}자로 정해 주세요.`);
  const [minLines, maxLines] = FREE_TEXT_LIMITS.maxLines;
  if (value.maxLines !== undefined && (value.maxLines < minLines || value.maxLines > maxLines))
    out.push(`줄 수는 ${minLines}~${maxLines}줄로 정해 주세요.`);
  return out;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 1000) / 1000;

/** 칸을 프레임 안으로 되돌린다. 작은 칸을 끝으로 밀어도 크기가 줄지 않게 위치를 먼저 맞춘다. */
function moved(box: FreeTextBox, dx: number, dy: number): FreeTextBox {
  return {
    ...box,
    x: round(clamp(box.x + dx, 0, 1 - box.width)),
    y: round(clamp(box.y + dy, 0, 1 - box.height)),
  };
}

function resized(box: FreeTextBox, dw: number, dh: number): FreeTextBox {
  return {
    ...box,
    width: round(clamp(box.width + dw, MIN_BOX_WIDTH, 1 - box.x)),
    height: round(clamp(box.height + dh, MIN_BOX_HEIGHT, 1 - box.y)),
  };
}

/**
 * 프레임 위에서 문구 칸을 잡는다. 손가락과 칸이 1:1 로 움직이고, 잡은 지점이 유지된다(시작 위치 + 이동량으로 계산한다).
 * 포인터를 붙잡아(setPointerCapture) 밖으로 나가도 따라온다. 키보드는 화살표로 옮기고 Shift+화살표로 크기를 바꾼다.
 */
function FreeTextBoxEditor({
  box,
  aspect,
  frameUrl,
  disabled,
  onChange,
}: {
  box: FreeTextBox;
  aspect: number;
  frameUrl?: string;
  disabled?: boolean;
  onChange: (box: FreeTextBox) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<null | { mode: "move" | "resize"; pointerId: number; startX: number; startY: number; start: FreeTextBox }>(null);

  const begin = (event: PointerEvent<HTMLElement>, mode: "move" | "resize") => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, start: box };
  };

  const track = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const surface = surfaceRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !surface) return;
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = (event.clientX - drag.startX) / rect.width;
    const dy = (event.clientY - drag.startY) / rect.height;
    onChange(drag.mode === "move" ? moved(drag.start, dx, dy) : resized(drag.start, dx, dy));
  };

  const end = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const delta = step[event.key];
    if (!delta) return;
    event.preventDefault();
    onChange(event.shiftKey ? resized(box, delta[0], delta[1]) : moved(box, delta[0], delta[1]));
  };

  const percent = (value: number) => `${Math.round(value * 1000) / 10}%`;

  return (
    <div
      ref={surfaceRef}
      className={`relative shrink-0 self-center overflow-visible rounded-md border border-(--hc-border) bg-(--hc-surface-well) sm:self-start ${
        aspect < 1 ? "w-44" : "w-72 max-w-full"
      }`}
      style={{ aspectRatio: String(aspect) }}
    >
      {frameUrl ? (
        // 서명 URL 이라 next/image 최적화를 거치지 않는다.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frameUrl} alt="" className="pointer-events-none absolute inset-0 size-full object-contain" />
      ) : null}
      <div
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-label={`문구 칸. 왼쪽 ${percent(box.x)}, 위 ${percent(box.y)}, 너비 ${percent(box.width)}, 높이 ${percent(box.height)}. 화살표로 옮기고 Shift와 화살표로 크기를 바꿔요.`}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => begin(event, "move")}
        onPointerMove={track}
        onPointerUp={end}
        onPointerCancel={end}
        className={`absolute touch-none select-none rounded-sm border-2 border-(--hc-primary-strong) bg-(--hc-accent-soft-bg) ${
          disabled ? "" : "cursor-grab active:cursor-grabbing"
        }`}
        style={{
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.width * 100}%`,
          height: `${box.height * 100}%`,
        }}
      >
        {disabled ? null : (
          <span
            aria-hidden
            onPointerDown={(event) => begin(event, "resize")}
            onPointerMove={track}
            onPointerUp={end}
            onPointerCancel={end}
            className="absolute -bottom-3 -right-3 flex size-6 cursor-nwse-resize touch-none items-center justify-center"
          >
            <span className="size-3 rounded-full border-2 border-(--hc-primary-strong) bg-(--hc-surface)" />
          </span>
        )}
      </div>
    </div>
  );
}

/** 숫자 칸. 고치는 동안에는 비울 수 있고, 칸을 떠나면 실제 값으로 돌아온다. 비운 값을 0 으로 저장하지 않는다. */
function NumberField({
  label,
  name,
  value,
  min,
  max,
  step,
  decimal,
  disabled,
  className,
  onCommit,
}: {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimal?: boolean;
  disabled?: boolean;
  className?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex flex-col gap-1 text-[12px] font-semibold">
      {label}
      <input
        type="number"
        name={name}
        inputMode={decimal ? "decimal" : "numeric"}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={draft ?? String(value)}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          const parsed = Number(text);
          if (text.trim() !== "" && Number.isFinite(parsed)) onCommit(parsed);
        }}
        onBlur={() => setDraft(null)}
        className={`hc-input h-11 rounded-xl border px-3 text-[14px] font-normal ${className ?? ""}`}
      />
    </label>
  );
}

/**
 * 참가자 자유 문구(D06). 켜면 참가자가 사진에 넣을 문구를 직접 쓰고 서버가 정해진 칸에 같은 글꼴로 그린다.
 * 칸은 캔버스 대비 비율이라 레이아웃이 달라도 같은 자리다 — 프레임 위에서 끌어 잡고, 숫자는 접어 둔다.
 * 끄기는 {enabled:false} 를 보낸다(위 단계 기본값이 켰어도 이 행사만 끈다). 「기본값 따르기」는 null.
 */
export function StudioFreeText({
  value,
  onChange,
  canvasAspect,
  frameUrl,
  disabled,
}: {
  value: FreeTextSettings;
  onChange: (value: FreeTextSettings) => void;
  /** 미리 보기 상자 비율(가로/세로) — 기본 프레임(없으면 첫 허용 레이아웃)의 캔버스. */
  canvasAspect: number;
  /** 기본 프레임 그림. 없으면 빈 바탕 위에서 잡는다. */
  frameUrl?: string;
  disabled?: boolean;
}) {
  const [styles, setStyles] = useState<TextStyle[] | null>(null);
  const [stylesError, setStylesError] = useState<string | null>(null);

  const loadStyles = useCallback((signal?: AbortSignal) => {
    getTextStyles(signal)
      .then((list) => {
        setStyles(list);
        setStylesError(null);
      })
      .catch((cause) => {
        if (!signal?.aborted) setStylesError(getUserFacingApiErrorMessage(cause, "글꼴 목록을 불러오지 못했어요."));
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadStyles(controller.signal);
    return () => controller.abort();
  }, [loadStyles]);

  const enable = (on: boolean) =>
    onChange(
      on
        ? {
            enabled: true,
            box: DEFAULT_BOX,
            styleIds: styles?.[0] ? [styles[0].id] : [],
            maxLength: FREE_TEXT_DEFAULT_MAX_LENGTH,
            maxLines: 1,
          }
        : { enabled: false },
    );
  const patch = (next: Partial<Enabled>) => value.enabled && onChange({ ...value, ...next });
  const violations = freeTextViolations(value);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-11 items-center gap-2 text-[14px]">
        <input
          type="checkbox"
          name="freeTextEnabled"
          className="size-5"
          checked={value.enabled}
          // 글꼴 목록이 오기 전에 켜면 기본 글꼴을 못 고른다. 끄기는 언제든 된다.
          disabled={disabled || (!value.enabled && !styles && !stylesError)}
          onChange={(e) => enable(e.target.checked)}
        />
        참가자가 문구를 직접 써요
      </label>

      {value.enabled ? (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <FreeTextBoxEditor
              box={value.box}
              aspect={canvasAspect}
              frameUrl={frameUrl}
              disabled={disabled}
              onChange={(box) => patch({ box })}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="max-w-[65ch] text-[13px] text-(--hc-muted)">
                칸을 끌어 옮기고, 오른쪽 아래 점을 끌어 크기를 바꿔요. 참가자가 쓴 글자는 이 칸 안에 맞춰 그려요.
              </p>
              <details className="group">
                <summary className="flex h-11 w-fit cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-(--hc-muted) transition hover:text-(--hc-text) [&::-webkit-details-marker]:hidden">
                  <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
                  숫자로 정하기
                </summary>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {BOX_FIELDS.map((field) => (
                    <NumberField
                      key={field.key}
                      label={`${field.label}(%)`}
                      name={`freeTextBox-${field.key}`}
                      min={0}
                      max={100}
                      step={1}
                      decimal
                      disabled={disabled}
                      value={Math.round(value.box[field.key] * 1000) / 10}
                      onCommit={(percent) => patch({ box: { ...value.box, [field.key]: percent / 100 } })}
                    />
                  ))}
                </div>
              </details>
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-semibold">고를 수 있는 글꼴</legend>
            {stylesError ? (
              <div className="flex flex-col items-start gap-2">
                <p role="alert" className="text-[13px] text-(--hc-danger)">
                  {stylesError}
                </p>
                <button
                  type="button"
                  onClick={() => loadStyles()}
                  className="h-11 rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold transition hover:border-(--hc-border-strong)"
                >
                  다시 시도
                </button>
              </div>
            ) : !styles ? (
              <p role="status" className="text-[13px] text-(--hc-muted)">
                글꼴을 불러오는 중…
              </p>
            ) : (
              <div className="grid gap-1 sm:grid-cols-2">
                {styles.map((style) => (
                  <label key={style.id} className="flex min-h-11 items-center gap-2 text-[14px]">
                    <input
                      type="checkbox"
                      name="freeTextStyle"
                      value={style.id}
                      className="size-5"
                      disabled={disabled}
                      checked={value.styleIds.includes(style.id)}
                      onChange={(e) =>
                        patch({
                          // 서버 목록 순서를 지킨다 — 참가자 화면은 첫 글꼴을 기본으로 고른다.
                          styleIds: styles
                            .map((s) => s.id)
                            .filter((id) => (id === style.id ? e.target.checked : value.styleIds.includes(id))),
                        })
                      }
                    />
                    <span
                      aria-hidden
                      className="inline-block size-4 rounded-full border border-(--hc-border)"
                      style={{ background: style.color }}
                    />
                    <span style={{ fontWeight: style.weight }}>{style.label}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="flex flex-wrap gap-3">
            <NumberField
              label="최대 글자 수"
              name="freeTextMaxLength"
              min={FREE_TEXT_LIMITS.maxLength[0]}
              max={FREE_TEXT_LIMITS.maxLength[1]}
              disabled={disabled}
              className="w-28"
              value={value.maxLength ?? FREE_TEXT_DEFAULT_MAX_LENGTH}
              onCommit={(n) => patch({ maxLength: Math.trunc(n) })}
            />
            <NumberField
              label="최대 줄 수"
              name="freeTextMaxLines"
              min={FREE_TEXT_LIMITS.maxLines[0]}
              max={FREE_TEXT_LIMITS.maxLines[1]}
              disabled={disabled}
              className="w-28"
              value={value.maxLines ?? 1}
              onCommit={(n) => patch({ maxLines: Math.trunc(n) })}
            />
          </div>

          {violations.length > 0 ? (
            <ul role="alert" className="flex flex-col gap-0.5 text-[12px] text-(--hc-danger)">
              {violations.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
