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

/** 숫자 칸 값 → 정수. 비었으면 undefined(서버 기본값). */
export function optionalInt(value: string): number | undefined {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

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
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        className="hc-input h-11 rounded-xl border px-3 text-[14px]"
      />
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "text" | "datetime-local" | "number";
  maxLength?: number;
  help?: string;
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
        onChange={(e) => onChange(e.target.value)}
        className="hc-input h-11 w-full rounded-xl border px-3 text-[14px]"
      />
      {help ? <span className="text-[12px] text-(--hc-muted)">{help}</span> : null}
    </label>
  );
}
