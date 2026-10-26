"use client";

import { useState } from "react";
import { StudioConsentItems, consentItemsOf, toConsentDrafts, type ConsentDraft } from "@/components/studio/StudioConsentItems";
import { StudioFramePicker, layoutName, normalizeFrameRefs } from "@/components/studio/StudioFramePicker";
import { StudioPageTheme } from "@/components/studio/StudioPageTheme";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import {
  compactPageTheme,
  parsePageTheme,
  type PageTheme,
} from "@/lib/event/pageTheme";
import type { BrandDefaults } from "@/lib/studio/projectsApi";
import type { ConsentItem, EventLayout, FrameRef } from "@/lib/studio/studioApi";

const LAYOUTS: EventLayout[] = ["CLASSIC", "WIDE", "GRID", "POLAROID"];

/** 켬·끔·정하지 않음(위 단계·서버 기본값을 따름). */
type Tri = "" | "on" | "off";

type Draft = {
  byod: Tri;
  booth: Tri;
  setLayouts: boolean;
  layouts: EventLayout[];
  /** 제공 프레임·동의 항목도 목록째 바뀐다 — 정하면 아래 행사가 통째로 받는다. */
  setFrames: boolean;
  frames: FrameRef[];
  setConsents: boolean;
  consents: ConsentDraft[];
  /** 저장된 동의 항목 — 문구를 바꾼 항목만 version 을 올리는 기준. */
  savedConsents: ConsentItem[];
  retentionDays: string;
  /** 브랜딩을 뺀 테마(색·글꼴·로고·배경·문구). */
  theme: PageTheme;
  /**
   * 브랜딩은 「정하지 않음(위 단계 값을 따름)」과 「명시적으로 끔」을 구분해야 한다 — 프로젝트가 공간이 켠 숨김·로고를 끄려면
   * 끈 값을 명시해야 하기 때문이다(Codex #553). 그래서 체크박스가 아니라 3단 선택이다.
   */
  hideBranding: Tri;
  outputLogo: "" | "NONE" | "ORGANIZER_LOGO";
};

function draftOf(defaults: BrandDefaults): Draft {
  const tri = (v: unknown): Tri => (v === true ? "on" : v === false ? "off" : "");
  const raw = (defaults.theme as { branding?: { hideHarucutBranding?: unknown; outputLogo?: unknown } } | null | undefined)
    ?.branding;
  return {
    byod: tri(defaults.byodEnabled),
    booth: tri(defaults.boothEnabled),
    setLayouts: Array.isArray(defaults.allowedLayouts),
    layouts: defaults.allowedLayouts ?? [],
    setFrames: Array.isArray(defaults.frames),
    frames: normalizeFrameRefs([...(defaults.frames ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)),
    setConsents: Array.isArray(defaults.consentItems),
    consents: toConsentDrafts(defaults.consentItems),
    savedConsents: defaults.consentItems ?? [],
    retentionDays: defaults.resultRetentionDays ? String(defaults.resultRetentionDays) : "",
    theme: { ...parsePageTheme(defaults.theme), branding: undefined },
    hideBranding: tri(raw?.hideHarucutBranding),
    outputLogo: raw?.outputLogo === "NONE" || raw?.outputLogo === "ORGANIZER_LOGO" ? raw.outputLogo : "",
  };
}

/** 저장할 테마. 빈 문구·색은 빼고(위 단계 값을 따른다), 브랜딩은 정한 키만 끈 값까지 담는다. */
function themeOf(draft: Draft): PageTheme | null {
  const compact = compactPageTheme(draft.theme);
  const branding: Record<string, unknown> = {};
  if (draft.hideBranding) branding.hideHarucutBranding = draft.hideBranding === "on";
  if (draft.outputLogo) branding.outputLogo = draft.outputLogo;
  if (Object.keys(branding).length === 0) return compact;
  return { ...(compact ?? { schemaVersion: 1 }), branding };
}

/** 폼 → 머지 패치. 정하지 않은 필드는 null(그 키를 지운다 — 위 단계·서버 기본값을 따른다). */
function patchOf(draft: Draft): Partial<Record<keyof BrandDefaults, unknown>> {
  const bool = (v: Tri) => (v === "" ? null : v === "on");
  const days = Number(draft.retentionDays);
  return {
    byodEnabled: bool(draft.byod),
    boothEnabled: bool(draft.booth),
    allowedLayouts: draft.setLayouts ? draft.layouts : null,
    frames: draft.setFrames ? draft.frames : null,
    consentItems: draft.setConsents ? consentItemsOf(draft.consents, draft.savedConsents) : null,
    resultRetentionDays: draft.retentionDays.trim() && Number.isSafeInteger(days) && days > 0 ? days : null,
    theme: themeOf(draft),
  };
}

/**
 * 공간·프로젝트의 브랜드 기본값(ADR-0009 §2). 정한 것만 아래(프로젝트 → 행사)로 내려가고, 행사가 직접 정한 값이 이긴다.
 * 게시한 행사는 다시 게시하기 전까지 바뀌지 않는다. 제공 프레임·동의 항목은 목록째 내려간다(행사가 정하면 통째로 이긴다).
 */
export function StudioBrandDefaults({
  workspaceId,
  value,
  scopeLabel,
  onSave,
}: {
  workspaceId: string;
  value: BrandDefaults;
  /** 「공간」·「프로젝트」 — 안내 문구에 쓴다. */
  scopeLabel: string;
  onSave: (
    patch: Partial<Record<keyof BrandDefaults, unknown>>,
  ) => Promise<BrandDefaults>;
}) {
  const [saved, setSaved] = useState<Draft>(() => draftOf(value));
  const [draft, setDraft] = useState<Draft>(saved);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );

  const days = Number(draft.retentionDays);
  const retentionInvalid =
    draft.retentionDays.trim() !== "" && !(Number.isSafeInteger(days) && days > 0);
  const dirty = JSON.stringify(patchOf(draft)) !== JSON.stringify(patchOf(saved));
  const set = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const next = draftOf(await onSave(patchOf(draft)));
      setSaved(next);
      setDraft(next);
      setNotice({
        kind: "ok",
        text: `${scopeLabel} 기본값을 저장했어요. 게시한 행사는 다시 게시하면 반영돼요.`,
      });
    } catch (cause) {
      setNotice({
        kind: "error",
        text: getUserFacingApiErrorMessage(cause, "기본값을 저장하지 못했어요."),
      });
    } finally {
      setBusy(false);
    }
  };

  const triSelect = (label: string, key: "byod" | "booth") => (
    <label className="flex flex-col gap-1 text-[13px] font-semibold">
      {label}
      <select
        value={draft[key]}
        onChange={(e) => set({ [key]: e.target.value as Tri } as Partial<Draft>)}
        className="hc-input h-11 rounded-xl border px-2 text-[14px] font-normal"
      >
        <option value="">정하지 않음</option>
        <option value="on">허용</option>
        <option value="off">허용 안 함</option>
      </select>
    </label>
  );

  return (
    <form
      aria-label={`${scopeLabel} 기본값`}
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !busy && !uploading && !retentionInvalid) void save();
      }}
    >
      {/* 저장 중에는 편집·업로드를 잠근다 — 응답이 그사이 바꾼 입력을 저장 시점 값으로 덮지 않게(Codex #553). */}
      <fieldset disabled={busy} className="flex flex-col gap-5">
        <p className="text-[13px] text-(--hc-muted)">
          정한 것만 이 {scopeLabel}의 행사로 내려가요. 행사에서 직접 정한 값이 이기고,
          게시한 행사는 다시 게시하기 전까지 그대로예요.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {triSelect("개인 휴대폰 참가", "byod")}
          {triSelect("현장 부스 참가", "booth")}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-semibold">허용 레이아웃</legend>
          <label className="flex min-h-11 items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="size-5"
              checked={draft.setLayouts}
              onChange={(e) => set({ setLayouts: e.target.checked })}
            />
            기본값으로 정하기
          </label>
          {draft.setLayouts ? (
            <div className="flex flex-wrap gap-x-4">
              {LAYOUTS.map((layout) => (
                <label
                  key={layout}
                  className="flex min-h-11 items-center gap-2 text-[14px]"
                >
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={draft.layouts.includes(layout)}
                    onChange={(e) =>
                      set({
                        layouts: LAYOUTS.filter((l) =>
                          l === layout ? e.target.checked : draft.layouts.includes(l),
                        ),
                      })
                    }
                  />
                  {layoutName(layout)}
                </label>
              ))}
            </div>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-semibold">제공 프레임</legend>
          <label className="flex min-h-11 items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="size-5"
              checked={draft.setFrames}
              onChange={(e) => set({ setFrames: e.target.checked })}
            />
            기본값으로 정하기
          </label>
          {draft.setFrames ? (
            <StudioFramePicker
              workspaceId={workspaceId}
              // 허용 레이아웃을 정하지 않았으면 모든 판형에서 고른다 — 행사의 허용 레이아웃 밖 프레임은 게시 검사가 막는다.
              layouts={draft.setLayouts ? draft.layouts : LAYOUTS}
              value={draft.frames}
              onChange={(frames) => set({ frames })}
            />
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-semibold">참가 동의</legend>
          <label className="flex min-h-11 items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="size-5"
              checked={draft.setConsents}
              onChange={(e) => set({ setConsents: e.target.checked })}
            />
            기본값으로 정하기
          </label>
          {draft.setConsents ? (
            <StudioConsentItems value={draft.consents} onChange={(consents) => set({ consents })} />
          ) : null}
        </fieldset>

        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          결과 보관 일수
          <input
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="정하지 않음"
            aria-invalid={retentionInvalid || undefined}
            value={draft.retentionDays}
            onChange={(e) => set({ retentionDays: e.target.value })}
            className="hc-input h-11 w-40 rounded-xl border px-3 text-[14px] font-normal"
          />
          {retentionInvalid ? (
            <span className="text-[12px] font-normal text-(--hc-danger)">
              1 이상의 정수로 적어 주세요.
            </span>
          ) : null}
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-semibold">행사 화면 꾸미기</legend>
          <StudioPageTheme
            showBranding={false}
            workspaceId={workspaceId}
            value={draft.theme}
            onUploadingChange={setUploading}
            onChange={(apply) =>
              setDraft((prev) => ({ ...prev, theme: apply(prev.theme) }))
            }
          />
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-[13px] font-semibold">브랜딩</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              하루컷 표시
              <select
                value={draft.hideBranding}
                onChange={(e) => set({ hideBranding: e.target.value as Tri })}
                className="hc-input h-11 rounded-xl border px-2 text-[14px] font-normal"
              >
                <option value="">정하지 않음</option>
                <option value="on">숨기기</option>
                <option value="off">보이기</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              완성 사진의 로고
              <select
                value={draft.outputLogo}
                onChange={(e) => set({ outputLogo: e.target.value as Draft["outputLogo"] })}
                className="hc-input h-11 rounded-xl border px-2 text-[14px] font-normal"
              >
                <option value="">정하지 않음</option>
                <option value="ORGANIZER_LOGO">행사 로고 넣기</option>
                <option value="NONE">넣지 않기</option>
              </select>
            </label>
          </div>
          <p className="text-[12px] text-(--hc-muted)">
            하루컷 표시 숨기기는 화이트라벨 이용권이 있어야 게시돼요. 완성 사진 로고는 준비 중이라 지금은 설정만 저장돼요.
          </p>
        </fieldset>
      </fieldset>

      {notice ? (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={
            notice.kind === "error" ? "text-[13px] text-(--hc-danger)" : "text-[13px]"
          }
        >
          {notice.text}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!dirty || busy || uploading || retentionInvalid}
        className="hc-button-primary h-11 self-start rounded-full px-5 text-[14px] font-semibold disabled:opacity-50"
      >
        {busy ? "저장하는 중…" : uploading ? "이미지 올리는 중…" : "기본값 저장"}
      </button>
    </form>
  );
}
