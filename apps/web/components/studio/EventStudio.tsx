"use client";

import Link from "next/link";
import { cloneElement, useCallback, useEffect, useId, useState, useSyncExternalStore } from "react";
import { AppNav } from "@/components/layout/AppNav";
import { QrCode } from "@/components/qr/QrCode";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EventStatusBadge } from "@/components/studio/EventStatusBadge";
import { useRouter } from "next/navigation";
import { getFrameConfig, type FrameId } from "@/constants/frames";
import { StudioBoothDevices } from "@/components/studio/StudioBoothDevices";
import { StudioEventCustomers } from "@/components/studio/StudioEventCustomers";
import { CloneEventForm } from "@/components/studio/CloneEventForm";
import { StudioFramePicker, normalizeFrameRefs } from "@/components/studio/StudioFramePicker";
import { StudioPageTheme } from "@/components/studio/StudioPageTheme";
import { StudioEventUsage } from "@/components/studio/StudioEventUsage";
import { getEventUsage, type EventUsage } from "@/lib/studio/usageApi";
import {
  getEffectiveSettings,
  getWorkspaceBrandDefaults,
  listProjects,
  type BrandDefaults,
  type Project,
  type SettingSource,
} from "@/lib/studio/projectsApi";
import { settingsPatch } from "@/lib/studio/settingsPatch";
import { compactPageTheme, parsePageTheme, type PageTheme } from "@/lib/event/pageTheme";
import { useThemeSession } from "@/lib/themeSessionStore";
import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
import { frameIdFromFrameType } from "@/lib/frameApi";
import { toLocalInputValue, toServerDateTime } from "@/lib/studio/eventTime";
import { groupViolations, type ViolationGroup } from "@/lib/studio/publishViolations";
import {
  EVENT_PUBLISH_INVALID_CODE,
  EVENT_SETTINGS_CONFLICT_CODE,
  conflictSettingsVersion,
  getEvent,
  publishViolations,
  runEventAction,
  updateEventSettings,
  type ConsentItem,
  type EventAction,
  type EventLayout,
  type EventSettings,
  type FrameRef,
  type StudioEvent,
} from "@/lib/studio/studioApi";

const LAYOUTS: EventLayout[] = ["CLASSIC", "WIDE", "GRID", "POLAROID"];

/** 결과 보관 일수의 기본값. 확정된 상품 정책이 아니다 — 운영자가 정한다(R5 8절). */
const DEFAULT_RETENTION_DAYS = 30;

type ConsentDraft = Pick<ConsentItem, "code" | "title" | "body" | "required">;

type Form = {
  name: string;
  slug: string;
  startsAt: string;
  endsAt: string;
  byod: boolean;
  booth: boolean;
  layouts: EventLayout[];
  consents: ConsentDraft[];
  frames: FrameRef[];
  retentionDays: string;
  theme: PageTheme;
  /** 프로젝트 public id. 빈 문자열이면 프로젝트 없음. */
  projectId: string;
};

function formOf(settings: EventSettings): Form {
  return {
    name: settings.name ?? "",
    slug: settings.slug ?? "",
    startsAt: toLocalInputValue(settings.captureStartsAt),
    endsAt: toLocalInputValue(settings.captureEndsAt),
    byod: Boolean(settings.byodEnabled),
    booth: Boolean(settings.boothEnabled),
    layouts: LAYOUTS.filter((l) => settings.allowedLayouts?.includes(l)),
    consents: (settings.consentItems ?? []).map(({ code, title, body, required }) => ({ code, title, body, required })),
    frames: [...(settings.frames ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    retentionDays: String(settings.resultRetentionDays ?? DEFAULT_RETENTION_DAYS),
    theme: parsePageTheme(settings.theme),
    projectId: settings.projectId ?? "",
  };
}

/**
 * 폼 → PATCH 본문. 테마는 빈 값을 뺀 모양으로 보내고, 꾸민 것이 없으면 null(테마 없음)이다.
 *
 * 동의 항목의 version 은 **문구가 바뀌었을 때만** 올린다. 참가자 동의 기록은 「어느 버전의 문구」에
 * 대한 것이라, 같은 문구에 새 버전을 매기면 기록이 가리키는 문구가 흐려지고, 바꾼 문구에 옛 버전을
 * 남기면 예전 동의가 새 문구에 대한 것처럼 읽힌다.
 */
function settingsOf(form: Form, saved: EventSettings): EventSettings {
  const previous = new Map((saved.consentItems ?? []).map((item) => [item.code, item]));
  const retention = Number.parseInt(form.retentionDays, 10);
  return {
    name: form.name.trim(),
    slug: form.slug,
    captureStartsAt: toServerDateTime(form.startsAt),
    captureEndsAt: toServerDateTime(form.endsAt),
    byodEnabled: form.byod,
    boothEnabled: form.booth,
    allowedLayouts: form.layouts,
    frames: form.frames,
    consentItems: form.consents.map((c) => {
      const before = previous.get(c.code);
      const changed = !before || before.title !== c.title || before.body !== c.body;
      return { ...c, version: before ? before.version + (changed ? 1 : 0) : 1 };
    }),
    resultRetentionDays: Number.isFinite(retention) && retention > 0 ? retention : null,
    theme: themeForSave(form.theme),
    projectId: form.projectId || null,
  };
}

/**
 * 저장용 테마. 빈 문구·빈 색은 빼되(위 단계 값을 따른다), 브랜딩은 끈 값(false·NONE)도 남긴다 — 상속 계약에서 키를 빼면
 * 「위 단계 값」이라, 공간·프로젝트가 켠 숨김·로고를 이 행사만 끄려면 끈 값을 명시해야 한다(Codex #553).
 * 바뀌지 않은 브랜딩은 settingsPatch 가 출처를 보고 뺀다.
 */
function themeForSave(theme: PageTheme): PageTheme {
  const compact = compactPageTheme(theme) ?? { schemaVersion: 1 };
  return {
    ...compact,
    branding: {
      hideHarucutBranding: Boolean(theme.branding?.hideHarucutBranding),
      outputLogo: theme.branding?.outputLogo === "ORGANIZER_LOGO" ? "ORGANIZER_LOGO" : "NONE",
    },
  };
}

/** 상속 가능한 필드가 섹션마다 어떤 것인지(ADR-0009 §2-1). 섹션 제목 옆에 출처와 「기본값 따르기」를 둔다. */
type InheritableField = keyof BrandDefaults;

function sourceOf(fields: InheritableField[], sources: Record<string, SettingSource> | null): SettingSource | "MIXED" | null {
  if (!sources) return null;
  const found = new Set<SettingSource>();
  for (const field of fields) {
    if (field === "theme") {
      for (const [path, source] of Object.entries(sources)) if (path.startsWith("theme.")) found.add(source);
    } else if (sources[field]) {
      found.add(sources[field]);
    }
  }
  if (found.size === 0) return null;
  if (found.size > 1) return "MIXED";
  return [...found][0];
}

function newConsentCode(existing: ConsentDraft[]) {
  let n = existing.length + 1;
  while (existing.some((c) => c.code === `consent-${n}`)) n += 1;
  return `consent-${n}`;
}

// 참가 링크는 이 화면의 오리진에 붙인다 — 서버는 프론트 도메인을 모른다(joinUrlPath 는 상대 경로).
function subscribeNothing() {
  return () => {};
}
function useOrigin() {
  return useSyncExternalStore(subscribeNothing, () => window.location.origin, () => "");
}

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; event: StudioEvent };

export function EventStudio({ eventId }: { eventId: string }) {
  const router = useRouter();
  const origin = useOrigin();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<null | "save" | EventAction>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [conflict, setConflict] = useState<{ currentVersion: number | null } | null>(null);
  const [violations, setViolations] = useState<ViolationGroup[]>([]);
  const [confirmClose, setConfirmClose] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [usage, setUsage] = useState<EventUsage | undefined>(undefined);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // 행사 화면 꾸미기에서 로고·배경을 올리는 중이면 저장을 막는다. 저장 응답(저장 시점 폼)이 업로드 결과를 덮는다.
  const [themeUploading, setThemeUploading] = useState(false);
  // 상속(ADR-0009 §2): 경로마다 출처, 「기본값 따르기」를 고른 필드, 공간·프로젝트 기본값. 출처를 못 받으면 null — 그때는
  // 예전처럼 저장한다(settingsPatch 주석).
  const [sources, setSources] = useState<Record<string, SettingSource> | null>(null);
  // 저장한 직후에는 출처가 아직 옛것이다 — 옛 출처로 테마를 담으면 방금 직접 정한 키를 빼서 지운다(Codex #553).
  // 새 출처를 받을 때까지 저장을 막는다.
  const [sourcesReady, setSourcesReady] = useState(false);
  const [inherit, setInherit] = useState<Set<InheritableField>>(() => new Set());
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspaceDefaults, setWorkspaceDefaults] = useState<BrandDefaults | null>(null);

  const loadSources = useCallback(async () => {
    setSourcesReady(false);
    try {
      setSources((await getEffectiveSettings(eventId)).sources);
    } catch {
      setSources(null);
    } finally {
      setSourcesReady(true);
    }
  }, [eventId]);

  const accept = useCallback(
    (event: StudioEvent) => {
      setLoad({ state: "ready", event });
      setForm(formOf(event.settings));
      setInherit(new Set());
      void loadSources();
    },
    [loadSources],
  );

  const reload = useCallback(async () => {
    try {
      accept(await getEvent(eventId));
      setConflict(null);
    } catch (error) {
      setLoad({ state: "error", message: getUserFacingApiErrorMessage(error, "행사를 불러오지 못했어요.") });
    }
  }, [accept, eventId]);

  const loadUsage = useCallback(async () => {
    setUsageError(null);
    setNow(() => Date.now());
    try {
      setUsage(await getEventUsage(eventId));
    } catch (error) {
      setUsageError(getUserFacingApiErrorMessage(error, "이용권 정보를 불러오지 못했어요."));
    }
  }, [eventId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void reload();
    void loadUsage();
  }, [reload, loadUsage]);

  // 프로젝트 목록과 공간 기본값 — 「기본값 따르기」를 보일지(위 단계에 값이 있는지) 가린다. 못 받으면 상속 안내를 줄인다.
  const workspaceId = load.state === "ready" ? load.event.workspaceId : null;
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    listProjects(workspaceId)
      .then((list) => !cancelled && setProjects(list))
      .catch(() => {});
    getWorkspaceBrandDefaults(workspaceId)
      .then((defaults) => !cancelled && setWorkspaceDefaults(defaults))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  if (load.state !== "ready" || !form) {
    return (
      <main className="hc-page-app min-h-dvh text-(--hc-text)">
        <AppNav />
        <div className="mx-auto w-full max-w-200 px-4 py-6">
          {load.state === "error" ? (
            <p role="alert" className="text-[14px] text-(--hc-danger)">
              {load.message}
            </p>
          ) : (
            <p className="text-[14px] text-(--hc-muted)">불러오는 중…</p>
          )}
        </div>
      </main>
    );
  }

  const event = load.event;
  const editable = event.status === "DRAFT" || event.status === "LIVE";
  const slugLocked = event.status !== "DRAFT";
  const next = settingsOf(form, event.settings);
  // 저장 본문은 바뀐 필드만 — 상속받은 값을 행사 직접 값으로 굳히지 않는다(settingsPatch).
  const patch = settingsPatch(next, settingsOf(formOf(event.settings), event.settings), { sources, inherit });
  const dirty = Object.keys(patch).length > 0;
  const currentProject = projects.find((p) => p.projectId === form.projectId) ?? null;
  const parentHas = (field: InheritableField) => {
    const has = (defaults: BrandDefaults | null | undefined) => {
      const value = defaults?.[field];
      if (field === "theme") return Boolean(value && Object.keys(value as object).some((k) => k !== "schemaVersion"));
      return value !== undefined && value !== null;
    };
    return has(workspaceDefaults) || has(currentProject?.brandDefaults);
  };
  const inheritAside = (fields: InheritableField[]) => {
    const source = sourceOf(fields, sources);
    const following = fields.every((f) => inherit.has(f));
    const canFollow = editable && fields.some((f) => parentHas(f)) && (source === "EVENT" || source === "MIXED");
    return (
      <InheritNote
        source={source}
        following={following}
        canFollow={canFollow}
        onFollow={() => setInherit((prev) => new Set([...prev, ...fields]))}
        onCancel={() => setInherit((prev) => new Set([...prev].filter((f) => !fields.includes(f))))}
      />
    );
  };
  const joinUrl = `${origin}${event.joinUrlPath}`;

  // 행사용 프레임은 같은 편집기를 공간 맥락으로 연다 — 저장하면 이 공간에 만들고 여기로 돌아온다.
  const openEditor = (frameId: FrameId, remoteFrameId: number | null) => {
    const session = useThemeSession.getState();
    session.setFrameId(frameId);
    session.setRemoteFrameId(remoteFrameId);
    session.setWorkspaceContext(event.workspaceId, `/studio/events/${encodeURIComponent(event.eventId)}`);
    router.push("/theme/sticker");
  };
  const update = (patch: Partial<Form>) => setForm({ ...form, ...patch });

  const save = async (settingsVersion = event.settingsVersion) => {
    setBusy("save");
    setNotice(null);
    try {
      accept(await updateEventSettings(event.eventId, settingsVersion, patch));
      setConflict(null);
      setNotice({ kind: "ok", text: "설정을 저장했어요." });
    } catch (error) {
      if (getApiErrorDetails(error).code === EVENT_SETTINGS_CONFLICT_CODE) {
        setConflict({ currentVersion: conflictSettingsVersion(error) });
      } else {
        setNotice({ kind: "error", text: getUserFacingApiErrorMessage(error, "설정을 저장하지 못했어요.") });
      }
    } finally {
      setBusy(null);
    }
  };

  const act = async (action: EventAction) => {
    setBusy(action);
    setNotice(null);
    setViolations([]);
    try {
      accept(await runEventAction(event.eventId, action));
      setNotice({ kind: "ok", text: ACTION_DONE[action] });
    } catch (error) {
      if (action === "publish" && getApiErrorDetails(error).code === EVENT_PUBLISH_INVALID_CODE) {
        setViolations(groupViolations(publishViolations(error)));
      } else {
        setNotice({ kind: "error", text: getUserFacingApiErrorMessage(error, "처리하지 못했어요.") });
      }
    } finally {
      setBusy(null);
      setConfirmClose(false);
    }
  };

  return (
    <main className="hc-page-app min-h-dvh pb-16 text-(--hc-text)">
      <AppNav />
      <div className="mx-auto flex w-full max-w-200 flex-col gap-6 px-4 py-5 sm:py-6 lg:py-8">
        <Link
          href={`/studio?workspace=${encodeURIComponent(event.workspaceId)}`}
          className="text-[13px] text-(--hc-muted)"
        >
          ← 행사 목록
        </Link>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="min-w-0 text-[30px] font-extrabold tracking-tight">
            {event.settings.name || "이름 없는 행사"}
          </h1>
          <EventStatusBadge event={event} />
        </header>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/studio/events/${encodeURIComponent(event.eventId)}/photos`}
            className="hc-button-secondary flex h-11 items-center rounded-full px-4 text-[13px] font-semibold"
          >
            사진함
          </Link>
          <button
            type="button"
            onClick={() => setCloning(true)}
            className="h-11 rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold"
          >
            행사 복제
          </button>
        </div>
        {cloning ? (
          <CloneEventForm
            eventId={event.eventId}
            defaultName={`${event.settings.name ?? "행사"} 복사본`}
            onCancel={() => setCloning(false)}
            onCloned={(next) => {
              setCloning(false);
              router.push(`/studio/events/${encodeURIComponent(next.eventId)}`);
            }}
          />
        ) : null}

        {notice ? (
          <p
            role={notice.kind === "ok" ? "status" : "alert"}
            className={notice.kind === "ok" ? "hc-feedback rounded-2xl border px-4 py-3 text-[13px]" : "rounded-2xl border border-(--hc-danger-border) bg-(--hc-danger-soft-bg) px-4 py-3 text-[13px] text-(--hc-danger)"}
          >
            {notice.text}
          </p>
        ) : null}

        <section aria-labelledby="studio-join-title" className="hc-surface-card flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center">
          {origin ? <QrCode value={joinUrl} size={140} label="행사 참가 링크 QR" /> : null}
          <div className="flex min-w-0 flex-col gap-2">
            <h2 id="studio-join-title" className="text-[18px] font-bold">
              참가 링크
            </h2>
            <p className="break-all text-[14px]">{joinUrl}</p>
            <p className="text-[12px] text-(--hc-muted)">
              {event.captureOpen
                ? "지금 이 링크로 참가자가 촬영할 수 있어요."
                : "게시하고 촬영 기간이 되어야 참가자가 촬영할 수 있어요."}
            </p>
          </div>
        </section>

        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty && busy === null && !themeUploading && sourcesReady) void save();
          }}
        >
          <fieldset disabled={!editable || busy !== null} className="flex flex-col gap-6">
            <Section title="기본 정보">
              <Field label="행사 이름">
                <input
                  className="hc-input h-11 rounded-xl border px-3 text-[14px]"
                  value={form.name}
                  maxLength={100}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </Field>
              <Field label="참가 주소" help={slugLocked ? "게시한 뒤에는 바꿀 수 없어요." : "영문 소문자·숫자·하이픈 3~40자."}>
                <input
                  className="hc-input h-11 rounded-xl border px-3 text-[14px]"
                  value={form.slug}
                  maxLength={40}
                  disabled={slugLocked}
                  onChange={(e) => update({ slug: e.target.value.toLowerCase() })}
                />
              </Field>
              {projects.length > 0 || form.projectId ? (
                <Field
                  label="프로젝트"
                  help={
                    event.status !== "DRAFT"
                      ? "게시한 행사는 프로젝트를 바꿀 수 없어요."
                      : "고르면 그 프로젝트의 기본값(참가 방식·프레임·동의·꾸미기 등)을 따라요. 저장하면 반영돼요."
                  }
                >
                  <select
                    className="hc-input h-11 rounded-xl border px-2 text-[14px]"
                    value={form.projectId}
                    disabled={event.status !== "DRAFT"}
                    onChange={(e) => update({ projectId: e.target.value })}
                  >
                    <option value="">프로젝트 없음</option>
                    {projects
                      .filter((p) => !p.archived || p.projectId === form.projectId)
                      .map((p) => (
                        <option key={p.projectId} value={p.projectId}>
                          {p.archived ? `${p.name} (보관됨)` : p.name}
                        </option>
                      ))}
                  </select>
                </Field>
              ) : null}
            </Section>

            <Section title="촬영 기간" description="비워 두면 게시하는 즉시 시작하고, 「촬영 종료」를 누를 때까지 열려 있어요. 시각은 한국 시간이에요.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="시작">
                  <input
                    type="datetime-local"
                    className="hc-input h-11 rounded-xl border px-3 text-[14px]"
                    value={form.startsAt}
                    onChange={(e) => update({ startsAt: e.target.value })}
                  />
                </Field>
                <Field label="종료">
                  <input
                    type="datetime-local"
                    className="hc-input h-11 rounded-xl border px-3 text-[14px]"
                    value={form.endsAt}
                    onChange={(e) => update({ endsAt: e.target.value })}
                  />
                </Field>
              </div>
            </Section>

            <Section title="참가 방식" aside={inheritAside(["byodEnabled", "boothEnabled"])}>
              <Check label="개인 휴대폰 (링크·QR)" checked={form.byod} onChange={(byod) => update({ byod })} />
              <Check label="현장 부스" checked={form.booth} onChange={(booth) => update({ booth })} />
            </Section>

            <Section title="허용 레이아웃" aside={inheritAside(["allowedLayouts"])} description="참가자가 고를 수 있는 컷 구성이에요. 고른 레이아웃마다 제공 프레임이 하나 이상 있어야 게시할 수 있어요.">
              <div className="grid gap-2 sm:grid-cols-2">
                {LAYOUTS.map((layout) => (
                  <Check
                    key={layout}
                    label={getFrameConfig(frameIdFromFrameType(layout)).name}
                    checked={form.layouts.includes(layout)}
                    onChange={(on) => {
                      const layouts = LAYOUTS.filter((l) => (l === layout ? on : form.layouts.includes(l)));
                      // 뺀 판형의 프레임도 같이 뺀다 — 남기면 게시 검사가 「허용하지 않은 레이아웃의 프레임」으로 막는다.
                      update({ layouts, frames: normalizeFrameRefs(form.frames.filter((f) => layouts.includes(f.layoutType))) });
                    }}
                  />
                ))}
              </div>
            </Section>

            <Section
              title="제공 프레임"
              aside={inheritAside(["frames"])}
              description="참가자가 고를 수 있는 프레임이에요. 허용한 레이아웃마다 하나 이상, 기본 프레임은 전체에서 하나예요."
            >
              <StudioFramePicker
                workspaceId={event.workspaceId}
                layouts={form.layouts}
                value={form.frames}
                onChange={(frames) => update({ frames })}
                disabled={!editable || busy !== null}
                editLocked={dirty}
                onEditFrame={(frame) => openEditor(frameIdFromFrameType(frame.frameType), frame.frameId)}
                onCreateFrame={(layout) => openEditor(frameIdFromFrameType(layout), null)}
              />
            </Section>

            <Section
              title="참가 동의"
              aside={inheritAside(["consentItems"])}
              description="사진을 받는 주체, 목적, 보관 기간을 참가자가 촬영 전에 읽고 동의해요. 필수 항목이 하나 이상 있어야 게시할 수 있어요."
            >
              {form.consents.map((consent, index) => (
                <div key={consent.code} className="hc-surface-well flex flex-col gap-2 rounded-2xl p-3">
                  <Field label="제목">
                    <input
                      className="hc-input h-11 rounded-xl border px-3 text-[14px]"
                      value={consent.title}
                      onChange={(e) =>
                        update({ consents: form.consents.map((c, i) => (i === index ? { ...c, title: e.target.value } : c)) })
                      }
                    />
                  </Field>
                  <Field label="본문">
                    <textarea
                      className="hc-input min-h-24 rounded-xl border px-3 py-2 text-[14px]"
                      value={consent.body}
                      onChange={(e) =>
                        update({ consents: form.consents.map((c, i) => (i === index ? { ...c, body: e.target.value } : c)) })
                      }
                    />
                  </Field>
                  <div className="flex items-center justify-between gap-2">
                    <Check
                      label="필수"
                      checked={consent.required}
                      onChange={(required) =>
                        update({ consents: form.consents.map((c, i) => (i === index ? { ...c, required } : c)) })
                      }
                    />
                    <button
                      type="button"
                      className="h-11 rounded-full px-3 text-[13px] text-(--hc-danger)"
                      onClick={() => update({ consents: form.consents.filter((_, i) => i !== index) })}
                    >
                      항목 지우기
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="hc-button-secondary h-11 self-start rounded-full px-4 text-[13px] font-semibold"
                onClick={() =>
                  update({
                    consents: [...form.consents, { code: newConsentCode(form.consents), title: "", body: "", required: true }],
                  })
                }
              >
                동의 항목 추가
              </button>
            </Section>

            <Section
              title="행사 화면 꾸미기"
              aside={inheritAside(["theme"])}
              description="참가 · 부스 · 결과 화면에 보이는 색과 글꼴, 로고, 문구예요. 게시하면 참가자 화면에 반영돼요."
            >
              <StudioPageTheme
                features={usage ? (usage.entitlement?.features ?? []) : null}
                workspaceId={event.workspaceId}
                value={form.theme}
                // 최신 폼 위에 적용한다 — 업로드를 기다리는 사이 바꾼 이름 등 테마 밖의 칸도 되돌리지 않게.
                onUploadingChange={setThemeUploading}
                onChange={(apply) => setForm((current) => (current ? { ...current, theme: apply(current.theme) } : current))}
              />
            </Section>

            <Section title="결과 보관" aside={inheritAside(["resultRetentionDays"])}>
              <Field
                label="보관 일수"
                help={`사진을 만든 날부터 이 기간 동안 참가자가 결과 링크로 다시 받고, 사진함에도 남아요. 지나면 사진이 지워져요 — 필요한 사진은 미리 받아 두세요.${
                  usage?.retentionDays ? ` 지금 이용권으로는 ${usage.retentionDays}일까지 정할 수 있어요.` : ""
                }`}
              >
                <input
                  type="number"
                  min={1}
                  max={usage?.retentionDays ?? undefined}
                  inputMode="numeric"
                  className="hc-input h-11 w-32 rounded-xl border px-3 text-[14px]"
                  value={form.retentionDays}
                  onChange={(e) => update({ retentionDays: e.target.value })}
                />
              </Field>
            </Section>
          </fieldset>

          {conflict ? (
            <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-(--hc-danger-border) p-4 text-[13px]">
              <p>다른 곳에서 이 행사 설정을 먼저 바꿨어요. 어떻게 할까요?</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="h-11 rounded-full border border-(--hc-border) px-4 font-semibold"
                  onClick={() => void reload()}
                >
                  저장된 설정 다시 불러오기
                </button>
                <button
                  type="button"
                  disabled={conflict.currentVersion === null || busy !== null}
                  className="h-11 rounded-full border border-(--hc-danger-border) px-4 font-semibold text-(--hc-danger)"
                  onClick={() => conflict.currentVersion !== null && void save(conflict.currentVersion)}
                >
                  내 설정으로 덮어쓰기
                </button>
              </div>
            </div>
          ) : null}

          {editable ? (
            <button
              type="submit"
              disabled={!dirty || busy !== null || themeUploading || !sourcesReady}
              className="hc-button-primary h-11 self-start rounded-full px-5 text-[14px] font-semibold disabled:opacity-50"
            >
              {busy === "save" ? "저장하는 중…" : themeUploading ? "이미지 올리는 중…" : "설정 저장"}
            </button>
          ) : null}
        </form>

        {event.settings.boothEnabled ? (
          <section aria-labelledby="studio-booth-title" className="flex flex-col gap-3">
            <h2 id="studio-booth-title" className="text-[18px] font-bold">
              부스 기기
            </h2>
            <StudioBoothDevices eventId={event.eventId} boothUrl={`${origin}/booth`} />
          </section>
        ) : null}

        <section aria-labelledby="studio-customers-title" className="flex flex-col gap-3">
          <h2 id="studio-customers-title" className="text-[18px] font-bold">
            행사 고객
          </h2>
          <p className="text-[13px] text-(--hc-muted)">
            신랑신부처럼 이 행사 사진만 볼 분을 초대해요. 공간의 다른 행사는 보이지 않아요.
          </p>
          <StudioEventCustomers eventId={event.eventId} />
        </section>

        <section aria-labelledby="studio-usage-title" className="flex flex-col gap-3">
          <h2 id="studio-usage-title" className="text-[18px] font-bold">
            이용권과 사용량
          </h2>
          <StudioEventUsage usage={usage} error={usageError} now={now} onRefresh={() => void loadUsage()} />
        </section>

        <section aria-labelledby="studio-run-title" className="flex flex-col gap-3">
          <h2 id="studio-run-title" className="text-[18px] font-bold">
            게시와 운영
          </h2>
          {violations.length > 0 ? (
            <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-(--hc-danger-border) p-4">
              <p className="text-[14px] font-semibold">게시하려면 아래를 고쳐 주세요.</p>
              <ul className="flex flex-col gap-2 text-[13px]">
                {violations.map((group) => (
                  <li key={group.key}>
                    <p>{group.message}</p>
                    <p className="text-[12px] text-(--hc-muted)">{group.reasons.join(" · ")}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {dirty ? <p className="text-[13px] text-(--hc-muted)">바꾼 설정을 저장한 뒤 게시할 수 있어요.</p> : null}
          <div className="flex flex-wrap gap-2">
            {event.status === "DRAFT" || event.status === "LIVE" ? (
              <RunButton busy={busy} action="publish" disabled={dirty} primary onRun={act}>
                {event.status === "DRAFT" ? "게시하기" : "바뀐 설정 게시"}
              </RunButton>
            ) : null}
            {event.status === "LIVE" && !event.paused ? (
              <RunButton busy={busy} action="pause" onRun={act}>
                일시 중지
              </RunButton>
            ) : null}
            {event.status === "LIVE" && event.paused ? (
              <RunButton busy={busy} action="resume" onRun={act}>
                다시 열기
              </RunButton>
            ) : null}
            {event.status === "LIVE" ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setConfirmClose(true)}
                className="h-11 rounded-full border border-(--hc-danger-border) px-4 text-[14px] font-semibold text-(--hc-danger) disabled:opacity-50"
              >
                촬영 종료
              </button>
            ) : null}
          </div>
          {event.status === "DRAFT" || event.status === "LIVE" ? null : (
            <p className="text-[13px] text-(--hc-muted)">촬영이 끝난 행사예요. 참가자는 결과 링크로 사진을 계속 받을 수 있어요.</p>
          )}
        </section>
      </div>

      {confirmClose ? (
        <ConfirmDialog
          title="촬영을 끝낼까요?"
          description="새 참가와 촬영을 더 받지 않아요. 이미 찍은 사진은 보관 기간 동안 결과 링크로 받을 수 있어요."
          confirmLabel="촬영 종료"
          runningLabel="끝내는 중…"
          running={busy === "close-capture"}
          destructive
          onClose={() => setConfirmClose(false)}
          onConfirm={() => void act("close-capture")}
        />
      ) : null}
    </main>
  );
}

function RunButton({
  action,
  busy,
  disabled,
  primary,
  children,
  onRun,
}: {
  action: EventAction;
  busy: null | "save" | EventAction;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
  onRun: (action: EventAction) => Promise<void>;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy !== null}
      onClick={() => void onRun(action)}
      className={`h-11 rounded-full px-4 text-[14px] font-semibold disabled:opacity-50 ${
        primary ? "hc-button-primary" : "border border-(--hc-border)"
      }`}
    >
      {busy === action ? "처리하는 중…" : children}
    </button>
  );
}

const ACTION_DONE: Record<EventAction, string> = {
  publish: "게시했어요. 참가 링크와 QR 을 나눠 주세요.",
  pause: "일시 중지했어요. 다시 열 때까지 새 촬영을 받지 않아요.",
  resume: "다시 열었어요.",
  "close-capture": "촬영을 끝냈어요.",
};

function Section({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: string;
  /** 제목 옆 — 상속 출처와 「기본값 따르기」. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[18px] font-bold">{title}</h2>
          {aside}
        </div>
        {description ? <p className="text-[13px] text-(--hc-muted)">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * 이름은 label 이, 도움말은 aria-describedby 가 맡는다. 도움말을 label 안에 넣으면 입력의 이름이
 * 「참가 주소게시한 뒤에는…」처럼 붙어 읽힌다.
 */
function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      {cloneElement(children, { id, ...(help ? { "aria-describedby": helpId } : {}) })}
      {help ? (
        <p id={helpId} className="text-[12px] text-(--hc-muted)">
          {help}
        </p>
      ) : null}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-[14px]">
      <input type="checkbox" className="size-5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const SOURCE_LABEL: Record<SettingSource | "MIXED", string> = {
  WORKSPACE: "공간 기본값",
  PROJECT: "프로젝트 기본값",
  EVENT: "이 행사에서 정함",
  MIXED: "일부는 기본값",
};

/**
 * 섹션 값의 출처(ADR-0009 §2-2)와 「기본값 따르기」. 기본값을 따르는 값을 이 화면에서 바꾸면 그 행사에서 정한 값이 된다.
 * 「기본값 따르기」는 저장할 때 그 필드를 null 로 보내 직접 값을 지운다(위 단계 값을 따른다).
 */
function InheritNote({
  source,
  following,
  canFollow,
  onFollow,
  onCancel,
}: {
  source: SettingSource | "MIXED" | null;
  following: boolean;
  canFollow: boolean;
  onFollow: () => void;
  onCancel: () => void;
}) {
  if (following) {
    return (
      <span className="flex items-center gap-2 text-[12px]">
        <span className="rounded-full bg-(--hc-surface-well) px-2 py-0.5">저장하면 기본값을 따라요</span>
        <button type="button" onClick={onCancel} className="h-11 px-2 font-semibold text-(--hc-muted) underline">
          취소
        </button>
      </span>
    );
  }
  if (!source) return null;
  return (
    <span className="flex items-center gap-2 text-[12px]">
      {source !== "EVENT" ? <span className="rounded-full bg-(--hc-surface-well) px-2 py-0.5">{SOURCE_LABEL[source]}</span> : null}
      {canFollow ? (
        <button type="button" onClick={onFollow} className="h-11 px-2 font-semibold text-(--hc-muted) underline">
          기본값 따르기
        </button>
      ) : null}
    </span>
  );
}
