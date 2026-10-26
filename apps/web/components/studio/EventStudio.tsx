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
    theme: compactPageTheme(form.theme),
  };
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
  // 행사 화면 꾸미기에서 로고·배경을 올리는 중이면 저장을 막는다. 저장 응답(저장 시점 폼)이 업로드 결과를 덮는다.
  const [themeUploading, setThemeUploading] = useState(false);

  const accept = useCallback((event: StudioEvent) => {
    setLoad({ state: "ready", event });
    setForm(formOf(event.settings));
  }, []);

  const reload = useCallback(async () => {
    try {
      accept(await getEvent(eventId));
      setConflict(null);
    } catch (error) {
      setLoad({ state: "error", message: getUserFacingApiErrorMessage(error, "행사를 불러오지 못했어요.") });
    }
  }, [accept, eventId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void reload();
  }, [reload]);

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
  const dirty = JSON.stringify(next) !== JSON.stringify(settingsOf(formOf(event.settings), event.settings));
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
      accept(await updateEventSettings(event.eventId, settingsVersion, next));
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
            if (dirty && busy === null && !themeUploading) void save();
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

            <Section title="참가 방식">
              <Check label="개인 휴대폰 (링크·QR)" checked={form.byod} onChange={(byod) => update({ byod })} />
              <Check label="현장 부스" checked={form.booth} onChange={(booth) => update({ booth })} />
            </Section>

            <Section title="허용 레이아웃" description="참가자가 고를 수 있는 컷 구성이에요. 고른 레이아웃마다 제공 프레임이 하나 이상 있어야 게시할 수 있어요.">
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
              description="참가 · 부스 · 결과 화면에 보이는 색과 글꼴, 로고, 문구예요. 게시하면 참가자 화면에 반영돼요."
            >
              <StudioPageTheme
                workspaceId={event.workspaceId}
                value={form.theme}
                // 최신 폼 위에 적용한다 — 업로드를 기다리는 사이 바꾼 이름 등 테마 밖의 칸도 되돌리지 않게.
                onUploadingChange={setThemeUploading}
                onChange={(apply) => setForm((current) => (current ? { ...current, theme: apply(current.theme) } : current))}
              />
            </Section>

            <Section title="결과 보관">
              <Field label="보관 일수" help="참가자가 결과 링크로 다시 내려받을 수 있는 기간이에요.">
                <input
                  type="number"
                  min={1}
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
              disabled={!dirty || busy !== null || themeUploading}
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

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-[18px] font-bold">{title}</h2>
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
