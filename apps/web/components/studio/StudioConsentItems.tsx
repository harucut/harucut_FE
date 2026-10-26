"use client";

import { useId } from "react";
import type { ConsentItem } from "@/lib/studio/studioApi";

/** 편집 중인 동의 항목. version 은 저장할 때 consentItemsOf 가 매긴다. */
export type ConsentDraft = Pick<ConsentItem, "code" | "title" | "body" | "required">;

export function toConsentDrafts(items: ConsentItem[] | null | undefined): ConsentDraft[] {
  return (items ?? []).map(({ code, title, body, required }) => ({ code, title, body, required }));
}

/**
 * 저장할 동의 항목. version 은 **문구가 바뀌었을 때만** 올린다. 참가자 동의 기록은 「어느 버전의 문구」에
 * 대한 것이라, 같은 문구에 새 버전을 매기면 기록이 가리키는 문구가 흐려지고, 바꾼 문구에 옛 버전을
 * 남기면 예전 동의가 새 문구에 대한 것처럼 읽힌다.
 */
export function consentItemsOf(drafts: ConsentDraft[], saved: ConsentItem[] | null | undefined): ConsentItem[] {
  const previous = new Map((saved ?? []).map((item) => [item.code, item]));
  return drafts.map((c) => {
    const before = previous.get(c.code);
    const changed = !before || before.title !== c.title || before.body !== c.body;
    return { ...c, version: before ? before.version + (changed ? 1 : 0) : 1 };
  });
}

function newConsentCode(existing: ConsentDraft[]) {
  let n = existing.length + 1;
  while (existing.some((c) => c.code === `consent-${n}`)) n += 1;
  return `consent-${n}`;
}

/** 동의 항목 편집 — 행사 설정과 공간·프로젝트 기본값이 같이 쓴다. */
export function StudioConsentItems({
  value,
  onChange,
}: {
  value: ConsentDraft[];
  onChange: (next: ConsentDraft[]) => void;
}) {
  const id = useId();
  const patch = (index: number, change: Partial<ConsentDraft>) =>
    onChange(value.map((c, i) => (i === index ? { ...c, ...change } : c)));

  return (
    <>
      {value.map((consent, index) => (
        <div key={consent.code} className="hc-surface-well flex flex-col gap-2 rounded-2xl p-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-${consent.code}-title`} className="text-[13px] font-semibold">
              제목
            </label>
            <input
              id={`${id}-${consent.code}-title`}
              className="hc-input h-11 rounded-xl border px-3 text-[14px]"
              value={consent.title}
              onChange={(e) => patch(index, { title: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-${consent.code}-body`} className="text-[13px] font-semibold">
              본문
            </label>
            <textarea
              id={`${id}-${consent.code}-body`}
              className="hc-input min-h-24 rounded-xl border px-3 py-2 text-[14px]"
              value={consent.body}
              onChange={(e) => patch(index, { body: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="flex min-h-11 items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                className="size-5"
                checked={consent.required}
                onChange={(e) => patch(index, { required: e.target.checked })}
              />
              필수
            </label>
            <button
              type="button"
              className="h-11 rounded-full px-3 text-[13px] text-(--hc-danger)"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              항목 지우기
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="hc-button-secondary h-11 self-start rounded-full px-4 text-[13px] font-semibold"
        onClick={() => onChange([...value, { code: newConsentCode(value), title: "", body: "", required: true }])}
      >
        동의 항목 추가
      </button>
    </>
  );
}
