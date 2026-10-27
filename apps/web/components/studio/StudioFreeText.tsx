"use client";

import { useEffect, useState } from "react";
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

/**
 * 참가자 자유 문구(D06). 켜면 참가자가 사진에 넣을 문구를 직접 쓰고 서버가 정해진 칸에 같은 글꼴로 그린다.
 * 칸은 캔버스 대비 비율이라 레이아웃이 달라도 같은 자리다 — 화면에는 %로 보여 준다.
 * 끄기는 {enabled:false} 를 보낸다(위 단계 기본값이 켰어도 이 행사만 끈다). 「기본값 따르기」는 null.
 */
export function StudioFreeText({
  value,
  onChange,
  canvasAspect,
  disabled,
}: {
  value: FreeTextSettings;
  onChange: (value: FreeTextSettings) => void;
  /** 미리 보기 상자 비율(가로/세로) — 첫 허용 레이아웃의 캔버스. */
  canvasAspect: number;
  disabled?: boolean;
}) {
  const [styles, setStyles] = useState<TextStyle[] | null>(null);
  const [stylesError, setStylesError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getTextStyles(controller.signal)
      .then(setStyles)
      .catch((cause) => {
        if (!controller.signal.aborted) setStylesError(getUserFacingApiErrorMessage(cause, "글꼴 목록을 불러오지 못했어요."));
      });
    return () => controller.abort();
  }, []);

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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="grid flex-1 grid-cols-2 gap-2">
              {BOX_FIELDS.map((field) => (
                <label key={field.key} className="flex flex-col gap-1 text-[12px] font-semibold">
                  {field.label}(%)
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={1}
                    disabled={disabled}
                    value={Math.round(value.box[field.key] * 1000) / 10}
                    onChange={(e) => {
                      const percent = Number(e.target.value);
                      if (e.target.value.trim() !== "" && Number.isFinite(percent))
                        patch({ box: { ...value.box, [field.key]: percent / 100 } });
                    }}
                    className="hc-input h-11 rounded-xl border px-3 text-[14px] font-normal"
                  />
                </label>
              ))}
            </div>
            <div
              aria-hidden
              className="relative w-24 shrink-0 self-center rounded-md border border-(--hc-border) bg-(--hc-surface-well)"
              style={{ aspectRatio: String(canvasAspect) }}
            >
              <div
                className="absolute rounded-sm border-2 border-(--hc-primary) bg-(--hc-accent-soft-bg)"
                style={{
                  left: `${value.box.x * 100}%`,
                  top: `${value.box.y * 100}%`,
                  width: `${value.box.width * 100}%`,
                  height: `${value.box.height * 100}%`,
                }}
              />
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-semibold">고를 수 있는 글꼴</legend>
            {stylesError ? (
              <p role="alert" className="text-[13px] text-(--hc-danger)">
                {stylesError}
              </p>
            ) : !styles ? (
              <p className="text-[13px] text-(--hc-muted)">글꼴을 불러오는 중…</p>
            ) : (
              <div className="grid gap-1 sm:grid-cols-2">
                {styles.map((style) => (
                  <label key={style.id} className="flex min-h-11 items-center gap-2 text-[14px]">
                    <input
                      type="checkbox"
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
            <label className="flex flex-col gap-1 text-[12px] font-semibold">
              최대 글자 수
              <input
                type="number"
                inputMode="numeric"
                min={FREE_TEXT_LIMITS.maxLength[0]}
                max={FREE_TEXT_LIMITS.maxLength[1]}
                disabled={disabled}
                value={value.maxLength ?? FREE_TEXT_DEFAULT_MAX_LENGTH}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) patch({ maxLength: n });
                }}
                className="hc-input h-11 w-28 rounded-xl border px-3 text-[14px] font-normal"
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold">
              최대 줄 수
              <input
                type="number"
                inputMode="numeric"
                min={FREE_TEXT_LIMITS.maxLines[0]}
                max={FREE_TEXT_LIMITS.maxLines[1]}
                disabled={disabled}
                value={value.maxLines ?? 1}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) patch({ maxLines: n });
                }}
                className="hc-input h-11 w-28 rounded-xl border px-3 text-[14px] font-normal"
              />
            </label>
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
