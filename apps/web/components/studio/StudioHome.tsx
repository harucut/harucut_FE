"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AppNav } from "@/components/layout/AppNav";
import { PageHeader } from "@/components/layout/PageHeader";
import { rememberStudioAccess } from "@/hooks/useStudioAccess";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { defaultConsentTemplate } from "@/lib/studio/eventSections";
import { getWorkspaceBrandDefaults } from "@/lib/studio/projectsApi";
import { getEventUsage, type EventUsage } from "@/lib/studio/usageApi";
import {
  createEvent,
  createWorkspace,
  listEvents,
  listWorkspaces,
  type StudioEvent,
  type Workspace,
} from "@/lib/studio/studioApi";
import { STUDIO_TIMEZONE } from "@/lib/studio/eventTime";
import { CloneEventForm } from "@/components/studio/CloneEventForm";
import { EventStatusBadge } from "@/components/studio/EventStatusBadge";
import { LeaveWorkspaceButton, StudioMembers } from "@/components/studio/StudioMembers";
import { StudioMultiExports } from "@/components/studio/StudioMultiExports";
import { StudioProjects } from "@/components/studio/StudioProjects";
import { StudioWorkspaceFrames } from "@/components/studio/StudioWorkspaceFrames";
import { AuditLogList } from "@/components/audit/AuditLogList";
import { PERMISSION_LABEL, listMyEvents, listWorkspaceAuditLogs, type MyEvent } from "@/lib/studio/accessApi";
import { getMyUserInfo } from "@/lib/userApi";

/** 행사는 조직 공간에만 만든다 — 개인 공간은 회원 탈퇴 때 통째로 지워진다(백엔드 fork #15, R5 14절). */
function organizationsOf(workspaces: Workspace[]) {
  return workspaces.filter((w) => w.type === "ORGANIZATION");
}

const SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; workspaces: Workspace[] };

/** 목록 한 번에 사용량을 묻는 행사 수 상한. 넘는 행사는 제출 수 없이 보여 준다. */
const USAGE_ROW_LIMIT = 30;

function eventDateCopy(event: StudioEvent) {
  if (event.settings.kind === "ALWAYS_ON") return "상시";
  const iso = event.settings.captureStartsAt;
  if (!iso) return "날짜 미정";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "날짜 미정"
    : date.toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: STUDIO_TIMEZONE });
}

function channelCopy(event: StudioEvent) {
  const { byodEnabled, boothEnabled } = event.settings;
  return [byodEnabled ? "휴대폰" : null, boothEnabled ? "부스" : null].filter(Boolean).join("·") || "참가 방식 미정";
}

/** 지금 움직이는 행사가 먼저, 그 안에서는 빠른 날짜가 먼저다. 토요일 예식 여덟 건을 날짜로 찾는다. */
function sortEvents(events: StudioEvent[]) {
  const finished = (event: StudioEvent) => (event.status === "CAPTURE_CLOSED" || event.status === "ARCHIVED" ? 1 : 0);
  const when = (event: StudioEvent) => {
    const time = event.settings.captureStartsAt ? new Date(event.settings.captureStartsAt).getTime() : Number.NaN;
    return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
  };
  return [...events].sort((a, b) => finished(a) - finished(b) || when(a) - when(b));
}

export function StudioHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [events, setEvents] = useState<StudioEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  // 행사 고객으로 사진 권한만 받은 행사(공간 멤버가 아니다). 고객에게는 이 목록이 Studio 의 시작점이다.
  const [customerEvents, setCustomerEvents] = useState<MyEvent[]>([]);
  const [customerLoaded, setCustomerLoaded] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [cloning, setCloning] = useState<string | null>(null);
  const [usageById, setUsageById] = useState<Record<string, EventUsage>>({});
  // 올리면 행사 목록을 다시 받는다(실패 뒤 「다시 시도」).
  const [eventsAttempt, setEventsAttempt] = useState(0);

  const organizations = load.state === "ready" ? organizationsOf(load.workspaces) : [];
  const requested = searchParams.get("workspace");
  const current = organizations.find((w) => w.workspaceId === requested) ?? organizations[0] ?? null;
  const currentId = current?.workspaceId ?? null;
  // 행사 목록은 운영 역할만 부를 수 있다(서버 403). 디자이너·보기 전용에게는 오류가 아니라 프레임 작업 자리를 보인다.
  const worksOnEvents = current?.role === "OWNER" || current?.role === "ADMIN" || current?.role === "OPERATOR";
  const framesOnly = current !== null && !worksOnEvents;

  const reload = useCallback(async () => {
    try {
      setLoad({ state: "ready", workspaces: await listWorkspaces() });
    } catch (error) {
      setLoad({ state: "error", message: getUserFacingApiErrorMessage(error, "공간 목록을 불러오지 못했어요.") });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void reload();
    listMyEvents()
      .then((list) => setCustomerEvents(list.filter((e) => !e.access.role)))
      .catch(() => {})
      .finally(() => setCustomerLoaded(true));
    getMyUserInfo()
      .then((user) => setMyUserId(user.id ?? null))
      .catch(() => {});
  }, [reload]);

  useEffect(() => {
    if (!currentId || !worksOnEvents) return;
    let cancelled = false;
    listEvents(currentId)
      .then((list) => {
        if (cancelled) return;
        setEvents(list);
        setEventsError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setEvents(null);
        setEventsError(getUserFacingApiErrorMessage(error, "행사 목록을 불러오지 못했어요."));
      });
    return () => {
      cancelled = true;
    };
  }, [currentId, worksOnEvents, eventsAttempt]);

  // 행사마다 얼마나 찍었는지. 못 받으면 그 행만 숫자를 뺀다 — 목록을 막을 이유가 아니다.
  useEffect(() => {
    if (!events) return;
    let cancelled = false;
    for (const event of events.slice(0, USAGE_ROW_LIMIT)) {
      getEventUsage(event.eventId)
        .then((usage) => {
          if (!cancelled) setUsageById((prev) => ({ ...prev, [event.eventId]: usage }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [events]);

  const sortedEvents = useMemo(() => (events ? sortEvents(events) : null), [events]);
  // 지금 공간의 행사에서만 찾는다. 다른 공간을 보고 돌아오면 그 공간의 수치가 캐시에 남아 있다.
  const sharedUsage =
    sortedEvents?.map((event) => usageById[event.eventId]).find((usage) => usage?.entitlement?.scope === "WORKSPACE") ?? null;
  const canCreate = current?.role === "OWNER" || current?.role === "ADMIN";
  const noEvents = events !== null && events.length === 0;
  // 행사가 없으면 만들 수밖에 없다. 버튼을 한 번 더 누르게 하지 않고 폼을 바로 편다.
  const showCreate = canCreate && (creating || noEvents);
  // 공간은 없고 초대받은 행사만 있는 사람(신랑신부 등). 이 사람에게 공간 이야기를 꺼내지 않는다.
  const customerOnly = load.state === "ready" && organizations.length === 0 && customerEvents.length > 0;

  return (
    <main className="hc-page-app min-h-dvh pb-16 text-(--hc-text)">
      <AppNav />
      <div className="mx-auto flex w-full max-w-200 flex-col gap-6 px-4 py-5 sm:py-6 lg:py-8">
        <div className="lg:hidden">
          <PageHeader backHref="/home" backLabel="홈" />
        </div>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
            <h1 className="text-[30px] font-extrabold tracking-tight">
              {customerOnly ? "내 행사 사진" : framesOnly ? "공간 프레임" : "행사 운영"}
            </h1>
            <p className="max-w-[65ch] text-[14px] text-(--hc-muted)">
              {customerOnly
                ? "초대받은 행사의 사진을 보고 받을 수 있어요."
                : current?.role === "DESIGNER"
                  ? "이 공간의 행사에 쓸 프레임을 만들고 발행해요. 행사에 고르는 일은 관리자가 해요."
                  : current?.role === "VIEWER"
                    ? "이 공간의 프레임을 볼 수 있어요. 만들거나 고치려면 관리자에게 디자이너 권한을 요청해 주세요."
                    : "행사 참가 링크와 QR, 촬영 기간, 참가 동의를 정하고 게시해요."}
            </p>
          </div>
          {canCreate && !noEvents && events ? (
            <button
              type="button"
              aria-expanded={creating}
              onClick={() => setCreating((open) => !open)}
              className="hc-button-primary h-11 shrink-0 rounded-full px-5 text-[14px] font-semibold"
            >
              새 행사
            </button>
          ) : null}
        </header>

        {load.state === "loading" ? (
          <p role="status" className="text-[14px] text-(--hc-muted)">
            불러오는 중…
          </p>
        ) : null}
        {load.state === "error" ? (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-[14px] text-(--hc-danger)">
              {load.message}
            </p>
            <button
              type="button"
              onClick={() => {
                setLoad({ state: "loading" });
                void reload();
              }}
              className="hc-button-secondary h-11 rounded-full px-4 text-[13px] font-semibold"
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {customerEvents.length > 0 ? (
          <section aria-labelledby="studio-customer-events" className="flex flex-col gap-3">
            <h2 id="studio-customer-events" className="text-[18px] font-bold">
              초대받은 행사
            </h2>
            <ul className="flex flex-col gap-2">
              {customerEvents.map((event) => (
                <li key={event.eventId}>
                  <Link
                    href={`/studio/events/${encodeURIComponent(event.eventId)}/photos`}
                    className="hc-surface-card flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 transition hover:border-(--hc-border-strong)"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="break-words text-[15px] font-semibold">{event.name || "이름 없는 행사"}</span>
                      <span className="text-[12px] text-(--hc-muted)">
                        {event.completedPhotoCount !== undefined ? (
                          <>
                            사진 <span className="font-mono tabular-nums">{event.completedPhotoCount.toLocaleString("ko-KR")}</span>장 ·{" "}
                          </>
                        ) : null}
                        {event.access.permissions.map((p) => PERMISSION_LABEL[p]).join(" · ")}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-(--hc-muted)" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {load.state === "ready" && customerLoaded && organizations.length === 0 && customerEvents.length === 0 ? (
          <CreateWorkspaceCard
            onCreated={(workspace) => {
              rememberStudioAccess();
              setLoad({ state: "ready", workspaces: [...load.workspaces, workspace] });
              router.replace(`/studio?workspace=${encodeURIComponent(workspace.workspaceId)}`);
            }}
          />
        ) : null}

        {current ? (
          <>
            {organizations.length > 1 ? (
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                공간
                <select
                  name="studioWorkspace"
                  className="hc-input h-11 rounded-xl border px-3 text-[14px] font-normal"
                  value={current.workspaceId}
                  onChange={(e) => router.replace(`/studio?workspace=${encodeURIComponent(e.target.value)}`)}
                >
                  {organizations.map((w) => (
                    <option key={w.workspaceId} value={w.workspaceId}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="break-words text-[14px] font-semibold">{current.name}</p>
            )}

            {showCreate ? (
              <CreateEventCard
                key={current.workspaceId}
                workspaceId={current.workspaceId}
                workspaceName={current.name}
                onCreated={(event) => router.push(`/studio/events/${encodeURIComponent(event.eventId)}`)}
              />
            ) : null}

            {framesOnly ? (
              <section aria-label="공간 프레임 목록" className="flex flex-col gap-3">
                <StudioWorkspaceFrames
                  key={current.workspaceId}
                  workspaceId={current.workspaceId}
                  readOnly={current.role === "VIEWER"}
                />
              </section>
            ) : null}

            {worksOnEvents ? (
              <section aria-labelledby="studio-events-title" className="flex flex-col gap-3">
                <h2 id="studio-events-title" className="text-[18px] font-bold">
                  행사
                </h2>
                {eventsError ? (
                  <div className="flex flex-col items-start gap-3">
                    <p role="alert" className="text-[14px] text-(--hc-danger)">
                      {eventsError}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setEventsError(null);
                        setEventsAttempt((n) => n + 1);
                      }}
                      className="hc-button-secondary h-11 rounded-full px-4 text-[13px] font-semibold"
                    >
                      다시 시도
                    </button>
                  </div>
                ) : null}
                {events === null && !eventsError ? (
                  <p role="status" className="text-[14px] text-(--hc-muted)">
                    행사를 불러오는 중…
                  </p>
                ) : null}
                {noEvents ? (
                  <p className="max-w-[65ch] text-[14px] text-(--hc-muted)">
                    {canCreate
                      ? "아직 만든 행사가 없어요. 위에서 이름과 주소를 정하면 시작할 수 있어요."
                      : "아직 볼 수 있는 행사가 없어요."}
                  </p>
                ) : null}
                {sharedUsage ? (
                  <p className="text-[13px] text-(--hc-muted)">
                    공간 이용권{" "}
                    <span className="font-mono tabular-nums">
                      {sharedUsage.used.toLocaleString("ko-KR")}/{sharedUsage.composeQuota.toLocaleString("ko-KR")}
                    </span>
                    장 사용
                  </p>
                ) : null}
                {sortedEvents && sortedEvents.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {sortedEvents.map((event) => {
                      const usage = usageById[event.eventId];
                      return (
                        <li key={event.eventId} className="flex flex-col gap-2">
                          <div className="hc-surface-card flex items-center rounded-2xl border transition hover:border-(--hc-border-strong)">
                            <Link
                              href={`/studio/events/${encodeURIComponent(event.eventId)}`}
                              className="flex min-h-16 min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl py-3 pl-4 pr-2"
                            >
                              <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="break-words text-[15px] font-semibold">
                                  {event.settings.name || "이름 없는 행사"}
                                </span>
                                <span className="text-[12px] text-(--hc-muted)">
                                  {eventDateCopy(event)} · {channelCopy(event)}
                                  {/* 공간 이용권은 행사들이 나눠 쓴다. 행마다 같은 숫자를 보이면 그 행사가 쓴 양처럼 읽힌다. 위에 한 번만 적는다. */}
                                  {usage?.entitlement?.scope === "EVENT" ? (
                                    <>
                                      {" · "}
                                      <span className="font-mono tabular-nums">
                                        {usage.used.toLocaleString("ko-KR")}/{usage.composeQuota.toLocaleString("ko-KR")}
                                      </span>
                                      장
                                    </>
                                  ) : null}
                                </span>
                              </span>
                              <EventStatusBadge event={event} />
                            </Link>
                            {canCreate ? (
                              <button
                                type="button"
                                aria-label={`${event.settings.name || "이름 없는 행사"} 복제`}
                                aria-expanded={cloning === event.eventId}
                                onClick={() => setCloning((open) => (open === event.eventId ? null : event.eventId))}
                                className="mr-2 h-11 shrink-0 rounded-full px-3 text-[13px] font-semibold text-(--hc-muted) transition hover:text-(--hc-text)"
                              >
                                복제
                              </button>
                            ) : null}
                          </div>
                          {cloning === event.eventId ? (
                            <CloneEventForm
                              eventId={event.eventId}
                              defaultName={`${event.settings.name ?? "행사"} 복사본`}
                              onCancel={() => setCloning(null)}
                              onCloned={(next) => router.push(`/studio/events/${encodeURIComponent(next.eventId)}`)}
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {current.role === "OPERATOR" ? (
              <div className="flex flex-col gap-2">
                <p className="max-w-[65ch] text-[13px] text-(--hc-muted)">
                  운영 담당은 맡은 행사만 보여요. 새 행사는 맡은 프로젝트의 행사 화면에서 복제해 만들 수 있어요.
                </p>
                <LeaveWorkspaceButton
                  key={current.workspaceId}
                  workspaceId={current.workspaceId}
                  onLeft={() => {
                    router.replace("/studio");
                    void reload();
                  }}
                />
              </div>
            ) : null}

            {/*
              자주 쓰지 않는 공간 관리는 접어 둔다. 행사 한 건을 열러 온 사람이 프로젝트·멤버를 먼저 읽지 않게 한다(R5 7절).
              닫혀 있어도 그 안의 목록은 받아 둔다 — 펼칠 때 비어 보이지 않는다.
            */}
            {current.role !== "OPERATOR" || events?.some((e) => e.workspaceId === current.workspaceId) ? (
              <details className="group border-t border-(--hc-border) pt-2">
                <summary className="flex h-12 cursor-pointer list-none items-center justify-between gap-2 text-[15px] font-bold [&::-webkit-details-marker]:hidden">
                  공간 설정
                  <ChevronRight aria-hidden className="size-4 text-(--hc-muted) transition-transform group-open:rotate-90" />
                </summary>
                <div className="flex flex-col gap-6 pb-2 pt-3">
                  {/* 여러 행사 묶음(P3-5) — 공간 범위는 OWNER·ADMIN, 프로젝트 범위는 그 프로젝트 멤버(운영 담당)도. */}
                  {events?.some((e) => e.workspaceId === current.workspaceId) &&
                  ["OWNER", "ADMIN", "OPERATOR"].includes(current.role) ? (
                    <section aria-labelledby="studio-multi-exports-title" className="flex flex-col gap-3">
                      <h2 id="studio-multi-exports-title" className="text-[18px] font-bold">
                        여러 행사 사진 묶기
                      </h2>
                      <StudioMultiExports
                        key={current.workspaceId}
                        workspaceId={current.workspaceId}
                        canUseWorkspace={current.role !== "OPERATOR"}
                        events={events}
                      />
                    </section>
                  ) : null}

                  {canCreate ? (
                    <section aria-labelledby="studio-frames-title" className="flex flex-col gap-3">
                      <h2 id="studio-frames-title" className="text-[18px] font-bold">
                        공간 프레임
                      </h2>
                      <StudioWorkspaceFrames key={current.workspaceId} workspaceId={current.workspaceId} />
                    </section>
                  ) : null}

                  {current.role === "OWNER" || current.role === "ADMIN" ? (
                    <section aria-labelledby="studio-projects-title" className="flex flex-col gap-3">
                      <h2 id="studio-projects-title" className="text-[18px] font-bold">
                        프로젝트와 기본값
                      </h2>
                      {/* 공간마다 새로 그린다 — 앞 공간의 펼침·입력이 남지 않게. */}
                      <StudioProjects key={current.workspaceId} workspaceId={current.workspaceId} />
                    </section>
                  ) : null}

                  {canCreate ? <WorkspaceActivity key={current.workspaceId} workspaceId={current.workspaceId} events={events ?? []} /> : null}

                  {/* 운영 담당은 멤버 목록을 보지 못한다(서버 403) — 맡은 행사만 운영한다(ADR-0009 §3). */}
                  {current.role === "OPERATOR" ? null : (
                    <section aria-labelledby="studio-members-title" className="flex flex-col gap-3">
                      <h2 id="studio-members-title" className="text-[18px] font-bold">
                        멤버
                      </h2>
                      {/* 공간마다 새로 그린다 — 앞 공간에서 만든 초대 링크·확인 창이 다음 공간에 남지 않게. */}
                      <StudioMembers
                        key={current.workspaceId}
                        workspaceId={current.workspaceId}
                        myRole={current.role}
                        myUserId={myUserId}
                        onLeft={() => {
                          // 같은 화면에 머무르므로 목록을 다시 받아 나간 공간을 지운다.
                          router.replace("/studio");
                          void reload();
                        }}
                      />
                    </section>
                  )}
                </div>
              </details>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

const activityErrorMessage = (cause: unknown) => getUserFacingApiErrorMessage(cause, "활동 기록을 불러오지 못했어요.");

/** 이 공간에서 누가 언제 무엇을 했나. 펼칠 때 받는다 — 접힌 채로 묻지 않는다. */
function WorkspaceActivity({ workspaceId, events }: { workspaceId: string; events: StudioEvent[] }) {
  const [open, setOpen] = useState(false);
  const eventNames = useMemo(() => new Map(events.map((event) => [event.eventId, event.settings.name || "이름 없는 행사"])), [events]);
  const load = useCallback((cursor: string | null) => listWorkspaceAuditLogs(workspaceId, cursor), [workspaceId]);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)} className="flex flex-col gap-3">
      <summary className="flex h-11 cursor-pointer items-center text-[18px] font-bold">활동 기록</summary>
      {open ? <AuditLogList load={load} errorMessage={activityErrorMessage} eventNames={eventNames} /> : null}
    </details>
  );
}

function CreateWorkspaceCard({ onCreated }: { onCreated: (workspace: Workspace) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="hc-surface-card flex flex-col gap-3 rounded-2xl p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || busy) return;
        setBusy(true);
        setError(null);
        try {
          onCreated(await createWorkspace(name.trim()));
        } catch (err) {
          setError(getUserFacingApiErrorMessage(err, "공간을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요."));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-[18px] font-bold">먼저 회사·팀 이름을 알려 주세요</h2>
      <p className="max-w-[65ch] text-[13px] text-(--hc-muted)">
        이 이름으로 행사를 운영하는 공간을 만들어요. 행사 사진과 프레임은 개인 계정이 아니라 이 공간에 남아요.
      </p>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
        회사·팀 이름
        <input
          name="workspaceName"
          autoComplete="organization"
          className="hc-input h-11 rounded-xl border px-3 text-[14px] font-normal"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 라온웨딩홀"
        />
      </label>
      {error ? (
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!name.trim() || busy}
          className="hc-button-primary h-11 rounded-full px-5 text-[14px] font-semibold disabled:opacity-50"
        >
          {busy ? "만드는 중…" : "시작하기"}
        </button>
        {!name.trim() ? <p className="text-[12px] text-(--hc-muted)">이름을 적으면 시작할 수 있어요.</p> : null}
      </div>
    </form>
  );
}

function CreateEventCard({
  workspaceId,
  workspaceName,
  onCreated,
}: {
  workspaceId: string;
  workspaceName: string;
  onCreated: (event: StudioEvent) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slugOk = SLUG_PATTERN.test(slug);
  const slugProblem = slug !== "" && !slugOk;

  return (
    <form
      className="hc-surface-card flex flex-col gap-3 rounded-2xl p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || !slugOk || busy) return;
        setBusy(true);
        setError(null);
        try {
          // 공간 기본값에 동의 항목이 없을 때만 초안을 넣는다. 있으면 그 값을 따라야 한다. 못 물어보면 넣지 않는다 — 기본값을 덮는 쪽이 더 나쁘다.
          const defaults = await getWorkspaceBrandDefaults(workspaceId).catch(() => null);
          const fillConsent = defaults !== null && !defaults.consentItems?.length;
          // 초안으로 만든다. 나머지는 다음 화면에서 정하고 게시할 때 서버가 모두 검증한다.
          onCreated(
            await createEvent(workspaceId, {
              name: name.trim(),
              slug,
              timezone: STUDIO_TIMEZONE,
              byodEnabled: true,
              boothEnabled: false,
              ...(fillConsent ? { consentItems: [defaultConsentTemplate(workspaceName)] } : {}),
            }),
          );
        } catch (err) {
          setError(getUserFacingApiErrorMessage(err, "행사를 만들지 못했어요. 잠시 뒤 다시 눌러 주세요."));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-[18px] font-bold">새 행사</h2>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
        행사 이름
        <input
          name="newEventName"
          autoComplete="off"
          className="hc-input h-11 rounded-xl border px-3 text-[14px] font-normal"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 민지 ♥ 준호 결혼식"
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="studio-new-slug" className="text-[13px] font-semibold">
          참가 주소
        </label>
        <span className="flex items-center gap-1 text-[14px]">
          <span translate="no" className="text-(--hc-muted)">/e/</span>
          <input
            id="studio-new-slug"
            name="newEventSlug"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            translate="no"
            className="hc-input h-11 min-w-0 flex-1 rounded-xl border px-3"
            value={slug}
            maxLength={40}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="wedding-1027"
            aria-describedby="studio-slug-help"
            aria-invalid={slugProblem || undefined}
          />
        </span>
        <p id="studio-slug-help" className={`text-[12px] ${slugProblem ? "text-(--hc-danger)" : "text-(--hc-muted)"}`}>
          영문 소문자·숫자·하이픈 3~40자. 게시한 뒤에는 바꿀 수 없어요.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!name.trim() || !slugOk || busy}
          className="hc-button-primary h-11 rounded-full px-5 text-[14px] font-semibold disabled:opacity-50"
        >
          {busy ? "만드는 중…" : "행사 만들기"}
        </button>
        {!name.trim() || !slugOk ? <p className="text-[12px] text-(--hc-muted)">행사 이름과 참가 주소를 적으면 만들 수 있어요.</p> : null}
      </div>
    </form>
  );
}
