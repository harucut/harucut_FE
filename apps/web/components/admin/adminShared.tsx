"use client";

import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
import type { EntitlementTerms } from "@/lib/admin/cmsApi";
import type { EntitlementFeature } from "@/lib/studio/usageApi";

export const FEATURE_LABEL: Record<EntitlementFeature, string> = {
  CUSTOM_THEME: "행사 화면 디자인",
  WHITE_LABEL: "하루컷 표시 숨기기",
  BULK_DOWNLOAD: "사진 묶음 받기",
};

const FEATURES = Object.keys(FEATURE_LABEL) as EntitlementFeature[];

/** CMS 오류 문구. 403 은 플랫폼 관리자가 아니라는 뜻이다(고객 공간의 관리자 역할과 다르다). */
export function adminErrorMessage(cause: unknown, fallback: string) {
  const { status } = getApiErrorDetails(cause);
  if (status === 403) return "플랫폼 관리자만 쓸 수 있어요.";
  return getUserFacingApiErrorMessage(cause, fallback);
}

export function formatDateTime(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * 숫자 칸 값 → 0 이상의 정수. 비었거나 정수가 아니면 undefined(서버 기본값).
 * `type="number"` 는 `1e6` 같은 지수 표기도 받으므로 parseInt 가 아니라 Number 로 통째로 읽는다 —
 * parseInt 는 1 로 읽어 백만 원 계약이 1원, 500장 이용권이 5장이 된다(Codex #546).
 */
export function optionalInt(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}

/**
 * 숫자 칸에 무언가 적었는데 0 이상의 정수가 아닌가(예: -1000, 1.5). 빈칸과 구분한다 — 빈칸은 「서버 기본값」이지만
 * 잘못 적은 값을 빈칸처럼 빼고 보내면 입력 오류를 아무도 알리지 못한다(Codex #546).
 */
export function isInvalidNumber(value: string, min = 0): boolean {
  if (!value.trim()) return false;
  const n = optionalInt(value);
  return n === undefined || n < min;
}

export const INVALID_NUMBER_MESSAGE = "0 이상의 정수로 적어 주세요.";

export type TermsDraft = {
  composeQuota: string;
  retentionDays: string;
  maxBoothDevices: string;
  maxLiveEvents: string;
  features: EntitlementFeature[];
};

export const EMPTY_TERMS: TermsDraft = {
  composeQuota: "",
  retentionDays: "",
  maxBoothDevices: "",
  maxLiveEvents: "",
  features: [],
};

export function termsOf(draft: TermsDraft): EntitlementTerms | null {
  const composeQuota = optionalInt(draft.composeQuota);
  if (composeQuota === undefined) return null;
  // 선택 칸이라도 잘못 적었으면 빼고 보내지 않는다 — 조건을 만들지 않고 칸에 오류를 보인다.
  if (
    isInvalidNumber(draft.retentionDays, 1) ||
    isInvalidNumber(draft.maxBoothDevices) ||
    isInvalidNumber(draft.maxLiveEvents)
  ) {
    return null;
  }
  const retentionDays = optionalInt(draft.retentionDays);
  const maxBoothDevices = optionalInt(draft.maxBoothDevices);
  const maxLiveEvents = optionalInt(draft.maxLiveEvents);
  return {
    composeQuota,
    ...(retentionDays ? { retentionDays } : {}),
    ...(maxBoothDevices !== undefined ? { maxBoothDevices } : {}),
    ...(maxLiveEvents !== undefined ? { maxLiveEvents } : {}),
    features: draft.features,
  };
}

export function describeTerms(terms: EntitlementTerms) {
  return [
    `합성 ${terms.composeQuota.toLocaleString("ko-KR")}장`,
    terms.retentionDays ? `보관 ${terms.retentionDays}일` : null,
    terms.maxBoothDevices !== undefined ? `부스 ${terms.maxBoothDevices}대` : null,
    terms.maxLiveEvents !== undefined ? `동시 운영 ${terms.maxLiveEvents}개` : null,
    ...(terms.features ?? []).map((f) => FEATURE_LABEL[f] ?? f),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** 계약과 수동 부여가 같은 이용권 조건을 쓴다(백엔드 EntitlementTerms). */
export function TermsFields({ value, onChange }: { value: TermsDraft; onChange: (next: TermsDraft) => void }) {
  const number = (key: Exclude<keyof TermsDraft, "features">, label: string, required = false, min = 0) => (
    <label className="flex flex-col gap-1 text-[13px]">
      <span>
        {label}
        {required ? <span className="ml-1 text-(--hc-danger)">*</span> : <span className="ml-1 text-(--hc-muted)">(선택)</span>}
      </span>
      <input
        type="number"
        min={min}
        inputMode="numeric"
        required={required}
        aria-invalid={isInvalidNumber(value[key], min) || undefined}
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        className="hc-input h-11 rounded-xl border px-3 text-[14px]"
      />
      {isInvalidNumber(value[key], min) ? (
        <span className="text-[12px] text-(--hc-danger)">{min > 0 ? `${min} 이상의 정수로 적어 주세요.` : INVALID_NUMBER_MESSAGE}</span>
      ) : null}
    </label>
  );
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-[14px] font-semibold">이용권 조건</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {number("composeQuota", "합성 한도(장)", true)}
        {number("retentionDays", "보관 일수 상한", false, 1)}
        {number("maxBoothDevices", "부스 기기 수")}
        {number("maxLiveEvents", "동시 운영 행사")}
      </div>
      <div className="flex flex-wrap gap-x-4">
        {FEATURES.map((feature) => (
          <label key={feature} className="flex min-h-11 items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="size-5"
              checked={value.features.includes(feature)}
              onChange={(e) =>
                onChange({
                  ...value,
                  features: e.target.checked ? [...value.features, feature] : value.features.filter((f) => f !== feature),
                })
              }
            />
            {FEATURE_LABEL[feature]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function TextField({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  maxLength,
  help,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "text" | "datetime-local" | "number";
  maxLength?: number;
  help?: string;
  /** 칸 아래에 보일 입력 오류. 있으면 aria-invalid 도 건다. */
  error?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[13px]">
      <span>
        {label}
        {required ? <span className="ml-1 text-(--hc-danger)">*</span> : <span className="ml-1 text-(--hc-muted)">(선택)</span>}
      </span>
      <input
        type={type}
        required={required}
        maxLength={maxLength}
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="hc-input h-11 w-full rounded-xl border px-3 text-[14px]"
      />
      {help ? <span className="text-[12px] text-(--hc-muted)">{help}</span> : null}
      {error ? <span className="text-[12px] text-(--hc-danger)">{error}</span> : null}
    </label>
  );
}
