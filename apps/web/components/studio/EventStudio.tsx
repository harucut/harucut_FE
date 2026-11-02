"use client";

import Link from "next/link";
import { cloneElement, useCallback, useEffect, useId, useState, useSyncExternalStore, type MouseEvent } from "react";
import { AppNav } from "@/components/layout/AppNav";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EventStatusBadge } from "@/components/studio/EventStatusBadge";
import { RunButton, StudioEventOverview, type StudioBusy } from "@/components/studio/StudioEventOverview";
import { StudioJoinLink, StudioPrintCard } from "@/components/studio/StudioJoinLink";
import { StudioSheet } from "@/components/studio/StudioSheet";
import { StudioSectionNav, onStudioSectionLink, scrollToStudioSection, type StudioSectionNavItem } from "@/components/studio/StudioSectionNav";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
import {
  DEFAULT_RETENTION_DAYS,
  STUDIO_SECTION_LABEL,
  draftChecklist,
  retentionMismatch,
  type StudioSectionId,
} from "@/lib/studio/eventSections";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getFrameConfig, type FrameId } from "@/constants/frames";
import { StudioBoothDevices } from "@/components/studio/StudioBoothDevices";
import type { EventPreviewData } from "@/components/participation/EventPreview";
import { StudioExperiencePreview } from "@/components/studio/StudioExperiencePreview";
import { StudioConsentItems, consentItemsOf, toConsentDrafts, type ConsentDraft } from "@/components/studio/StudioConsentItems";
import { StudioEventCustomers } from "@/components/studio/StudioEventCustomers";
import { StudioEventOperators } from "@/components/studio/StudioEventOperators";
import { CloneEventForm } from "@/components/studio/CloneEventForm";
import { StudioFramePicker, normalizeFrameRefs } from "@/components/studio/StudioFramePicker";
import { StudioPageTheme } from "@/components/studio/StudioPageTheme";
import { StudioFreeText } from "@/components/studio/StudioFreeText";
import type { FreeTextSettings } from "@/lib/event/freeText";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
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
import { EVENT_OPERATIONS, listMyEvents, type EventOperation, type MyEvent } from "@/lib/studio/accessApi";
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
  listBoothDevices,
  publishViolations,
  runEventAction,
  updateEventSettings,
  type EventAction,
  type EventKind,
  type EventLayout,
  type EventSettings,
  type FrameRef,
  type PickableFrameVersion,
  type StudioEvent,
} from "@/lib/studio/studioApi";

const LAYOUTS: EventLayout[] = ["CLASSIC", "WIDE", "GRID", "POLAROID"];

const SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;

/** 저장·게시 알림이 바에 머무는 시간. 실패 알림은 다음 동작까지 남는다. */
const OK_NOTICE_MS = 6_000;

/**
 * 이 브라우저에서 마지막으로 게시한 때의 settingsVersion. 서버는 「저장본이 게시본과 같은가」를 알려 주지 않아서,
 * 여기서 게시했을 때의 값과 견준다. 모르면(다른 기기에서 게시함) 비교하지 않고 게시를 그대로 열어 둔다.
 */
function publishedMarkerKey(eventId: string) {
  return `harucut:studio:published-settings:${eventId}`;
}
function readPublishedMarker(eventId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(publishedMarkerKey(eventId));
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}
function writePublishedMarker(eventId: string, settingsVersion: number) {
  try {
    window.localStorage.setItem(publishedMarkerKey(eventId), String(settingsVersion));
  } catch {
    // 저장소를 못 쓰면 다음에 비교하지 못할 뿐이다.
  }
}


type Form = {
  name: string;
  slug: string;
  kind: EventKind;
  startsAt: string;
  endsAt: string;
  byod: boolean;
  booth: boolean;
  layouts: EventLayout[];
  consents: ConsentDraft[];
  frames: FrameRef[];
  retentionDays: string;
  theme: PageTheme;
  /** 자유 문구. 저장된 값이 없으면(어디에도 없음) 끈 것으로 본다 — 바꾸지 않으면 settingsPatch 가 보내지 않는다. */
  freeText: FreeTextSettings;
  /** 프로젝트 public id. 빈 문자열이면 프로젝트 없음. */
  projectId: string;
};

function formOf(settings: EventSettings): Form {
  return {
    name: settings.name ?? "",
    slug: settings.slug ?? "",
    kind: settings.kind === "ALWAYS_ON" ? "ALWAYS_ON" : "SCHEDULED",
    startsAt: toLocalInputValue(settings.captureStartsAt),
    endsAt: toLocalInputValue(settings.captureEndsAt),
    byod: Boolean(settings.byodEnabled),
    booth: Boolean(settings.boothEnabled),
    layouts: LAYOUTS.filter((l) => settings.allowedLayouts?.includes(l)),
    consents: toConsentDrafts(settings.consentItems),
    frames: [...(settings.frames ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    retentionDays: String(settings.resultRetentionDays ?? DEFAULT_RETENTION_DAYS),
    theme: parsePageTheme(settings.theme),
    freeText: settings.freeText?.enabled ? settings.freeText : { enabled: false },
    projectId: settings.projectId ?? "",
  };
}

/**
 * 폼 → PATCH 본문. 테마는 빈 값을 뺀 모양으로 보내고, 꾸민 것이 없으면 null(테마 없음)이다.
 * 동의 항목의 version 은 문구가 바뀌었을 때만 올린다(consentItemsOf).
 */
function settingsOf(form: Form, saved: EventSettings): EventSettings {
  const retention = Number.parseInt(form.retentionDays, 10);
  return {
    name: form.name.trim(),
    slug: form.slug,
    kind: form.kind,
    captureStartsAt: toServerDateTime(form.startsAt),
    captureEndsAt: toServerDateTime(form.endsAt),
    byodEnabled: form.byod,
    boothEnabled: form.booth,
    allowedLayouts: form.layouts,
    frames: form.frames,
    consentItems: consentItemsOf(form.consents, saved.consentItems),
    resultRetentionDays: Number.isFinite(retention) && retention > 0 ? retention : null,
    theme: themeForSave(form.theme),
    freeText: form.freeText,
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


// 참가 링크는 이 화면의 오리진에 붙인다 — 서버는 프론트 도메인을 모른다(joinUrlPath 는 상대 경로).
function subscribeNothing() {
  return () => {};
}
function useOrigin() {
  return useSyncExternalStore(subscribeNothing, () => window.location.origin, () => "");
}

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; event: StudioEvent };

/** 내 운영 권한. undefined 는 받는 중, null 은 못 받음(서버가 판정하게 다 보인다 — 막히면 그 칸이 오류를 보인다). */
type Access = MyEvent["access"] | null | undefined;

export function EventStudio({ eventId }: { eventId: string }) {
  const router = useRouter();
  const origin = useOrigin();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<StudioBusy>(null);
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
  const [access, setAccess] = useState<Access>(undefined);
  // 「행사 고객」과 「행사 운영자」는 같은 권한 행을 본다(Codex #554). 한쪽이 행을 만들거나 지우면 다른 쪽을 다시 그려 목록을 새로 받는다.
  const [customersVersion, setCustomersVersion] = useState(0);
  const [operatorsVersion, setOperatorsVersion] = useState(0);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [publishedSheet, setPublishedSheet] = useState(false);
  const [publishedMarker, setPublishedMarker] = useState<number | null>(() => readPublishedMarker(eventId));
  // 저장 안 한 변경이 있을 때 나가려던 곳. 확인을 받으면 그리로 간다.
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  // 연결된 부스 기기 수. 권한이 없거나 못 받으면 null — 계기판에서 그 칸을 뺀다.
  const [deviceCount, setDeviceCount] = useState<number | null>(null);
  // 고를 수 있는 프레임 발행본. 참가자 문구 칸을 실제 프레임 위에서 잡으려고 기억한다.
  const [pickable, setPickable] = useState<PickableFrameVersion[]>([]);
  const [themeAssets, setThemeAssets] = useState<{ logoUrl?: string; backgroundUrl?: string }>({});
  // 좁은 화면에서는 펼칠 때만 미리보기를 띄운다. 넓은 화면은 오른쪽 칸에 늘 있다.
  const [inlinePreview, setInlinePreview] = useState(false);

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
      setUsageError(getUserFacingApiErrorMessage(error, "이용권 정보를 불러오지 못했어요. 아래에서 다시 불러와 주세요."));
    }
  }, [eventId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void reload();
    void loadUsage();
  }, [reload, loadUsage]);

  // 운영 담당(OPERATOR)은 받은 운영 권한의 칸만 쓴다(ADR-0009 §3, P3-2). 판정은 서버가 하고 화면은 그 결과를 따른다.
  useEffect(() => {
    let cancelled = false;
    listMyEvents()
      .then((events) => !cancelled && setAccess(events.find((e) => e.eventId === eventId)?.access ?? null))
      .catch(() => !cancelled && setAccess(null));
    return () => {
      cancelled = true;
    };
  }, [eventId]);

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

  useEffect(() => {
    if (notice?.kind !== "ok") return;
    const timer = window.setTimeout(() => setNotice(null), OK_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const boothOn = load.state === "ready" && Boolean(load.event.settings.boothEnabled);
  useEffect(() => {
    if (!boothOn) return;
    let cancelled = false;
    listBoothDevices(eventId)
      .then((devices) => !cancelled && setDeviceCount(devices.filter((d) => d.status === "ACTIVE").length))
      .catch(() => !cancelled && setDeviceCount(null));
    return () => {
      cancelled = true;
    };
  }, [boothOn, eventId]);

  if (load.state !== "ready" || !form) {
    return (
      <main className="hc-page-app min-h-dvh text-(--hc-text)">
        <AppNav />
        <div className="mx-auto flex w-full max-w-200 flex-col gap-4 px-4 py-6">
          <div className="lg:hidden">
            <PageHeader backHref="/studio" backLabel="행사 목록" />
          </div>
          {load.state === "error" ? (
            <div className="flex flex-col items-start gap-3">
              <p role="alert" className="text-[14px] text-(--hc-danger)">
                {load.message}
              </p>
              <button
                type="button"
                onClick={() => void reload()}
                className="hc-button-secondary h-11 rounded-full px-4 text-[13px] font-semibold"
              >
                다시 시도
              </button>
            </div>
          ) : (
            <p role="status" className="text-[14px] text-(--hc-muted)">
              불러오는 중…
            </p>
          )}
        </div>
      </main>
    );
  }

  const event = load.event;
  // 옛 서버는 operations 키가 없다 — 그때는 지금처럼 다 보인다.
  const can = (op: EventOperation) =>
    access === null || (access !== undefined && (access.operations ?? EVENT_OPERATIONS).includes(op));
  const isAdmin = access === null || access?.role === "OWNER" || access?.role === "ADMIN";
  // 운영 담당의 복제는 MANAGE_EVENT 를 받은 프로젝트 안에서만 된다(원본 프로젝트로 복제).
  const canClone =
    isAdmin || (Boolean(event.settings.projectId) && ["PROJECT", "BOTH"].includes(access?.sources?.MANAGE_EVENT ?? ""));
  const editable = (event.status === "DRAFT" || event.status === "LIVE") && can("MANAGE_EVENT");
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
  // 「기본값 따르기」를 고른 섹션을 다시 고치면 그 선택을 푼다 — 안 그러면 저장할 때 새 입력을 버리고 null 을 보낸다(Codex #553).
  const FORM_TO_FIELDS: Partial<Record<keyof Form, InheritableField[]>> = {
    byod: ["byodEnabled"],
    booth: ["boothEnabled"],
    layouts: ["allowedLayouts"],
    frames: ["frames"],
    consents: ["consentItems"],
    retentionDays: ["resultRetentionDays"],
    theme: ["theme"],
    freeText: ["freeText"],
  };
  const stopFollowing = (fields: InheritableField[]) =>
    setInherit((prev) => (fields.some((f) => prev.has(f)) ? new Set([...prev].filter((f) => !fields.includes(f))) : prev));
  const update = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch });
    stopFollowing(Object.keys(patch).flatMap((k) => FORM_TO_FIELDS[k as keyof Form] ?? []));
  };

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
        setNotice({ kind: "error", text: getUserFacingApiErrorMessage(error, "설정을 저장하지 못했어요. 입력은 그대로 있으니 다시 눌러 주세요.") });
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
      const result = await runEventAction(event.eventId, action);
      accept(result);
      if (action === "publish") {
        writePublishedMarker(event.eventId, result.settingsVersion);
        setPublishedMarker(result.settingsVersion);
        setPublishedSheet(true);
      } else {
        setNotice({ kind: "ok", text: ACTION_DONE[action] });
      }
    } catch (error) {
      if (action === "publish" && getApiErrorDetails(error).code === EVENT_PUBLISH_INVALID_CODE) {
        setViolations(groupViolations(publishViolations(error)));
        // 어디서 눌렀든 위반 목록이 보이는 자리로 올라간다. 고칠 구역은 목차의 점과 목록의 링크가 알려 준다.
        scrollToStudioSection("overview");
      } else {
        setNotice({
          kind: "error",
          text: getUserFacingApiErrorMessage(error, "처리하지 못했어요. 잠시 뒤 다시 눌러 주세요."),
        });
      }
    } finally {
      setBusy(null);
      setConfirmClose(false);
      setPublishConfirm(false);
    }
  };

  /** 저장 안 한 변경이 있으면 나가기 전에 묻는다. 새로고침·탭 닫기는 UnsavedGuard 가 맡는다. */
  const guardLeave = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!dirty) return;
    event.preventDefault();
    setLeaveTo(href);
  };

  // 저장본과 게시본 비교(publishedMarker 주석). LIVE 에서만 뜻이 있다.
  const isLive = event.status === "LIVE";
  const inSync = isLive && publishedMarker === event.settingsVersion;
  const savedNotPublished = isLive && publishedMarker !== null && publishedMarker !== event.settingsVersion;
  const canPublish = can("MANAGE_EVENT") && (event.status === "DRAFT" || isLive);
  const canSave = !dirty || busy !== null || themeUploading || !sourcesReady;
  const trySave = () => {
    if (dirty && busy === null && !themeUploading && sourcesReady) void save();
  };

  const designed =
    Object.values(form.theme.colors ?? {}).some(Boolean) ||
    (form.theme.font !== undefined && form.theme.font !== "SYSTEM") ||
    Boolean(form.theme.logoAssetId || form.theme.backgroundAssetId);
  const checklist = draftChecklist({
    byod: form.byod,
    booth: form.booth,
    layouts: form.layouts,
    frames: form.frames,
    consents: form.consents,
    kind: form.kind,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    designed,
    usage,
  });
  const retentionNumber = Number.parseInt(form.retentionDays, 10);
  const mismatchedDays = Number.isFinite(retentionNumber)
    ? retentionMismatch(form.consents.map((c) => c.body), retentionNumber)
    : [];
  const mismatchCopy =
    mismatchedDays.length > 0
      ? `동의문에는 ${mismatchedDays.join("·")}일이라고 적혀 있는데, 결과 보관 일수는 ${retentionNumber}일이에요. 둘을 맞춰 주세요.`
      : null;
  const noEntitlement = usage !== undefined && !usage.entitlement && !usageError;
  const slugInvalid = !slugLocked && !SLUG_PATTERN.test(form.slug);

  // 목차. 고칠 곳에는 점을 찍는다 — 게시 전 체크리스트(초안)와 게시 위반에서 온다.
  const attention = new Set<StudioSectionId>([
    ...(event.status === "DRAFT" ? checklist.filter((row) => row.state === "todo").map((row) => row.anchor) : []),
    ...violations.flatMap((group) => (group.anchor ? [group.anchor] : [])),
  ]);
  const showBooth = Boolean(event.settings.boothEnabled) && can("MANAGE_BOOTH");
  const showPeople = can("INVITE_CUSTOMERS") || (access !== undefined && isAdmin);
  const sections: StudioSectionId[] = [
    "overview",
    "basics",
    "participation",
    "frames",
    "consent",
    "design",
    ...(showBooth ? (["booth"] as const) : []),
    ...(showPeople ? (["people"] as const) : []),
    "entitlement",
  ];
  const navItems: StudioSectionNavItem[] = sections.map((id) => ({
    id,
    label: STUDIO_SECTION_LABEL[id],
    attention: attention.has(id),
  }));
  const reasonsOf = (anchor: StudioSectionId) =>
    violations.filter((group) => group.anchor === anchor).flatMap((group) => group.reasons);

  const listHref = `/studio?workspace=${encodeURIComponent(event.workspaceId)}`;
  const photosHref = `/studio/events/${encodeURIComponent(event.eventId)}/photos`;
  const eventName = event.settings.name || "이름 없는 행사";
  const defaultRef = form.frames.find((f) => f.isDefault) ?? form.frames[0] ?? null;
  const freeTextLayout = FRAME_LAYOUTS[frameIdFromFrameType(defaultRef?.layoutType ?? form.layouts[0] ?? "CLASSIC")];
  const freeTextFrameUrl = defaultRef
    ? (pickable.find((v) => v.frameVersionId === defaultRef.frameVersionId)?.previewUrl ?? undefined)
    : undefined;

  /*
    실제 참가 화면 미리보기(StudioExperiencePreview)가 들어갈 자리. 값이 생기면 xl 에서 오른쪽 340px 칸이 열리고
    화면 폭 상한도 함께 넓어진다. 비어 있으면 칸을 비워 두지 않는다.
  */
  const previewData: EventPreviewData = {
    name: form.name.trim() || "이름 없는 행사",
    theme: {
      schemaVersion: 1,
      colors: form.theme.colors,
      font: form.theme.font,
      copy: form.theme.copy,
      branding: form.theme.branding,
      logoUrl: themeAssets.logoUrl,
      backgroundUrl: themeAssets.backgroundUrl,
    },
    frames: form.frames.map((ref) => ({
      frameVersionId: ref.frameVersionId,
      layoutType: ref.layoutType,
      sortOrder: ref.sortOrder,
      isDefault: ref.isDefault,
      previewUrl: pickable.find((version) => version.frameVersionId === ref.frameVersionId)?.previewUrl ?? undefined,
    })),
    consentItems: consentItemsOf(form.consents, event.settings.consentItems),
  };
  const previewPanel: React.ReactNode = <StudioExperiencePreview data={previewData} />;

  return (
    <main className="hc-page-app min-h-dvh pb-32 text-(--hc-text) lg:pb-16">
      <AppNav />
      <UnsavedGuard active={dirty} />
      <StudioPrintCard name={eventName} url={joinUrl} />

      {/*
        저장과 게시는 어디까지 내려가도 손 닿는 곳에 있다. 넓은 화면은 네비 아래 위쪽, 좁은 화면은 엄지가 닿는 아래쪽이다.
        요소는 하나고 배치만 바뀐다. 알림도 이 안에 뜬다 — 예전에는 누른 자리에서 수천 픽셀 위에 떠서 아무 일도 없는 것처럼 보였다.
      */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-(--hc-border) bg-(--hc-surface-soft) backdrop-blur-xl lg:sticky lg:bottom-auto lg:top-17 lg:border-b lg:border-t-0">
        <div className={`mx-auto flex w-full flex-col gap-2 px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 lg:pb-2.5 ${previewPanel ? "max-w-350" : "max-w-250"}`}>
          {notice ? (
            <p
              role={notice.kind === "ok" ? "status" : "alert"}
              className={
                notice.kind === "ok"
                  ? "hc-feedback rounded-xl border px-3 py-2 text-[13px]"
                  : "rounded-xl border border-(--hc-danger-border) bg-(--hc-danger-soft-bg) px-3 py-2 text-[13px] text-(--hc-danger)"
              }
            >
              {notice.text}
            </p>
          ) : null}
          {conflict ? (
            <div role="alert" className="flex flex-col gap-2 rounded-xl border border-(--hc-danger-border) p-3 text-[13px]">
              <p>다른 곳에서 이 행사 설정을 먼저 바꿨어요. 어떻게 할까요?</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="h-11 rounded-full border border-(--hc-border) px-4 font-semibold transition hover:border-(--hc-border-strong)"
                  onClick={() => void reload()}
                >
                  저장된 설정 다시 불러오기
                </button>
                <button
                  type="button"
                  disabled={conflict.currentVersion === null || busy !== null}
                  className="h-11 rounded-full border border-(--hc-danger-border) px-4 font-semibold text-(--hc-danger) disabled:opacity-50"
                  onClick={() => conflict.currentVersion !== null && void save(conflict.currentVersion)}
                >
                  내 설정으로 덮어쓰기
                </button>
              </div>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <div className="hidden min-w-0 items-center gap-2.5 lg:flex">
              <p className="min-w-0 max-w-[26ch] truncate text-[15px] font-extrabold">{eventName}</p>
              <EventStatusBadge event={event} />
            </div>
            <p aria-live="polite" className="min-w-0 flex-1 text-[12px] leading-tight text-(--hc-muted) lg:pl-1">
              {dirty ? (
                <>
                  <span className="font-semibold text-(--hc-text)">저장 안 됨</span>
                  {canPublish ? <span className="hidden sm:inline"> 바꾼 설정을 저장한 뒤 게시할 수 있어요.</span> : null}
                </>
              ) : savedNotPublished ? (
                "저장했지만 아직 게시 안 함"
              ) : inSync ? (
                "게시본과 같아요"
              ) : event.status === "DRAFT" ? (
                "초안 저장됨"
              ) : null}
            </p>
            {editable ? (
              <button
                type="button"
                onClick={trySave}
                disabled={canSave}
                className={`h-11 shrink-0 rounded-full px-4 text-[14px] font-semibold transition disabled:opacity-50 ${
                  dirty ? "hc-button-primary" : "border border-(--hc-border)"
                }`}
              >
                {busy === "save" ? "저장하는 중…" : themeUploading ? "이미지 올리는 중…" : "설정 저장"}
              </button>
            ) : null}
            {canPublish ? (
              <RunButton
                busy={busy}
                action="publish"
                disabled={dirty || inSync}
                primary={!dirty && !inSync}
                onRun={() => setPublishConfirm(true)}
              >
                {event.status === "DRAFT" ? "게시하기" : inSync ? "게시됨" : "바뀐 설정 게시"}
              </RunButton>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={`mx-auto grid w-full grid-cols-[minmax(0,1fr)] gap-x-10 px-4 lg:py-8 ${
          previewPanel
            ? "max-w-350 lg:grid-cols-[176px_minmax(0,1fr)] xl:grid-cols-[176px_minmax(0,1fr)_340px]"
            : "max-w-250 lg:grid-cols-[176px_minmax(0,1fr)]"
        }`}
      >
        <StudioSectionNav
          items={navItems}
          header={
            <Link
              href={listHref}
              onClick={(e) => guardLeave(e, listHref)}
              className="flex h-11 items-center gap-1 rounded-xl px-3.5 text-[13px] font-semibold text-(--hc-muted) transition hover:text-(--hc-text)"
            >
              <ChevronLeft aria-hidden className="size-4" />
              행사 목록
            </Link>
          }
        />

        <div className="flex min-w-0 flex-col gap-8 py-5 lg:py-0">
          <div className="flex flex-col gap-3">
            <div className="lg:hidden">
              <PageHeader backHref={listHref} backLabel="행사 목록" onBackClick={(e) => guardLeave(e, listHref)} />
            </div>
            <header className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="min-w-0 break-words text-[30px] font-extrabold leading-tight tracking-tight">{eventName}</h1>
              <span className="lg:hidden">
                <EventStatusBadge event={event} />
              </span>
            </header>
            <div className="flex flex-wrap gap-2">
              <Link
                href={photosHref}
                onClick={(e) => guardLeave(e, photosHref)}
                className="hc-button-secondary flex h-11 items-center rounded-full px-4 text-[13px] font-semibold"
              >
                사진함
              </Link>
              {canClone ? (
                <button
                  type="button"
                  onClick={() => setCloning(true)}
                  className="h-11 rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold transition hover:border-(--hc-border-strong)"
                >
                  행사 복제
                </button>
              ) : null}
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
            {noEntitlement ? (
              <p role="status" className="rounded-2xl border border-(--hc-danger-border) p-3 text-[13px]">
                이용권이 없어 아직 게시할 수 없어요. 설정은 먼저 해 둘 수 있어요.{" "}
                <a
                  href="#entitlement"
                  onClick={(e) => onStudioSectionLink(e, "entitlement")}
                  className="font-semibold underline underline-offset-4"
                >
                  이용권 보기
                </a>
              </p>
            ) : null}
            {access !== undefined && !can("MANAGE_EVENT") ? (
              <p className="text-[13px] text-(--hc-muted)">행사 설정과 게시는 「행사 설정·게시」 권한이 있어야 바꿀 수 있어요.</p>
            ) : null}
          </div>

          <Group id="overview" first hideTitle>
            <StudioEventOverview
              event={event}
              usage={usage}
              deviceCount={showBooth ? deviceCount : null}
              checklist={checklist}
              violations={violations}
              canManage={can("MANAGE_EVENT")}
              busy={busy}
              joinUrl={origin ? joinUrl : ""}
              onRun={(action) => void act(action)}
              onRequestClose={() => setConfirmClose(true)}
            />
          </Group>

          <form
            className="flex flex-col gap-8"
            onSubmit={(e) => {
              e.preventDefault();
              trySave();
            }}
          >
            <fieldset disabled={!editable || busy !== null} className="flex min-w-0 flex-col gap-8">
              <Group id="basics" reasons={reasonsOf("basics")}>
                <Section title="기본 정보">
                  <Field label="행사 이름">
                    <input
                      name="eventName"
                      autoComplete="off"
                      className="hc-input h-11 rounded-xl border px-3 text-[14px]"
                      value={form.name}
                      maxLength={100}
                      onChange={(e) => update({ name: e.target.value })}
                    />
                  </Field>
                  <Field
                    label="참가 주소"
                    help={slugLocked ? "게시한 뒤에는 바꿀 수 없어요." : "영문 소문자·숫자·하이픈 3~40자."}
                    invalid={slugInvalid}
                  >
                    <input
                      name="eventSlug"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      translate="no"
                      className="hc-input h-11 rounded-xl border px-3 text-[14px]"
                      value={form.slug}
                      maxLength={40}
                      disabled={slugLocked}
                      aria-invalid={slugInvalid || undefined}
                      onChange={(e) => update({ slug: e.target.value.toLowerCase() })}
                    />
                  </Field>
                  {projects.length > 0 || form.projectId ? (
                    <Field
                      label="프로젝트"
                      help={
                        event.status !== "DRAFT"
                          ? "게시한 행사는 프로젝트를 바꿀 수 없어요."
                          : !isAdmin
                            ? "프로젝트는 공간 관리자만 바꿀 수 있어요."
                            : "고르면 그 프로젝트의 기본값(참가 방식·프레임·동의·꾸미기 등)을 따라요. 저장하면 반영돼요."
                      }
                    >
                      <select
                        name="eventProject"
                        className="hc-input h-11 rounded-xl border px-2 text-[14px]"
                        value={form.projectId}
                        disabled={event.status !== "DRAFT" || !isAdmin}
                        onChange={(e) => update({ projectId: e.target.value })}
                      >
                        <option value="">프로젝트 없음</option>
                        {/* 운영 담당은 멤버인 프로젝트만 받는다 — 목록에 없는 현재 프로젝트도 비어 보이지 않게 남긴다. */}
                        {form.projectId && !projects.some((p) => p.projectId === form.projectId) ? (
                          <option value={form.projectId}>다른 프로젝트</option>
                        ) : null}
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

                <Section
                  title="촬영 기간"
                  description={
                    form.kind === "ALWAYS_ON"
                      ? "상시 캠페인은 끝나는 시각 없이 「촬영 종료」를 누를 때까지 열려 있어요. 이용권 기간과 한도는 그대로 적용돼요."
                      : "비워 두면 게시하는 즉시 시작하고, 「촬영 종료」를 누를 때까지 열려 있어요. 시각은 한국 시간이에요."
                  }
                >
                  <Field label="행사 종류" help={slugLocked ? "게시한 뒤에는 바꿀 수 없어요." : undefined}>
                    <select
                      name="eventKind"
                      className="hc-input h-11 rounded-xl border px-2 text-[14px]"
                      value={form.kind}
                      disabled={slugLocked}
                      // 상시로 바꾸면 종료 시각을 비운다 — 남겨 두면 게시 검사에서 막힌다.
                      onChange={(e) => {
                        const kind = e.target.value as EventKind;
                        update(kind === "ALWAYS_ON" ? { kind, endsAt: "" } : { kind });
                      }}
                    >
                      <option value="SCHEDULED">정해진 기간의 행사</option>
                      <option value="ALWAYS_ON">상시 캠페인</option>
                    </select>
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="시작">
                      <input
                        name="captureStartsAt"
                        type="datetime-local"
                        className="hc-input h-11 rounded-xl border px-3 text-[14px]"
                        value={form.startsAt}
                        onChange={(e) => update({ startsAt: e.target.value })}
                      />
                    </Field>
                    {form.kind === "SCHEDULED" ? (
                      <Field label="종료">
                        <input
                          name="captureEndsAt"
                          type="datetime-local"
                          className="hc-input h-11 rounded-xl border px-3 text-[14px]"
                          value={form.endsAt}
                          onChange={(e) => update({ endsAt: e.target.value })}
                        />
                      </Field>
                    ) : form.endsAt ? (
                      // 상시 캠페인에는 종료 시각이 없다. 저장된 값이 남았으면 지우기만 한다 — 게시한 상시 행사에 값을 넣으면 서버가 GEN-002 로 막는다.
                      <div className="flex flex-col gap-1.5">
                        <p className="text-[13px] font-semibold">종료</p>
                        <p className="text-[14px]">{form.endsAt.replace("T", " ")}</p>
                        <button
                          type="button"
                          onClick={() => update({ endsAt: "" })}
                          className="h-11 self-start rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold"
                        >
                          종료 시각 지우기
                        </button>
                        <p className="text-[12px] text-(--hc-muted)">상시 캠페인은 종료 시각을 비워야 게시할 수 있어요.</p>
                      </div>
                    ) : null}
                  </div>
                </Section>
              </Group>

              <Group id="participation" aside={inheritAside(["byodEnabled", "boothEnabled"])} reasons={reasonsOf("participation")}>
                <div className="flex flex-col">
                  <Check name="byodEnabled" label="개인 휴대폰 (링크·QR)" checked={form.byod} onChange={(byod) => update({ byod })} />
                  <Check name="boothEnabled" label="현장 부스" checked={form.booth} onChange={(booth) => update({ booth })} />
                </div>
              </Group>

              <Group id="frames" reasons={reasonsOf("frames")}>
                <Section title="허용 레이아웃" aside={inheritAside(["allowedLayouts"])} description="참가자가 고를 수 있는 컷 구성이에요. 고른 레이아웃마다 제공 프레임이 하나 이상 있어야 게시할 수 있어요.">
                  <div className="grid gap-x-2 sm:grid-cols-2">
                    {LAYOUTS.map((layout) => (
                      <Check
                        key={layout}
                        name={`allowedLayout-${layout}`}
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
                    onCatalog={setPickable}
                  />
                </Section>
              </Group>

              <Group id="consent" reasons={reasonsOf("consent")}>
                <Section
                  title="참가 동의"
                  aside={inheritAside(["consentItems"])}
                  description="사진을 받는 주체, 목적, 보관 기간을 참가자가 촬영 전에 읽고 동의해요. 필수 항목이 하나 이상 있어야 게시할 수 있어요."
                >
                  <StudioConsentItems value={form.consents} onChange={(consents) => update({ consents })} />
                </Section>

                <Section title="결과 보관" aside={inheritAside(["resultRetentionDays"])}>
                  <Field
                    label="보관 일수"
                    help={`사진을 만든 날부터 이 기간 동안 참가자가 결과 링크로 다시 받고, 사진함에도 남아요. 지나면 사진이 지워지니 필요한 사진은 미리 받아 두세요.${
                      usage?.retentionDays ? ` 지금 이용권으로는 ${usage.retentionDays}일까지 정할 수 있어요.` : ""
                    }`}
                  >
                    <input
                      name="resultRetentionDays"
                      type="number"
                      min={1}
                      max={usage?.retentionDays ?? undefined}
                      inputMode="numeric"
                      className="hc-input h-11 w-32 rounded-xl border px-3 text-[14px]"
                      value={form.retentionDays}
                      onChange={(e) => update({ retentionDays: e.target.value })}
                    />
                  </Field>
                  {mismatchCopy ? (
                    <p role="status" className="max-w-[65ch] rounded-2xl border border-(--hc-danger-border) p-3 text-[13px]">
                      {mismatchCopy}
                    </p>
                  ) : null}
                </Section>
              </Group>

              <Group id="design" reasons={reasonsOf("design")}>
                <details
                  className="hc-surface-card rounded-2xl border px-4 xl:hidden"
                  onToggle={(e) => setInlinePreview(e.currentTarget.open)}
                >
                  <summary className="flex min-h-12 cursor-pointer items-center text-[14px] font-bold">참가자 화면 미리 보기</summary>
                  {inlinePreview ? <div className="pb-4">{previewPanel}</div> : null}
                </details>
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
                    onAssetPreview={setThemeAssets}
                    showSample={false}
                    onChange={(apply) => {
                      setForm((current) => (current ? { ...current, theme: apply(current.theme) } : current));
                      stopFollowing(["theme"]);
                    }}
                  />
                </Section>

                <Section
                  title="참가자 문구"
                  aside={inheritAside(["freeText"])}
                  description="참가자가 사진에 넣을 짧은 문구를 직접 써요. 정한 칸에 고른 글꼴로 서버가 그려서, 미리보기와 결과가 같아요."
                >
                  <StudioFreeText
                    value={form.freeText}
                    onChange={(freeText) => update({ freeText })}
                    canvasAspect={freeTextLayout.totalWidth / freeTextLayout.totalHeight}
                    frameUrl={freeTextFrameUrl}
                    disabled={!editable || busy !== null}
                  />
                </Section>
              </Group>
            </fieldset>
          </form>

          {showBooth ? (
            <Group id="booth">
              <section aria-labelledby="studio-booth-title" className="flex flex-col gap-3">
                <h3 id="studio-booth-title" className="text-[18px] font-bold">
                  부스 기기
                </h3>
                <StudioBoothDevices eventId={event.eventId} boothUrl={`${origin}/booth`} />
              </section>
            </Group>
          ) : null}

          {showPeople ? (
            <Group id="people">
              {can("INVITE_CUSTOMERS") ? (
                <section aria-labelledby="studio-customers-title" className="flex flex-col gap-3">
                  <h3 id="studio-customers-title" className="text-[18px] font-bold">
                    행사 고객
                  </h3>
                  <p className="max-w-[65ch] text-[13px] text-(--hc-muted)">
                    신랑신부처럼 이 행사 사진만 볼 분을 초대해요. 공간의 다른 행사는 보이지 않아요.
                  </p>
                  <StudioEventCustomers
                    key={customersVersion}
                    eventId={event.eventId}
                    onRemoved={() => setOperatorsVersion((v) => v + 1)}
                  />
                </section>
              ) : null}

              {access !== undefined && isAdmin ? (
                <section aria-labelledby="studio-operators-title" className="flex flex-col gap-3">
                  <h3 id="studio-operators-title" className="text-[18px] font-bold">
                    행사 운영자
                  </h3>
                  <p className="max-w-[65ch] text-[13px] text-(--hc-muted)">
                    운영 담당 멤버에게 이 행사만 맡겨요. 공간의 다른 행사는 보이지 않아요.
                  </p>
                  <StudioEventOperators
                    key={operatorsVersion}
                    eventId={event.eventId}
                    workspaceId={event.workspaceId}
                    onSaved={() => setCustomersVersion((v) => v + 1)}
                  />
                </section>
              ) : null}
            </Group>
          ) : null}

          <Group id="entitlement" reasons={reasonsOf("entitlement")}>
            <StudioEventUsage usage={usage} error={usageError} now={now} onRefresh={() => void loadUsage()} />
          </Group>
        </div>

        {previewPanel ? (
          <aside className="hidden max-h-[calc(100dvh-9.5rem)] overflow-y-auto xl:sticky xl:top-36 xl:block xl:self-start">{previewPanel}</aside>
        ) : null}
      </div>

      {publishConfirm ? (
        <StudioSheet
          title={event.status === "DRAFT" ? "이대로 게시할까요?" : "바뀐 설정을 게시할까요?"}
          description={
            event.status === "DRAFT"
              ? "게시하면 참가 링크가 열리고 참가자가 들어올 수 있어요."
              : "이미 촬영을 시작한 손님은 받았던 설정으로 끝내고, 새 손님부터 바뀐 설정을 써요."
          }
          closable={busy === null}
          onClose={() => setPublishConfirm(false)}
        >
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
            <dt className="text-(--hc-muted)">행사 이름</dt>
            <dd className="break-words font-semibold">{form.name || "이름 없는 행사"}</dd>
            <dt className="text-(--hc-muted)">촬영 기간</dt>
            <dd>{periodCopy(form)}</dd>
            <dt className="text-(--hc-muted)">참가 방식</dt>
            <dd>{[form.byod ? "개인 휴대폰" : null, form.booth ? "현장 부스" : null].filter(Boolean).join(" · ") || "없음"}</dd>
            <dt className="text-(--hc-muted)">제공 프레임</dt>
            <dd>
              <span className="font-mono tabular-nums">{form.frames.length}</span>개
            </dd>
            <dt className="text-(--hc-muted)">결과 보관</dt>
            <dd>
              <span className="font-mono tabular-nums">{form.retentionDays}</span>일
            </dd>
            <dt className="text-(--hc-muted)">참가 주소</dt>
            <dd translate="no" className="break-all">
              {joinUrl}
            </dd>
          </dl>
          {event.status === "DRAFT" ? <p className="text-[13px] font-semibold">주소는 게시한 뒤에 바꿀 수 없어요.</p> : null}
          {mismatchCopy ? <p className="rounded-2xl border border-(--hc-danger-border) p-3 text-[13px]">{mismatchCopy}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setPublishConfirm(false)}
              className="h-11 flex-1 rounded-full border border-(--hc-border) text-[14px] font-semibold disabled:opacity-50"
            >
              다시 볼게요
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void act("publish")}
              className="hc-button-primary h-11 flex-1 rounded-full text-[14px] font-semibold disabled:opacity-50"
            >
              {busy === "publish" ? "게시하는 중…" : "이대로 게시"}
            </button>
          </div>
        </StudioSheet>
      ) : null}

      {publishedSheet ? (
        <StudioSheet
          title="게시했어요"
          description="이제 이 링크로 참가할 수 있어요. 식장 테이블이나 단체 대화방에 나눠 주세요."
          onClose={() => setPublishedSheet(false)}
        >
          <StudioJoinLink url={joinUrl} fileName={event.settings.slug || "harucut-event"} size={240} stacked />
          <button
            type="button"
            onClick={() => setPublishedSheet(false)}
            className="hc-button-secondary h-11 rounded-full text-[14px] font-semibold"
          >
            닫기
          </button>
        </StudioSheet>
      ) : null}

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

      {leaveTo ? (
        <ConfirmDialog
          title="저장하지 않고 나갈까요?"
          description="바꾼 설정이 아직 저장되지 않았어요. 나가면 바꾼 내용이 사라져요."
          confirmLabel="저장하지 않고 나가기"
          running={false}
          destructive
          onClose={() => setLeaveTo(null)}
          onConfirm={() => router.push(leaveTo)}
        />
      ) : null}
    </main>
  );
}

/** 새로고침·탭 닫기 경고. 저장 여부는 불러온 뒤에야 알아서 훅을 자식에 둔다. */
function UnsavedGuard({ active }: { active: boolean }) {
  useUnsavedWorkGuard(active);
  return null;
}

function periodCopy(form: Form) {
  const when = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  };
  if (form.kind === "ALWAYS_ON") return "상시 캠페인";
  if (!form.startsAt && !form.endsAt) return "게시하면 바로 시작, 「촬영 종료」까지";
  return `${form.startsAt ? when(form.startsAt) : "게시하면 바로"} ~ ${form.endsAt ? when(form.endsAt) : "「촬영 종료」까지"}`;
}

const ACTION_DONE: Record<EventAction, string> = {
  publish: "게시했어요. 참가 링크와 QR 을 나눠 주세요.",
  pause: "일시 중지했어요. 다시 열 때까지 새 촬영을 받지 않아요.",
  resume: "다시 열었어요.",
  "close-capture": "촬영을 끝냈어요.",
};

/**
 * 목차의 한 칸. 여기로 앵커가 오므로 위쪽 여백이 고정 바를 비켜 준다. 카드를 씌우지 않는다 — 안에 든 칸들이 이미 면을 갖고 있고,
 * 카드 안의 카드는 깊이만 늘린다. 구역은 큰 제목과 선으로 나눈다.
 */
function Group({
  id,
  first,
  hideTitle,
  aside,
  reasons,
  children,
}: {
  id: StudioSectionId;
  first?: boolean;
  /** 맨 위 구역은 안쪽 제목이 바로 이어져 큰 제목이 겹친다. 목차와 스크린리더에만 남긴다. */
  hideTitle?: boolean;
  aside?: React.ReactNode;
  /** 게시 위반 중 이 구역 것. 고칠 칸 옆에서 바로 읽힌다. */
  reasons?: string[];
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`flex scroll-mt-16 flex-col gap-6 lg:scroll-mt-36 ${first ? "" : "border-t border-(--hc-border) pt-8"}`}
    >
      <div className={hideTitle ? "sr-only" : "flex flex-wrap items-center gap-2"}>
        <h2 id={`${id}-title`} className="text-[24px] font-extrabold tracking-[-0.5px]">
          {STUDIO_SECTION_LABEL[id]}
        </h2>
        {aside}
      </div>
      {reasons && reasons.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1 rounded-2xl border border-(--hc-danger-border) p-3 text-[13px] text-(--hc-danger)">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {children}
    </section>
  );
}

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
          <h3 className="text-[18px] font-bold">{title}</h3>
          {aside}
        </div>
        {description ? <p className="max-w-[65ch] text-[13px] text-(--hc-muted)">{description}</p> : null}
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
  invalid,
  children,
}: {
  label: string;
  help?: string;
  /** 형식이 틀렸다. 도움말이 오류 문구가 된다. */
  invalid?: boolean;
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
        <p id={helpId} className={`max-w-[65ch] text-[12px] ${invalid ? "text-(--hc-danger)" : "text-(--hc-muted)"}`}>
          {help}
        </p>
      ) : null}
    </div>
  );
}

function Check({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-[14px]">
      <input type="checkbox" name={name} className="size-5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
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
