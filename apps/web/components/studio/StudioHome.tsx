"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppNav } from "@/components/layout/AppNav";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import {
  createEvent,
  createWorkspace,
  listEvents,
  listWorkspaces,
  type StudioEvent,
  type Workspace,
} from "@/lib/studio/studioApi";
import { STUDIO_TIMEZONE } from "@/lib/studio/eventTime";
import { EventStatusBadge } from "@/components/studio/EventStatusBadge";
import { StudioMembers } from "@/components/studio/StudioMembers";
import { PERMISSION_LABEL, listMyEvents, type MyEvent } from "@/lib/studio/accessApi";
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

export function StudioHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [events, setEvents] = useState<StudioEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  // 행사 고객으로 사진 권한만 받은 행사(공간 멤버가 아니다). 고객에게는 이 목록이 Studio 의 시작점이다.
  const [customerEvents, setCustomerEvents] = useState<MyEvent[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const organizations = load.state === "ready" ? organizationsOf(load.workspaces) : [];
  const requested = searchParams.get("workspace");
  const current = organizations.find((w) => w.workspaceId === requested) ?? organizations[0] ?? null;
  const currentId = current?.workspaceId ?? null;

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
      .catch(() => {});
    getMyUserInfo()
      .then((user) => setMyUserId(user.id ?? null))
      .catch(() => {});
  }, [reload]);

  useEffect(() => {
    if (!currentId) return;
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
  }, [currentId]);

  return (
    <main className="hc-page-app min-h-dvh pb-16 text-(--hc-text)">
      <AppNav />
      <div className="mx-auto flex w-full max-w-200 flex-col gap-6 px-4 py-5 sm:py-6 lg:py-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-[30px] font-extrabold tracking-tight">행사 운영</h1>
          <p className="text-[14px] text-(--hc-muted)">
            행사 참가 링크와 QR, 촬영 기간, 참가 동의를 정하고 게시해요.
          </p>
        </header>

        {load.state === "loading" ? <p className="text-[14px] text-(--hc-muted)">불러오는 중…</p> : null}
        {load.state === "error" ? (
          <p role="alert" className="text-[14px] text-(--hc-danger)">
            {load.message}
          </p>
        ) : null}

        {customerEvents.length > 0 ? (
          <section aria-labelledby="studio-customer-events" className="flex flex-col gap-3">
            <h2 id="studio-customer-events" className="text-[18px] font-bold">
              초대받은 행사
            </h2>
            <ul className="flex flex-col gap-2">
              {customerEvents.map((event) => (
                <li key={event.eventId} className="hc-surface-card flex flex-col gap-1 rounded-2xl px-4 py-3">
                  <span className="text-[15px] font-semibold">{event.name || "이름 없는 행사"}</span>
                  <span className="text-[12px] text-(--hc-muted)">
                    {event.access.permissions.map((p) => PERMISSION_LABEL[p]).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {load.state === "ready" && organizations.length === 0 ? (
          <CreateWorkspaceCard
            onCreated={(workspace) => {
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
              <p className="text-[14px] font-semibold">{current.name}</p>
            )}

            <section aria-labelledby="studio-events-title" className="flex flex-col gap-3">
              <h2 id="studio-events-title" className="text-[18px] font-bold">
                행사
              </h2>
              {eventsError ? (
                <p role="alert" className="text-[14px] text-(--hc-danger)">
                  {eventsError}
                </p>
              ) : null}
              {events && events.length === 0 ? (
                <p className="text-[14px] text-(--hc-muted)">아직 만든 행사가 없어요.</p>
              ) : null}
              {events && events.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {events.map((event) => (
                    <li key={event.eventId}>
                      <Link
                        href={`/studio/events/${encodeURIComponent(event.eventId)}`}
                        className="hc-surface-card flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[15px] font-semibold">
                            {event.settings.name || "이름 없는 행사"}
                          </span>
                          <span className="truncate text-[12px] text-(--hc-muted)">{event.joinUrlPath}</span>
                        </span>
                        <EventStatusBadge event={event} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

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

            {current.role === "OWNER" || current.role === "ADMIN" ? (
              <CreateEventCard
                workspaceId={current.workspaceId}
                onCreated={(event) => router.push(`/studio/events/${encodeURIComponent(event.eventId)}`)}
              />
            ) : (
              <p className="text-[13px] text-(--hc-muted)">행사를 만들고 게시하려면 이 공간의 관리자 권한이 필요해요.</p>
            )}
          </>
        ) : null}
      </div>
    </main>
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
          setError(getUserFacingApiErrorMessage(err, "공간을 만들지 못했어요."));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-[18px] font-bold">운영 공간 만들기</h2>
      <p className="text-[13px] text-(--hc-muted)">
        행사는 운영 공간에 만들어요. 행사 사진과 프레임은 개인 계정이 아니라 이 공간에 남아요.
      </p>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
        공간 이름
        <input
          className="hc-input h-11 rounded-xl border px-3 text-[14px] font-normal"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 하루컷 웨딩팀"
        />
      </label>
      {error ? (
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!name.trim() || busy}
        className="hc-button-primary h-11 self-start rounded-full px-5 text-[14px] font-semibold disabled:opacity-50"
      >
        {busy ? "만드는 중…" : "공간 만들기"}
      </button>
    </form>
  );
}

function CreateEventCard({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated: (event: StudioEvent) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slugOk = SLUG_PATTERN.test(slug);

  return (
    <form
      className="hc-surface-card flex flex-col gap-3 rounded-2xl p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || !slugOk || busy) return;
        setBusy(true);
        setError(null);
        try {
          // 초안으로 만든다. 참가 방식·동의·프레임은 다음 화면에서 정하고 게시할 때 서버가 모두 검증한다.
          onCreated(
            await createEvent(workspaceId, {
              name: name.trim(),
              slug,
              timezone: STUDIO_TIMEZONE,
              byodEnabled: true,
              boothEnabled: false,
            }),
          );
        } catch (err) {
          setError(getUserFacingApiErrorMessage(err, "행사를 만들지 못했어요."));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-[18px] font-bold">새 행사</h2>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
        행사 이름
        <input
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
          <span className="text-(--hc-muted)">/e/</span>
          <input
            id="studio-new-slug"
            className="hc-input h-11 min-w-0 flex-1 rounded-xl border px-3"
            value={slug}
            maxLength={40}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="wedding-1027"
            aria-describedby="studio-slug-help"
          />
        </span>
        <p id="studio-slug-help" className="text-[12px] text-(--hc-muted)">
          영문 소문자·숫자·하이픈 3~40자. 게시한 뒤에는 바꿀 수 없어요.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!name.trim() || !slugOk || busy}
        className="hc-button-primary h-11 self-start rounded-full px-5 text-[14px] font-semibold disabled:opacity-50"
      >
        {busy ? "만드는 중…" : "행사 만들기"}
      </button>
    </form>
  );
}
