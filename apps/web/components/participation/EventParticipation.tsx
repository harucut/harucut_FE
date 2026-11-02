"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Pause, RotateCcw } from "lucide-react";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
import { frameIdFromFrameType } from "@/lib/frameApi";
import { uploadCaptureInput } from "@/lib/event/captureUpload";
import {
  forgetParticipant,
  readParticipant,
  saveParticipant,
} from "@/lib/event/credentialStore";
import {
  getParticipantDownload,
  getParticipantSession,
  getPublicEvent,
  listParticipantResults,
  reissueResultAccess,
  startByodSession,
  startCaptureRun,
  submitConsents,
  submitEventCompose,
} from "@/lib/event/eventApi";
import type {
  CaptureRun,
  ConsentItem,
  EventFrameRef,
  LayoutType,
  ParticipantJob,
  PublicEvent,
} from "@/lib/event/types";
import { useEventCamera } from "@/components/participation/useEventCamera";
import {
  EventActionBar,
  EventButton,
  EventLogo,
  EventSurface,
  EventTitle,
  useEventCopy,
  useMetaThemeColor,
} from "@/components/participation/EventSurface";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
import { stashResultHandoff } from "@/lib/event/resultHandoff";
import { copyText, saveImageFromSignedUrl, saveImageMessage } from "@/lib/share";
import { detectInAppBrowser, openInExternalBrowser } from "@/lib/externalBrowser";
import { getNativeSaveErrorMessage } from "@/lib/nativeBridge";
import { composeFailureCopy } from "@/lib/composeFailure";
import { freeTextErrorMessage, localFreeTextProblem, normalizeFreeText } from "@/lib/event/freeText";
import { safeAssetUrl } from "@/lib/event/pageTheme";
import { FreeTextComposer, type FreeTextValue } from "@/components/participation/FreeTextComposer";

/**
 * 개인 휴대폰 참가 `/e/{slug}`(기획 R5 4절, ADR-0007 §5).
 *
 *  - 참가 입력은 촬영만이다(CAMERA_ONLY). 갤러리·파일 선택·붙여넣기 경로를 두지 않는다.
 *  - 참가자 자격은 이 행사에만 묶인 토큰이다(credentialStore). 회원 쿠키·개인 촬영 저장소와 섞지 않는다.
 *  - 촬영본은 메모리에만 둔다. 서버 접수 전에는 보관 완료라고 말하지 않는다.
 *  - 레이아웃·프레임은 서버가 준 목록만 쓴다. 하나뿐이면 고르는 단계를 건너뛴다.
 */
type Step =
  | { kind: "loading" }
  | { kind: "unavailable"; message: string }
  | { kind: "intro" }
  | { kind: "consent" }
  | { kind: "home" }
  | { kind: "frame" }
  | { kind: "capture" }
  | { kind: "sending"; progress: string };

type Session = { token: string; participantId: string; expiresAt: string };

const SHOT_COUNT = 4;
/** 첫 장 전 카운트다운(포즈 잡을 시간). 부스는 버튼을 누르고 자리로 돌아갈 시간이 더 필요하다. */
const FIRST_COUNTDOWN_SECONDS = { phone: 3, booth: 5 } as const;
const COUNTDOWN_SECONDS = 3;

/**
 * 참가자에게 보이는 오류 문구. ENT-004 의 공용 문구는 주최자에게 하는 말(「이용권에 이 기능이 없어요. 하루컷에 문의」)이라
 * 참가자 화면에 그대로 내지 않는다 — 참가자가 할 수 있는 일을 말하고, 하루컷 이름도 꺼내지 않는다(R5 18절).
 */
export function participantErrorMessage(cause: unknown, fallback: string) {
  if (getApiErrorDetails(cause).code === "ENT-004") return "지금은 촬영할 수 없어요. 행사 담당자에게 문의해 주세요.";
  return getUserFacingApiErrorMessage(cause, fallback);
}

const NOT_READY_MESSAGE = "이 행사는 아직 촬영 준비 중이에요. 행사 담당자에게 문의해 주세요.";

/** 자격이 없을 때의 첫 화면. 부스 전용이거나, 촬영 시간인데 고를 프레임이 없으면 들어갈 수 없다. */
function firstStepOf(event: PublicEvent): Step {
  if (!event.byodEnabled) return { kind: "unavailable", message: "이 행사는 현장 부스에서만 참여할 수 있어요." };
  if (event.captureOpen && sortedFrames(event).length === 0) return { kind: "unavailable", message: NOT_READY_MESSAGE };
  return { kind: "intro" };
}

export function sortedFrames(event: PublicEvent): EventFrameRef[] {
  const allowed = new Set(event.allowedLayouts);
  return [...event.frames]
    .filter((frame) => allowed.has(frame.layoutType))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function defaultFrameOf(event: PublicEvent) {
  const list = sortedFrames(event);
  return list.find((f) => f.isDefault) ?? list[0] ?? null;
}

export function slotAspectOf(frame: EventFrameRef | null) {
  const layout = FRAME_LAYOUTS[frameIdFromFrameType(frame?.layoutType ?? "CLASSIC")];
  const slot = layout.slots[0];
  return slot.width / slot.height;
}

/** 홈의 「만드는 중」 사진을 다시 묻는 간격과 횟수(5초 × 24 = 2분). */
export const RESULT_POLL_MS = 5_000;
const RESULT_POLL_LIMIT = 24;

export function EventParticipation({ slug, initialEvent = null }: { slug: string; initialEvent?: PublicEvent | null }) {
  const router = useRouter();
  // 서버가 받아 둔 행사가 있으면 첫 화면부터 그 행사의 모습이다. 저장된 자격이 있는지는 브라우저에서만 안다.
  const [event, setEvent] = useState<PublicEvent | null>(initialEvent);
  const [step, setStep] = useState<Step>(() => (initialEvent ? firstStepOf(initialEvent) : { kind: "loading" }));
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 서버를 기다리는 동안 버튼이 말없이 있으면 연타한다.
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState<EventFrameRef | null>(() => (initialEvent ? defaultFrameOf(initialEvent) : null));
  const [results, setResults] = useState<ParticipantJob[]>([]);
  // 결과 목록 응답이 늦게 오면 그사이 자격이 바뀌었을 수 있다(401 뒤 새 참여). 요청 당시 자격이 지금 것일 때만 반영한다.
  const sessionTokenRef = useRef<string | null>(null);
  useEffect(() => {
    sessionTokenRef.current = session?.token ?? null;
  }, [session]);

  const frames = useMemo(() => (event ? sortedFrames(event) : []), [event]);

  /*
    「만드는 중」 사진은 서버에서 완성돼도 화면이 모른다 — 목록은 세션 복원·동의 때 한 번만 받아, 새로고침 말고는
    사진을 받을 길이 없었다(Codex 리뷰 #523). 홈에 만드는 중인 사진이 있는 동안 다시 묻는다. 합성이 오래 걸리는
    경우를 위해 상한을 두고, 그 뒤에는 「다시 확인」으로 묻는다.
  */
  const hasPending = step.kind === "home" && results.some((job) => job.status === "PENDING");
  const pendingPollsRef = useRef(0);
  useEffect(() => {
    if (!hasPending || !session || !event) return;
    pendingPollsRef.current = 0;
    let cancelled = false;
    const token = session.token;
    const timer = window.setInterval(() => {
      pendingPollsRef.current += 1;
      if (pendingPollsRef.current > RESULT_POLL_LIMIT) {
        window.clearInterval(timer);
        return;
      }
      void listParticipantResults(token, event.eventId)
        .then((list) => {
          if (!cancelled && sessionTokenRef.current === token) setResults(list);
        })
        .catch(() => {});
    }, RESULT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hasPending, session, event]);

  const showUnavailable = useCallback((cause: unknown, fallback: string) => {
    // 없는 행사는 일반 문구(「요청한 정보를 찾을 수 없어요」)보다 무엇을 하면 되는지 말하는 쪽이 낫다.
    const notFound = getApiErrorDetails(cause).status === 404;
    setStep({ kind: "unavailable", message: notFound ? fallback : participantErrorMessage(cause, fallback) });
  }, []);

  /** 참가자 자격이 끝났다(만료·회수). 이 행사의 자격만 버리고 처음으로 돌아간다. */
  const resetSession = useCallback((eventId: string) => {
    forgetParticipant(eventId);
    sessionTokenRef.current = null;
    setSession(null);
    // 자격이 끝났으면 그 자격으로 받은 결과 목록도 버린다(다음 참여에 이어 보이지 않게).
    setResults([]);
    setStep({ kind: "intro" });
  }, []);

  /**
   * 이 행사에서 만든 결과 목록을 다시 받는다. 실패하면 **있던 목록을 그대로 둔다** — 일시적인 오류로 완성 사진이
   * 사라지면 PENDING 이 없어져 자동 확인도 멈추고, 「다시 확인」도 목록 안에만 있어 다시 누를 수 없다(Codex #541).
   */
  const loadResults = useCallback(async (token: string, eventId: string): Promise<ParticipantJob[] | null> => {
    try {
      const list = await listParticipantResults(token, eventId);
      // 그사이 자격이 바뀌었으면 이전 자격의 목록을 새 화면에 붙이지 않는다.
      if (sessionTokenRef.current === token) setResults(list);
      return list;
    } catch {
      return null;
    }
  }, []);

  // 행사 정보 → 저장된 자격이 있으면 세션 복원. 서버가 받아 둔 행사가 있으면 다시 묻지 않는다.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      let loaded: PublicEvent;
      if (initialEvent) {
        loaded = initialEvent;
      } else {
        try {
          loaded = await getPublicEvent(slug, controller.signal);
        } catch (cause) {
          if (controller.signal.aborted) return;
          showUnavailable(cause, "행사를 찾을 수 없어요. 받은 링크를 다시 확인해 주세요.");
          return;
        }
        if (controller.signal.aborted) return;
        setEvent(loaded);
        setFrame(defaultFrameOf(loaded));
      }
      const first = firstStepOf(loaded);
      if (first.kind === "unavailable") {
        setStep(first);
        return;
      }

      const stored = readParticipant(loaded.eventId);
      if (!stored) {
        setStep(first);
        return;
      }
      // 이어 갈 자격이 있다. 확인이 끝나기 전에 「참여하기」를 눌러 새 참가자가 생기지 않게 한다.
      setStep({ kind: "loading" });
      try {
        const state = await getParticipantSession(stored.token, controller.signal);
        if (controller.signal.aborted) return;
        sessionTokenRef.current = stored.token;
        setSession(stored);
        if (state.status === "ACTIVE") {
          setStep({ kind: "home" });
          void loadResults(stored.token, loaded.eventId);
        } else {
          setStep({ kind: "consent" });
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (getApiErrorDetails(cause).status === 401) resetSession(loaded.eventId);
        else showUnavailable(cause, "참여 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    })();
    return () => controller.abort();
  }, [slug, initialEvent, showUnavailable, resetSession, loadResults]);

  /**
   * 주최자가 다시 게시했다. 받아 둔 테마·프레임·동의를 새로 받는다. 고른 프레임이 빠졌으면 다시 고르게 한다.
   * 못 받으면 지금 값을 둔다 — 서버가 접수에서 다시 본다.
   */
  const refreshEvent = useCallback(
    async (options: { reselectIfMissing?: boolean } = {}) => {
      try {
        const latest = await getPublicEvent(slug);
        setEvent(latest);
        const list = sortedFrames(latest);
        const kept = list.find((f) => f.frameVersionId === frame?.frameVersionId) ?? null;
        setFrame(kept ?? defaultFrameOf(latest));
        if (options.reselectIfMissing && !kept && list.length > 1) setStep({ kind: "frame" });
        return latest;
      } catch {
        return null;
      }
    },
    [slug, frame],
  );

  useEffect(() => {
    if (event) document.title = event.name;
  }, [event]);

  const onJoin = async () => {
    if (!event) return;
    setError(null);
    setBusy(true);
    try {
      const issued = await startByodSession(slug);
      const stored = { token: issued.participantToken, participantId: issued.participantId, expiresAt: issued.expiresAt };
      saveParticipant(event.eventId, stored);
      sessionTokenRef.current = stored.token;
      setSession(stored);
      setStep({ kind: "consent" });
    } catch (cause) {
      const { code } = getApiErrorDetails(cause);
      if (code === "EVENT-001" || code === "EVENT-002" || code === "ENT-004") showUnavailable(cause, "지금은 참여할 수 없어요.");
      else setError(getUserFacingApiErrorMessage(cause, "참여를 시작하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setBusy(false);
    }
  };

  const onStartShooting = () => {
    setError(null);
    setNotice(null);
    setStep(frames.length > 1 ? { kind: "frame" } : { kind: "capture" });
  };

  const onWithdrawConsent = async (item: ConsentItem) => {
    if (!event || !session) return;
    setError(null);
    setNotice(null);
    try {
      await submitConsents(session.token, event.eventId, [{ code: item.code, version: item.version, decision: "WITHDRAWN" }]);
      setNotice(`「${item.title}」 동의를 철회했어요.`);
    } catch (cause) {
      if (getApiErrorDetails(cause).status === 400) void refreshEvent();
      setError(getUserFacingApiErrorMessage(cause, "철회하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
  };

  const onConsent = async (decisions: Record<string, boolean>) => {
    if (!event || !session) return;
    setError(null);
    setBusy(true);
    try {
      const { status } = await submitConsents(
        session.token,
        event.eventId,
        event.consentItems.map((item) => ({
          code: item.code,
          version: item.version,
          decision: decisions[item.code] ? "AGREED" : "DECLINED",
        })),
      );
      if (status !== "ACTIVE") {
        setError("필수 안내에 동의하면 촬영할 수 있어요.");
        return;
      }
      // 방금 동의한 사람에게 버튼 하나뿐인 화면을 또 보이지 않는다. 받을 사진이 있거나 촬영 시간이 아닐 때만 홈으로 간다.
      const list = await loadResults(session.token, event.eventId);
      if (event.captureOpen && (!list || list.length === 0)) onStartShooting();
      else setStep({ kind: "home" });
    } catch (cause) {
      const { status } = getApiErrorDetails(cause);
      if (status === 401) resetSession(event.eventId);
      else if (status === 400) {
        // 동의 문구의 판이 바뀌었다(재게시). 옛 문구로는 받지 않으니 새 문구를 보여 주고 다시 묻는다.
        await refreshEvent();
        setError("안내가 바뀌었어요. 다시 확인해 주세요.");
      } else setError(getUserFacingApiErrorMessage(cause, "동의를 저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setBusy(false);
    }
  };

  const goToResult = useCallback(
    (resultToken: string) => {
      if (event) stashResultHandoff({ token: resultToken, eventName: event.name, theme: event.theme, eventPath: `/e/${slug}` });
      // 결과 링크는 fragment 로만 옮긴다(경로·쿼리에 싣지 않는다).
      router.push(`/r#${resultToken}`);
    },
    [router, event, slug],
  );

  const onShareResult = async (jobId: number) => {
    if (!session) return;
    try {
      const { resultToken } = await reissueResultAccess(session.token, jobId);
      goToResult(resultToken);
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "결과 링크를 만들지 못했어요."));
    }
  };

  const onDownloadResult = async (jobId: number) => {
    if (!session) return;
    setError(null);
    setNotice(null);
    try {
      const { url } = await getParticipantDownload(session.token, jobId);
      const saved = await saveImageFromSignedUrl(url, `${event?.name ?? "행사 사진"}.jpg`);
      setNotice(saveImageMessage(saved));
    } catch (cause) {
      setError(getNativeSaveErrorMessage(cause) ?? getUserFacingApiErrorMessage(cause, "사진을 내려받지 못했어요."));
    }
  };

  // 처음 화면과 돌아온 화면은 행사 이름이 주인공이고, 그 뒤 단계는 할 일이 주인공이라 이름을 작게 둔다.
  const heroStep = step.kind === "intro" || step.kind === "home" || step.kind === "loading" || step.kind === "unavailable";
  const eventName = event?.name ?? "행사 촬영";

  return (
    <EventSurface theme={event?.theme} className="flex min-h-dvh flex-col items-center">
      <div className="flex w-full max-w-md flex-1 flex-col gap-4 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        {heroStep ? (
          <EventLogo />
        ) : (
          <header className="flex min-h-9 items-center gap-2.5">
            <EventLogo className="h-7 w-auto max-w-[40%] shrink-0 object-contain" />
            <h1 className="min-w-0 truncate text-[15px] font-bold">{eventName}</h1>
          </header>
        )}

        {step.kind === "loading" ? (
          <>
            <h1 className="sr-only">{eventName}</h1>
            <p role="status" className="text-[15px] text-(--ev-muted)">행사 정보를 불러오고 있어요…</p>
          </>
        ) : null}

        {step.kind === "unavailable" ? (
          <div className="flex flex-1 flex-col justify-center gap-3 pb-[40svh]">
            <EventTitle>{eventName}</EventTitle>
            <p role="alert" className="text-[16px] leading-relaxed text-(--ev-muted)">{step.message}</p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-[14px] font-semibold text-(--ev-danger)">{error}</p>
        ) : null}
        {notice ? (
          <p role="status" className="text-[14px] font-semibold">{notice}</p>
        ) : null}

        {step.kind === "intro" && event ? (
          <IntroStep event={event} frames={frames} busy={busy} onJoin={() => void onJoin()} />
        ) : null}

        {step.kind === "consent" && event ? (
          <ConsentStep
            // 재게시로 문구가 바뀌면 앞서 고른 체크를 비운다. 새 문구에 대한 동의가 아니다.
            key={event.experienceVersion}
            items={event.consentItems}
            busy={busy}
            onSubmit={(decisions) => void onConsent(decisions)}
          />
        ) : null}

        {step.kind === "home" && event ? (
          <HomeStep
            event={event}
            frames={frames}
            results={results}
            onStart={onStartShooting}
            onShare={(jobId) => void onShareResult(jobId)}
            onDownload={(jobId) => void onDownloadResult(jobId)}
            onWithdraw={(item) => void onWithdrawConsent(item)}
            onRefresh={() => {
              if (!session) return;
              setError(null);
              void loadResults(session.token, event.eventId).then((list) => {
                if (!list) setError("사진 목록을 다시 확인하지 못했어요. 잠시 후 다시 눌러 주세요.");
              });
            }}
          />
        ) : null}

        {step.kind === "frame" ? (
          <FrameStep
            frames={frames}
            selected={frame}
            onSelect={setFrame}
            onNext={() => setStep({ kind: "capture" })}
          />
        ) : null}

        {(step.kind === "capture" || step.kind === "sending") && event && session && frame ? (
          <CaptureAndSend
            event={event}
            token={session.token}
            frame={frame}
            sending={step.kind === "sending" ? step.progress : null}
            onProgress={(progress) => setStep(progress ? { kind: "sending", progress } : { kind: "capture" })}
            onDone={goToResult}
            onLeave={() => {
              if (frames.length > 1) setStep({ kind: "frame" });
              else {
                setStep({ kind: "home" });
                void loadResults(session.token, event.eventId);
              }
            }}
            leaveLabel="뒤로"
            onSessionEnded={() => resetSession(event.eventId)}
            onRunOpened={(run) => {
              // 받아 둔 행사보다 새 판으로 회차가 열렸다. 테마·프레임을 맞춘다.
              if (run.experienceVersion !== event.experienceVersion) void refreshEvent({ reselectIfMissing: true });
            }}
            onConsentRequired={() => {
              // 재게시로 새 필수 동의가 생겼다. 최신 동의 항목을 받아 다시 묻는다. 못 받으면 있는 항목으로 묻고 서버가 다시 본다.
              void refreshEvent().finally(() => setStep({ kind: "consent" }));
            }}
            onFrameRejected={() => {
              // 고른 프레임이 게시본에서 빠졌다. 찍은 사진은 그 프레임 칸에 맞춘 것이라 새로 찍는다.
              void refreshEvent().finally(() => {
                setError("프레임이 바뀌었어요. 다시 골라 찍어 주세요.");
                setStep(frames.length > 1 ? { kind: "frame" } : { kind: "home" });
              });
            }}
            onUnavailable={(cause) => {
              // 촬영 한도(ENT-002)는 새 촬영만 막는다 — 이미 만든 사진은 받을 수 있어야 하니 홈으로 돌아가 알린다(Codex #545).
              if (getApiErrorDetails(cause).code === "ENT-002") {
                setError(getUserFacingApiErrorMessage(cause, "지금은 촬영이 마감됐어요."));
                setStep({ kind: "home" });
                void loadResults(session.token, event.eventId);
                return;
              }
              showUnavailable(cause, "지금은 촬영할 수 없어요.");
            }}
          />
        ) : null}
      </div>
    </EventSurface>
  );
}

/**
 * 첫 화면의 그림. 지금 참가자가 받게 될 프레임을 실물처럼 놓는다 — 행사가 고른 프레임이 곧 이 행사의 얼굴이다.
 * 둘 이상이면 두 장을 겹쳐 고를 수 있다는 것까지 보여 준다. 프레임 그림이 없으면 자리를 비워 글자가 내려온다.
 * 장식이라 스크린리더에는 숨긴다(프레임 이름은 고르는 단계에서 읽힌다).
 */
export function FrameShowcase({ frames, className = "min-h-[38svh] flex-1" }: { frames: EventFrameRef[]; className?: string }) {
  const shown = frames.filter((frame) => frame.previewUrl).slice(0, 2);
  if (shown.length === 0) return <div aria-hidden className="flex-1" />;
  return (
    <div aria-hidden className={`relative ${className}`}>
      {shown.map((frame, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={frame.frameVersionId}
          src={frame.previewUrl}
          alt=""
          referrerPolicy="no-referrer"
          fetchPriority="high"
          className={`absolute inset-y-3 h-[calc(100%-1.5rem)] object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.22)] ${
            shown.length === 1 ? "left-0 w-full" : index === 0 ? "left-0 w-[56%] -rotate-[5deg]" : "right-0 w-[56%] rotate-[4deg]"
          }`}
        />
      ))}
    </div>
  );
}

function ConsentSummary({ items }: { items: ConsentItem[] }) {
  const notes = items.filter((item) => item.required && item.body);
  if (notes.length === 0) return null;
  return (
    <details className="text-[13px] text-(--ev-muted)">
      <summary className="flex min-h-11 cursor-pointer items-center justify-center font-semibold underline underline-offset-4">
        사진은 누가 받고, 얼마나 보관하나요?
      </summary>
      <div className="flex flex-col gap-2 pb-2">
        {notes.map((item) => (
          <p key={item.code} className="whitespace-pre-line leading-relaxed">{item.body}</p>
        ))}
      </div>
    </details>
  );
}

export function IntroStep({ event, frames, busy, onJoin }: { event: PublicEvent; frames: EventFrameRef[]; busy: boolean; onJoin: () => void }) {
  const welcome = useEventCopy("welcome", "휴대폰 카메라로 네 컷을 찍어 행사 사진을 만들어요.");
  // 촬영 시간이 아니면 새 참가자는 할 일이 없다(EVENT-001). 이미 찍은 사람이 사진을 찾는 길을 말한다.
  const closed = useEventCopy("closed", "지금은 촬영 시간이 아니에요. 찍은 사진은 그때 받은 결과 링크로 다시 받을 수 있어요.");
  return (
    <section className="ev-step flex flex-1 flex-col gap-4">
      <FrameShowcase frames={frames} />
      <div className="ev-readable flex flex-col gap-2">
        <EventTitle>{event.name}</EventTitle>
        <p className="break-keep text-[16px] leading-relaxed text-(--ev-muted)">{event.captureOpen ? welcome : closed}</p>
      </div>
      <EventActionBar>
        {event.captureOpen ? (
          <EventButton onClick={onJoin} disabled={busy} aria-busy={busy}>
            {busy ? "잠시만요…" : "참여하기"}
          </EventButton>
        ) : null}
        {event.captureOpen ? (
          <p className="break-keep text-center text-[12px] leading-relaxed text-(--ev-muted)">
            이 기기에서 찍은 사진은 이 브라우저로 다시 들어오면 볼 수 있어요. 결과 링크를 저장해 두면 다른 기기에서도 받아요.
          </p>
        ) : null}
        <ConsentSummary items={event.consentItems} />
      </EventActionBar>
    </section>
  );
}

export function ConsentStep({
  items,
  onSubmit,
  busy = false,
  variant = "phone",
}: {
  items: ConsentItem[];
  onSubmit: (decisions: Record<string, boolean>) => void;
  busy?: boolean;
  variant?: "phone" | "booth";
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const intro = useEventCopy("consentIntro", "사진을 받는 곳과 쓰는 목적, 보관 기간을 확인해 주세요.");
  const missingRequired = items.some((item) => item.required && !checked[item.code]);
  const booth = variant === "booth";
  return (
    <section className="ev-step flex flex-1 flex-col gap-4">
      <h2 className={`ev-readable break-keep font-extrabold leading-snug tracking-[-0.01em] ${booth ? "text-[clamp(1.5rem,4vmin,2.5rem)]" : "text-[18px]"}`}>
        {intro}
      </h2>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={`${item.code}:${item.version}`}>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border border-(--ev-border) bg-(--ev-card) transition-colors duration-150 has-checked:border-(--ev-accent) ${booth ? "p-6" : "p-4"}`}
            >
              <input
                type="checkbox"
                checked={Boolean(checked[item.code])}
                onChange={(e) => setChecked((prev) => ({ ...prev, [item.code]: e.target.checked }))}
                className={`mt-0.5 shrink-0 ${booth ? "size-7" : "size-5.5"}`}
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className={`break-keep font-bold ${booth ? "text-[clamp(1.125rem,2.6vmin,1.5rem)]" : "text-[15px]"}`}>
                  <span className="font-semibold text-(--ev-muted)">{item.required ? "필수 " : "선택 "}</span>
                  {item.title}
                </span>
                {item.body ? (
                  <span className={`whitespace-pre-line leading-relaxed text-(--ev-muted) ${booth ? "text-[clamp(0.9375rem,2vmin,1.125rem)]" : "text-[13px]"}`}>
                    {item.body}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <EventActionBar>
        <EventButton size={booth ? "booth" : "lg"} disabled={missingRequired || busy} aria-busy={busy} onClick={() => onSubmit(checked)}>
          {busy ? "잠시만요…" : "동의하고 계속"}
        </EventButton>
      </EventActionBar>
    </section>
  );
}

export function HomeStep({
  event,
  frames,
  results,
  onStart,
  onShare,
  onDownload,
  onWithdraw,
  onRefresh,
}: {
  event: PublicEvent;
  frames: EventFrameRef[];
  results: ParticipantJob[];
  onStart: () => void;
  onShare: (jobId: number) => void;
  onDownload: (jobId: number) => void;
  /** 선택 동의를 거두는 길(R5 645줄). 필수 동의는 촬영의 조건이라 여기 없다. */
  onWithdraw: (item: ConsentItem) => void;
  onRefresh: () => void;
}) {
  const optionalItems = event.consentItems.filter((item) => !item.required);
  const closed = useEventCopy("closed", "지금은 촬영 시간이 아니에요.");
  const welcome = useEventCopy("welcome", "휴대폰 카메라로 네 컷을 찍어 행사 사진을 만들어요.");
  const hasResults = results.length > 0;
  return (
    <section className="ev-step flex flex-1 flex-col gap-4">
      {/* 받을 사진이 있으면 그 목록이 이 화면의 주인공이다. */}
      {hasResults ? null : <FrameShowcase frames={frames} />}
      <div className="ev-readable flex flex-col gap-2">
        <EventTitle>{event.name}</EventTitle>
        <p className="break-keep text-[16px] leading-relaxed text-(--ev-muted)">{event.captureOpen ? welcome : closed}</p>
      </div>
      {hasResults ? (
        <div className="flex flex-col gap-2.5">
          <h2 className="text-[16px] font-bold">이 행사에서 만든 사진</h2>
          <ul className="flex flex-col gap-2.5">
            {results.map((job, index) => (
              <li key={job.jobId} className="flex items-center gap-3 rounded-2xl border border-(--ev-border) bg-(--ev-card) p-3">
                {job.thumbnailUrl ? (
                  // 짧은 서명 URL 이라 next/image 로 보내지 않는다. Referer 도 보내지 않는다.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={job.thumbnailUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-14 shrink-0 rounded-lg object-cover" />
                ) : null}
                <span className="min-w-0 flex-1 text-[14px] font-semibold">
                  {index + 1}번째 사진 · {job.status === "DONE" ? "완성" : job.status === "PENDING" ? "만드는 중" : "실패"}
                  {/* 실패 코드가 있으면 무엇을 하면 되는지 말해 준다(원본 없음 → 다시 찍기 등). */}
                  {job.status === "FAILED" && composeFailureCopy(job.failureCode) ? (
                    <span className="block text-[12px] font-normal text-(--ev-muted)">{composeFailureCopy(job.failureCode)?.message}</span>
                  ) : null}
                </span>
                {job.status === "DONE" ? (
                  <span className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => onDownload(job.jobId)} className="h-11 rounded-full bg-(--ev-accent) px-4 text-[13px] font-bold text-(--ev-accent-contrast)">
                      저장
                    </button>
                    <button type="button" onClick={() => onShare(job.jobId)} className="h-11 rounded-full border border-(--ev-border) px-4 text-[13px] font-bold">
                      보기
                    </button>
                  </span>
                ) : job.status === "PENDING" ? (
                  <button type="button" onClick={onRefresh} className="h-11 shrink-0 rounded-full border border-(--ev-border) px-4 text-[13px] font-bold">
                    다시 확인
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {optionalItems.length > 0 ? (
        <details className="text-[13px] text-(--ev-muted)">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold underline underline-offset-4">선택 동의 철회</summary>
          <ul className="flex flex-col gap-2 pb-2">
            {optionalItems.map((item) => (
              <li key={item.code} className="flex items-center justify-between gap-3">
                <span className="min-w-0 break-keep">{item.title}</span>
                <button type="button" onClick={() => onWithdraw(item)} className="h-11 shrink-0 rounded-full border border-(--ev-border) px-4 font-bold">
                  철회
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {event.captureOpen ? (
        <EventActionBar>
          <EventButton onClick={onStart}>촬영 시작</EventButton>
        </EventActionBar>
      ) : (
        <div className="pb-[max(1rem,env(safe-area-inset-bottom))]" />
      )}
    </section>
  );
}

const LAYOUT_LABEL: Record<LayoutType, string> = {
  CLASSIC: "세로 네 컷",
  WIDE: "가로 네 컷",
  GRID: "격자 네 컷",
  POLAROID: "폴라로이드",
};

/** 같은 레이아웃이 여럿이면 번호를 붙여 구별한다 — 화면의 이름이자 스크린리더가 읽는 이름이다. */
function frameLabels(frames: EventFrameRef[]) {
  const total = new Map<LayoutType, number>();
  frames.forEach((frame) => total.set(frame.layoutType, (total.get(frame.layoutType) ?? 0) + 1));
  const seen = new Map<LayoutType, number>();
  return frames.map((frame) => {
    const nth = (seen.get(frame.layoutType) ?? 0) + 1;
    seen.set(frame.layoutType, nth);
    const label = LAYOUT_LABEL[frame.layoutType];
    return (total.get(frame.layoutType) ?? 0) > 1 ? `${label} ${nth}` : label;
  });
}

export function FrameStep({
  frames,
  selected,
  onSelect,
  onNext,
  variant = "phone",
}: {
  frames: EventFrameRef[];
  selected: EventFrameRef | null;
  onSelect: (frame: EventFrameRef) => void;
  onNext: () => void;
  variant?: "phone" | "booth";
}) {
  const labels = frameLabels(frames);
  const booth = variant === "booth";
  return (
    <section className="ev-step flex flex-1 flex-col gap-4">
      <h2 className={`ev-readable font-extrabold tracking-[-0.01em] ${booth ? "text-[clamp(1.5rem,4vmin,2.5rem)]" : "text-[18px]"}`}>프레임을 골라 주세요</h2>
      <div className={booth ? "grid flex-1 grid-cols-2 gap-4 landscape:grid-cols-4" : "grid grid-cols-2 gap-3"}>
        {frames.map((frame, index) => {
          const isSelected = selected?.frameVersionId === frame.frameVersionId;
          return (
            <button
              key={frame.frameVersionId}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(frame)}
              className="relative flex touch-manipulation flex-col items-center gap-2 rounded-2xl border-2 border-(--ev-border) bg-(--ev-card) p-3 transition-colors duration-150 aria-pressed:border-(--ev-accent)"
            >
              {frame.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frame.previewUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className={`w-full object-contain ${booth ? "h-[clamp(14rem,44vmin,30rem)]" : "h-[clamp(11rem,30svh,16rem)]"}`}
                />
              ) : (
                <span aria-hidden className={`w-full rounded-lg bg-(--ev-bg) ${booth ? "h-[clamp(14rem,44vmin,30rem)]" : "h-[clamp(11rem,30svh,16rem)]"}`} />
              )}
              <span className={`font-bold ${booth ? "text-[clamp(1rem,2.4vmin,1.375rem)]" : "text-[14px]"}`}>{labels[index]}</span>
              {isSelected ? (
                <span aria-hidden className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-(--ev-accent) text-(--ev-accent-contrast)">
                  <Check className="size-4" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <EventActionBar>
        <EventButton size={booth ? "booth" : "lg"} disabled={!selected} onClick={onNext}>
          이 프레임으로 찍기
        </EventButton>
      </EventActionBar>
    </section>
  );
}

/**
 * 카메라를 못 쓸 때. 갤러리로 우회시키지 않는다(R5 — 촬영 전용). 할 수 있는 일을 버튼으로 준다: 다시 시도,
 * 인앱 브라우저면 밖으로 나가기, 주소 복사, 앞 단계로.
 */
export function CameraProblem({
  state,
  booth,
  onRetry,
  onLeave,
  leaveLabel,
}: {
  state: "denied" | "unsupported" | "error";
  booth: boolean;
  onRetry: () => void;
  onLeave?: () => void;
  leaveLabel?: string;
}) {
  const [copied, setCopied] = useState<boolean | null>(null);
  // 부스는 공용 기기다. 다른 브라우저로 나가거나 주소를 복사할 사람은 손님이 아니라 담당자다.
  const inApp = !booth && typeof navigator !== "undefined" ? detectInAppBrowser() : null;
  const copyLink = async () => {
    try {
      await copyText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className="ev-step flex flex-1 flex-col justify-center gap-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <p role="alert" className="ev-readable break-keep text-[18px] font-bold leading-relaxed">
        {state === "denied"
          ? "카메라를 쓸 수 있게 허용해 주세요. 브라우저 설정에서 이 사이트의 카메라 권한을 켠 뒤 다시 시도해 주세요."
          : state === "unsupported"
            ? "이 브라우저에서는 카메라를 쓸 수 없어요. Safari나 Chrome에서 이 링크를 열어 주세요."
            : "카메라를 켜지 못했어요. 다른 앱이 카메라를 쓰고 있다면 닫은 뒤 다시 시도해 주세요."}
      </p>
      {state === "denied" ? (
        <ul className="ev-readable flex list-disc flex-col gap-1.5 pl-5 text-[14px] leading-relaxed text-(--ev-muted)">
          <li>아이폰: 설정 앱의 Safari에서 카메라를 「허용」으로 바꿔요.</li>
          <li>안드로이드: 주소창 왼쪽 아이콘을 눌러 권한에서 카메라를 켜요.</li>
          <li>도움이 필요하면 현장 담당자에게 알려 주세요.</li>
        </ul>
      ) : null}
      <EventButton size={booth ? "booth" : "lg"} onClick={onRetry}>
        다시 시도
      </EventButton>
      {inApp ? (
        <EventButton
          tone="quiet"
          size="md"
          onClick={() => {
            if (!openInExternalBrowser(window.location.href)) void copyLink();
          }}
        >
          다른 브라우저로 열기
        </EventButton>
      ) : null}
      {booth ? null : (
        <EventButton tone="quiet" size="md" onClick={() => void copyLink()}>
          {copied ? "링크를 복사했어요. Safari나 Chrome에 붙여 넣어 주세요" : "링크 복사"}
        </EventButton>
      )}
      {copied === false ? <p role="alert" className="text-[14px] font-semibold text-(--ev-danger)">복사하지 못했어요. 주소창의 주소를 길게 눌러 복사해 주세요.</p> : null}
      {onLeave ? (
        <EventButton tone="quiet" size="md" onClick={onLeave}>
          {leaveLabel ?? "뒤로"}
        </EventButton>
      ) : null}
    </section>
  );
}

/** 촬영 무대의 배치. 실제 촬영과 Studio 미리보기가 같은 값을 쓴다. */
export function captureStageClass(booth: boolean, wide: boolean) {
  // 찍는 동안은 뷰파인더가 화면의 전부다. 큰 배경 그림도 깔지 않는다(R5 18절 — 미리보기를 끊지 않게).
  return `ev-stage fixed inset-0 z-30 grid grid-cols-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] landscape:grid-cols-[minmax(0,1fr)_clamp(15rem,30vw,26rem)] landscape:grid-rows-[auto_minmax(0,1fr)] ${wide ? "grid-rows-[auto_auto_minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)_auto]"} ${booth ? "gap-[clamp(0.75rem,2vmin,1.5rem)] px-[clamp(1rem,3vmin,2.5rem)]" : "gap-2.5 px-3"}`;
}
export const CAPTURE_TOP_BAR_CLASS = "flex min-h-11 items-center justify-between gap-3 landscape:col-start-2 landscape:row-start-1";
export function viewfinderWrapClass(wide: boolean) {
  return `flex min-h-0 min-w-0 items-center justify-center landscape:col-start-1 landscape:row-span-2 landscape:row-start-1 landscape:[container-type:size] ${wide ? "" : "[container-type:size]"}`;
}
export function viewfinderClass(wide: boolean) {
  return `relative overflow-hidden rounded-2xl bg-[#18181a] ${wide ? "portrait:w-full!" : "w-full"}`;
}
/** 찍히는 칸과 같은 비율로 보여 준다. 칸이 화면보다 길어도 비율을 깨지 않고 화면 안에 맞춘다. */
export function viewfinderStyle(ratio: number) {
  return { aspectRatio: String(ratio), width: `min(100cqw, calc(100cqh * ${ratio}))` };
}
export function captureRailClass(wide: boolean) {
  return `flex min-h-0 min-w-0 flex-col gap-2.5 landscape:col-start-2 landscape:row-start-2 landscape:justify-center ${wide ? "portrait:justify-end" : "justify-end"}`;
}
export function captureBandClass(booth: boolean, wide: boolean) {
  return `flex items-center justify-center text-center ${
    wide ? "min-h-18 portrait:flex-1 landscape:h-[clamp(7rem,26vmin,17rem)]" : booth ? "h-[clamp(7rem,26vmin,17rem)] shrink-0" : "h-18 shrink-0"
  }`;
}
export const CAPTURE_GUIDE_DEFAULT = "버튼을 한 번 누르면 3초마다 한 장씩, 네 장을 찍어요.";

/** 위쪽 네 칸 게이지. 찍힌 칸은 사진이, 지금 칸은 테두리가 된다. */
export function CaptureGauge({
  previews,
  nextEmpty,
  ratio,
  booth,
}: {
  previews: (string | null)[];
  nextEmpty: number;
  ratio: number;
  booth: boolean;
}) {
  return (
    <ol aria-label="찍은 사진" className="flex items-center justify-end gap-1.5">
      {previews.map((url, index) => (
        <li
          key={index}
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[5px] ${
            url ? "" : index === nextEmpty ? "border-2 border-(--ev-text)" : "border border-(--ev-border)"
          } ${booth ? "h-[clamp(2.5rem,6vmin,4rem)]" : "h-10"}`}
          style={{ aspectRatio: String(ratio) }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={`${index + 1}번째 사진`} className="size-full object-cover" />
          ) : (
            <span aria-hidden className="text-[11px] font-bold tabular-nums text-(--ev-muted)">{index + 1}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * 촬영 4장 → 확인 → 전송(업로드·검증·합성 접수).
 *
 * 회차는 촬영 화면에 들어올 때 서버가 연다. 같은 회차의 재전송은 같은 멱등키를 쓰고, 이미 올린
 * 칸은 다시 올리지 않는다. 다시 찍은 칸만 새로 올린다. 회차가 끝났으면(PART-003) 새 회차를 열어
 * 처음부터 다시 올린다 — 이전 회차의 입력을 새 회차에 이어 붙이지 않는다.
 */
export function CaptureAndSend({
  event,
  token,
  frame,
  sending,
  onProgress,
  onDone,
  onRunOpened,
  onSessionEnded,
  onUnavailable,
  onConsentRequired,
  onFrameRejected,
  onLeave,
  leaveLabel,
  variant = "phone",
}: {
  event: PublicEvent;
  token: string;
  frame: EventFrameRef;
  sending: string | null;
  onProgress: (progress: string | null) => void;
  /** 접수가 끝났다. 부스는 회차를 닫으려고 회차 정보도 받는다. */
  onDone: (resultToken: string, run: CaptureRun) => void;
  /**
   * 서버가 회차를 열었다. 부스는 손님이 전송 전에 떠나도(유휴 종료) 이 회차를 닫아야 한다 — 접수가 끝난 뒤에야
   * 회차를 알면, 그 전에 끝난 손님의 회차와 참가자 세션이 서버에 열린 채 남는다(Codex 리뷰 #523).
   */
  onRunOpened?: (run: CaptureRun, token: string) => void;
  onSessionEnded: () => void;
  onUnavailable: (cause: unknown) => void;
  /** 서버가 새 필수 동의를 요구한다(PART-002 — 촬영 중 재게시). 찍던 것을 멈추고 동의부터 받는다. */
  onConsentRequired?: () => void;
  /** 고른 프레임이 게시본에서 빠졌다(PART-004 — 촬영 중 재게시). */
  onFrameRejected?: () => void;
  /** 촬영을 그만두고 앞 단계로. 찍은 사진이 있으면 한 번 더 눌러야 나간다(실수로 사진을 잃지 않게). */
  onLeave?: () => void;
  leaveLabel?: string;
  /** 부스는 멀리서 보고 크게 누른다. 동작은 같고 크기와 배치만 다르다. */
  variant?: "phone" | "booth";
}) {
  const {
    videoRef,
    state: cameraState,
    start: startCamera,
    stop: stopCamera,
    capture: captureFrame,
  } = useEventCamera(slotAspectOf(frame));
  const [shots, setShots] = useState<(Blob | null)[]>(() => Array(SHOT_COUNT).fill(null));
  const [previews, setPreviews] = useState<(string | null)[]>(() => Array(SHOT_COUNT).fill(null));
  const [countdown, setCountdown] = useState<number | null>(null);
  // 찍힌 순간 플래시. 값이 바뀔 때마다 요소를 새로 그려 애니메이션을 다시 건다.
  const [flash, setFlash] = useState(0);
  // 한 번 누르면 네 장을 이어서 찍는다. 찍을 때마다 기기로 돌아오면 포즈를 잡을 수 없다(부스는 특히).
  const [running, setRunning] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [leaveArmed, setLeaveArmed] = useState(false);
  // 확인 단계에서 칸을 잘못 건드려 그 포즈를 잃지 않게, 한 번 더 눌러야 지운다.
  const [retakeArmed, setRetakeArmed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef<CaptureRun | null>(null);
  const uploadedRef = useRef<(string | null)[]>(Array(SHOT_COUNT).fill(null));
  const idempotencyKeyRef = useRef<string | null>(null);
  // 자유 문구(D06). 같은 멱등키로 문구가 다르면 서버가 409 MEDIA-001 이라, 보낸 문구가 바뀌면 키를 새로 잡는다.
  const [freeText, setFreeText] = useState<FreeTextValue>(() => ({ text: "", styleId: event.freeText?.styles[0]?.id ?? "" }));
  const sentFreeTextRef = useRef<string | null>(null);
  // 문구 미리보기는 회차에 고정된 행사 설정으로 그린다 — 회차가 바뀌면(PART-003 뒤 새 회차) 다시 그린다.
  const [captureRunId, setCaptureRunId] = useState<string | null>(null);

  const onRunOpenedRef = useRef(onRunOpened);
  useEffect(() => {
    onRunOpenedRef.current = onRunOpened;
  }, [onRunOpened]);

  const openRun = useCallback(async () => {
    const run = await startCaptureRun(token, event.eventId);
    runRef.current = run;
    setCaptureRunId(run.captureRunId);
    uploadedRef.current = Array(SHOT_COUNT).fill(null);
    idempotencyKeyRef.current = crypto.randomUUID();
    sentFreeTextRef.current = null;
    // 요청한 손님의 자격도 함께 넘긴다 — 늦게 끝난 앞 손님의 회차가 다음 손님에게 붙지 않게(부스).
    onRunOpenedRef.current?.(run, token);
  }, [token, event.eventId]);

  /*
    부모가 넘기는 콜백은 렌더마다 새로 만들어진다. 그걸 시작 이펙트의 의존성에 넣으면 전송 진행
    표시가 바뀔 때마다 이펙트가 다시 돌아 회차를 새로 열고(올린 칸 기록이 지워진다) 카메라도 다시
    켠다. 그래서 시작은 화면에 들어올 때 한 번만 하고, 콜백은 최신 값을 ref 로 읽는다.
  */
  const handlersRef = useRef({ onSessionEnded, onUnavailable, onConsentRequired, startCamera, stopCamera, openRun });
  useEffect(() => {
    handlersRef.current = { onSessionEnded, onUnavailable, onConsentRequired, startCamera, stopCamera, openRun };
  }, [onSessionEnded, onUnavailable, onConsentRequired, startCamera, stopCamera, openRun]);

  useEffect(() => {
    const { startCamera: start, stopCamera: stop, openRun: open } = handlersRef.current;
    void start();
    void open().catch((cause) => {
      const { status, code } = getApiErrorDetails(cause);
      if (status === 401) handlersRef.current.onSessionEnded();
      else if (code === "PART-002" && handlersRef.current.onConsentRequired) handlersRef.current.onConsentRequired();
      // ENT-002: 이 행사의 촬영 한도를 다 썼거나 이용권이 끝났다. ENT-004: 기능 권한이 회수됐다. 찍기 전에 막는다(접수에서도 다시 본다).
      else if (code === "EVENT-001" || code === "ENT-002" || code === "ENT-004") handlersRef.current.onUnavailable(cause);
      else setError(participantErrorMessage(cause, "촬영을 시작하지 못했어요. 잠시 후 다시 시도해 주세요."));
    });
    return () => stop();
  }, []);

  // 미리보기 주소는 화면을 떠날 때 해제한다. 다시 찍은 칸은 retake 가 그때 해제한다. 칸이 바뀔 때마다 전부 해제하면
  // 아직 쓰는 주소까지 죽어, 다음에 그리는 <img> 가 깨진다.
  const previewsRef = useRef(previews);
  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);
  useEffect(() => () => previewsRef.current.forEach((url) => url && URL.revokeObjectURL(url)), []);

  const nextEmpty = shots.findIndex((shot) => shot === null);
  const hasShots = shots.some(Boolean);
  const allTaken = nextEmpty < 0;
  // 찍은 사진은 메모리에만 있다. 보내기 전에 탭을 닫거나 새로고침하면 사라지니 묻는다.
  useUnsavedWorkGuard(hasShots);
  // 네 장을 다 찍으면 카메라를 끈다. 이제 볼 것은 내 사진이고, 켜진 표시등은 불안하다.
  useEffect(() => {
    if (allTaken) stopCamera();
  }, [allTaken, stopCamera]);
  useMetaThemeColor(allTaken ? null : "#0b0b0c");

  const takeShot = useCallback(async () => {
    if (nextEmpty < 0) return;
    setCapturing(true);
    try {
      const photo = await captureFrame();
      setFlash((n) => n + 1);
      setShots((prev) => prev.map((shot, i) => (i === nextEmpty ? photo : shot)));
      setPreviews((prev) => prev.map((url, i) => (i === nextEmpty ? URL.createObjectURL(photo) : url)));
      uploadedRef.current[nextEmpty] = null;
    } catch {
      setError("사진을 찍지 못했어요. 다시 시도해 주세요.");
      setRunning(false);
    } finally {
      setCapturing(false);
    }
  }, [captureFrame, nextEmpty]);

  useEffect(() => {
    if (countdown === null) return;
    const timer = window.setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        void takeShot();
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, takeShot]);

  // 이어 찍기: 한 장이 찍히면 다음 칸의 카운트다운을 건다. 다 찍으면 멈춘다.
  useEffect(() => {
    if (!running || capturing || countdown !== null) return;
    const timer = window.setTimeout(() => {
      if (nextEmpty < 0) setRunning(false);
      else setCountdown(COUNTDOWN_SECONDS);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [running, capturing, countdown, nextEmpty]);

  const startShooting = () => {
    setError(null);
    setRunning(true);
    setCountdown(hasShots ? COUNTDOWN_SECONDS : FIRST_COUNTDOWN_SECONDS[variant]);
  };

  const pauseShooting = () => {
    setRunning(false);
    setCountdown(null);
  };

  const retake = (index: number) => {
    setRetakeArmed(null);
    const previous = previews[index];
    if (previous) URL.revokeObjectURL(previous);
    setShots((prev) => prev.map((shot, i) => (i === index ? null : shot)));
    setPreviews((prev) => prev.map((url, i) => (i === index ? null : url)));
    uploadedRef.current[index] = null;
    // 확인 단계에서는 카메라를 꺼 둔다. 다시 찍으려면 켠다.
    if (cameraState !== "ready") void startCamera();
  };

  // 전송 중에 화면을 떠났으면 남은 칸을 올리지 않고, 떠난 뒤의 응답으로 다음 화면을 움직이지 않는다.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const send = async (retriedForNewRun = false) => {
    setError(null);
    try {
      if (!runRef.current) await openRun();
      const run = runRef.current!;
      for (let slot = 0; slot < SHOT_COUNT; slot += 1) {
        if (!aliveRef.current) return;
        if (uploadedRef.current[slot]) continue;
        onProgress(`사진 올리는 중 (${slot + 1}/${SHOT_COUNT})`);
        uploadedRef.current[slot] = await uploadCaptureInput({
          token,
          eventId: event.eventId,
          captureRunId: run.captureRunId,
          slotIndex: slot,
          photo: shots[slot]!,
        });
      }
      if (!aliveRef.current) return;
      onProgress("사진을 만드는 중");
      // 비워 두면 싣지 않는다 — 서버는 프레임 그대로 만든다(공백만 보내면 PART-008 EMPTY). 서버와 같은 규칙으로 정리해 보낸다.
      const freeTextToSend = normalizeFreeText(freeText.text);
      const sentFreeText =
        event.freeText && freeTextToSend !== "" ? { text: freeTextToSend, styleId: freeText.styleId } : undefined;
      const sentKey = JSON.stringify(sentFreeText ?? null);
      if (sentFreeTextRef.current !== null && sentFreeTextRef.current !== sentKey) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }
      sentFreeTextRef.current = sentKey;
      const accepted = await submitEventCompose(token, event.eventId, {
        captureRunId: run.captureRunId,
        frameVersionId: frame.frameVersionId,
        sourceAssetIds: uploadedRef.current as string[],
        idempotencyKey: idempotencyKeyRef.current!,
        ...(sentFreeText ? { freeText: sentFreeText } : {}),
      });
      if (!aliveRef.current) return;
      stopCamera();
      onDone(accepted.resultToken, run);
    } catch (cause) {
      if (!aliveRef.current) return;
      onProgress(null);
      const { status, code } = getApiErrorDetails(cause);
      if (status === 401) return onSessionEnded();
      if (code === "PART-002" && onConsentRequired) return onConsentRequired();
      if (code === "PART-004" && onFrameRejected) return onFrameRejected();
      if (code === "EVENT-001" || code === "ENT-002" || code === "ENT-004") return onUnavailable(cause);
      if (code === "PART-003" && !retriedForNewRun) {
        // 회차가 끝났다(유효시간 초과 등). 새 회차를 열고 같은 사진을 처음부터 올린다.
        runRef.current = null;
        return send(true);
      }
      setError(freeTextErrorMessage(cause) ?? participantErrorMessage(cause, "사진을 보내지 못했어요. 다시 시도해 주세요."));
    }
  };

  // 문구를 썼는데 글자 수·줄 수를 넘으면 보내지 않는다(빈 문구는 프레임 그대로라 괜찮다).
  const freeTextBlocked =
    Boolean(event.freeText) && freeText.text !== "" && localFreeTextProblem(freeText.text, event.freeText!) !== null;
  const guide = useEventCopy("captureGuide", CAPTURE_GUIDE_DEFAULT);
  const booth = variant === "booth";
  const ratio = slotAspectOf(frame);
  // 가로로 긴 칸을 세운 휴대폰에서 찍으면 칸이 폭에 묶여 화면이 남는다. 칸을 렌즈 가까이 올려 시선이 카메라로 가게 하고, 남는 자리에 숫자를 크게 둔다.
  const wide = ratio >= 1;
  const emptyCount = shots.filter((shot) => shot === null).length;

  // 한 번 눌러 둔 「나가기」는 잠시 뒤 풀린다.
  useEffect(() => {
    if (!leaveArmed) return;
    const timer = window.setTimeout(() => setLeaveArmed(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [leaveArmed]);

  const leave = () => {
    if (hasShots && !leaveArmed) {
      setLeaveArmed(true);
      return;
    }
    stopCamera();
    onLeave?.();
  };

  // "error" 는 다른 앱이 카메라를 쥐고 있는 경우 등이다(NotReadableError). 안내 없이 두면 검은 화면과 꺼진
  // 촬영 버튼만 남아, 카메라가 풀려도 새로고침 말고는 돌아올 길이 없었다(Codex 리뷰 #523).
  if (cameraState === "denied" || cameraState === "unsupported" || cameraState === "error") {
    return (
      <CameraProblem
        state={cameraState}
        booth={booth}
        onRetry={() => void startCamera()}
        onLeave={onLeave ? leave : undefined}
        leaveLabel={leaveArmed ? "한 번 더 누르면 나가요" : (leaveLabel ?? "뒤로")}
      />
    );
  }

  // 남은 칸 수에 따라 버튼이 하는 일을 그대로 말한다.
  const shootLabel = emptyCount === SHOT_COUNT ? "찍기 시작" : emptyCount === 1 ? "한 장 찍기" : "이어서 찍기";

  return (
    <section
      className={
        allTaken
          ? "ev-step flex flex-1 flex-col gap-4"
          : captureStageClass(booth, wide)
      }
    >
      {allTaken ? null : (
        <div className={CAPTURE_TOP_BAR_CLASS}>
          {onLeave ? (
            <button
              type="button"
              onClick={leave}
              className={`-ml-1 flex h-11 shrink-0 items-center gap-1 rounded-full pr-3 font-semibold text-(--ev-muted) ${booth ? "text-[clamp(1rem,2.2vmin,1.25rem)]" : "text-[14px]"}`}
            >
              <ChevronLeft aria-hidden className="size-5" />
              {leaveArmed ? "한 번 더 누르면 나가요" : (leaveLabel ?? "뒤로")}
            </button>
          ) : (
            <span />
          )}
          <CaptureGauge previews={previews} nextEmpty={nextEmpty} ratio={ratio} booth={booth} />
        </div>
      )}

      {/* 비디오는 확인 단계에서도 요소를 유지한다 — 다시 찍을 때 같은 요소에 스트림을 다시 붙인다. */}
      <div
        className={
          allTaken
            ? "pointer-events-none absolute size-px overflow-hidden opacity-0"
            : viewfinderWrapClass(wide)
        }
      >
        <div
          className={viewfinderClass(wide)}
          style={viewfinderStyle(ratio)}
        >
          <video ref={videoRef} playsInline muted aria-label="카메라 화면" className="size-full -scale-x-100 object-cover" />
          {cameraState !== "ready" && !allTaken ? (
            <p role="status" className="absolute inset-0 flex items-center justify-center break-keep px-6 text-center text-[15px] font-semibold text-white/85">
              카메라를 켜고 있어요. 권한을 물으면 허용해 주세요…
            </p>
          ) : null}
          {flash > 0 ? <span key={flash} aria-hidden className="hc-capture-flash pointer-events-none absolute inset-0 bg-white" /> : null}
        </div>
      </div>

      {allTaken ? (
        <div className={booth ? "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 landscape:flex-row" : "flex flex-1 flex-col gap-5"}>
          <div className={booth ? "flex min-w-0 flex-1 flex-col gap-4" : "flex flex-col gap-4"}>
            <div className="ev-readable flex flex-col gap-1">
              <h2 className={`font-extrabold tracking-[-0.01em] ${booth ? "text-[clamp(1.5rem,4vmin,2.5rem)]" : "text-[18px]"}`}>이 네 장으로 만들까요?</h2>
              <p className={`break-keep text-(--ev-muted) ${booth ? "text-[clamp(1rem,2.2vmin,1.25rem)]" : "text-[14px]"}`}>사진을 누르면 그 칸만 다시 찍어요.</p>
            </div>
            <ol aria-label="찍은 사진" className={`grid gap-2.5 ${booth && ratio < 1 ? "grid-cols-4" : "grid-cols-2"}`}>
              {previews.map((url, index) => (
                <li key={index} className="min-w-0">
                  <button
                    type="button"
                    disabled={Boolean(sending)}
                    onClick={() => (retakeArmed === index ? retake(index) : setRetakeArmed(index))}
                    onBlur={() => setRetakeArmed((armed) => (armed === index ? null : armed))}
                    aria-label={retakeArmed === index ? `${index + 1}번째 사진을 지우고 다시 찍기` : `${index + 1}번째 사진 다시 찍기`}
                    className="relative block w-full touch-manipulation overflow-hidden rounded-xl bg-black"
                    style={{ aspectRatio: String(ratio) }}
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="size-full object-cover" />
                    ) : null}
                    {sending ? null : retakeArmed === index ? (
                      <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-black/60 px-2 text-center text-[14px] font-bold text-white">
                        한 번 더 누르면 다시 찍어요
                      </span>
                    ) : (
                      <span aria-hidden className="absolute bottom-1.5 right-1.5 flex size-8 items-center justify-center rounded-full bg-black/65 text-white">
                        <RotateCcw className="size-4" />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <div className={booth ? "flex w-full flex-col gap-4 landscape:w-[clamp(20rem,32vw,28rem)]" : "flex flex-1 flex-col gap-4"}>
            {event.freeText ? (
              <details className="group rounded-2xl border border-(--ev-border) bg-(--ev-card) px-4">
                <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-bold">
                  문구 넣기
                  <span className="text-[13px] font-semibold text-(--ev-muted) group-open:hidden">선택</span>
                </summary>
                <div className="pb-4">
                  <FreeTextComposer
                    config={event.freeText}
                    token={token}
                    eventId={event.eventId}
                    captureRunId={captureRunId}
                    frame={frame}
                    value={freeText}
                    onChange={setFreeText}
                    disabled={Boolean(sending)}
                    outputLogoUrl={event.theme?.branding?.outputLogo === "ORGANIZER_LOGO" ? safeAssetUrl(event.theme.logoUrl) : null}
                  />
                </div>
              </details>
            ) : null}
            <EventActionBar>
              {error ? <p role="alert" className="text-[14px] font-semibold text-(--ev-danger)">{error}</p> : null}
              {sending ? <p role="status" className="text-center text-[15px] font-semibold text-(--ev-muted)">{sending}</p> : null}
              <EventButton size={booth ? "booth" : "xl"} disabled={Boolean(sending) || freeTextBlocked} aria-busy={Boolean(sending)} onClick={() => void send()}>
                이 사진으로 만들기
              </EventButton>
              {/* 회선이 멈춰도 나갈 길이 있다. 찍은 사진을 잃으니 한 번 더 눌러야 나간다. */}
              {onLeave ? (
                <button type="button" onClick={leave} className="mx-auto flex min-h-11 items-center px-3 text-[14px] font-semibold text-(--ev-muted)">
                  {leaveArmed ? "한 번 더 누르면 나가요" : (leaveLabel ?? "뒤로")}
                </button>
              ) : null}
            </EventActionBar>
          </div>
        </div>
      ) : (
        <div className={captureRailClass(wide)}>
          {/*
            카운트다운은 프리뷰 밖에 둔다 — 얼굴을 가리지 않고, 뒤에 뭐가 찍혀도 어두운 무대 위라 읽힌다(개인 촬영과 같은 결론).
            시작 전에는 같은 자리에 안내를 둔다. 높이를 고정해 시작해도 아래 버튼이 움직이지 않는다.
          */}
          <div className={captureBandClass(booth, wide)}>
            {countdown !== null && countdown > 0 ? (
              <span
                key={countdown}
                aria-hidden
                className={`hc-count-tick font-extrabold leading-none tabular-nums ${booth ? "text-[clamp(6.5rem,24vmin,16rem)]" : wide ? "text-[clamp(3.5rem,14svh,7.5rem)]" : "text-[56px]"}`}
              >
                {countdown}
              </span>
            ) : running ? (
              <span className={`font-bold tabular-nums ${booth ? "text-[clamp(1.5rem,4vmin,2.5rem)]" : "text-[18px]"}`}>
                {SHOT_COUNT - emptyCount} / {SHOT_COUNT}
              </span>
            ) : guide ? (
              <p className={`break-keep text-(--ev-muted) ${booth ? "text-[clamp(1.125rem,3vmin,1.75rem)]" : "text-[14px]"}`}>{guide}</p>
            ) : null}
          </div>
          <p aria-live="polite" className="sr-only">
            {hasShots ? `${SHOT_COUNT - emptyCount}번째 사진을 찍었어요.` : ""}
          </p>
          {error ? <p role="alert" className="text-center text-[14px] font-semibold text-(--ev-danger)">{error}</p> : null}
          {running ? (
            <EventButton tone="quiet" size={booth ? "booth" : "xl"} onClick={pauseShooting}>
              <Pause aria-hidden className={booth ? "size-[1em]" : "size-5"} />
              잠깐 멈추기
            </EventButton>
          ) : (
            <EventButton size={booth ? "booth" : "xl"} disabled={cameraState !== "ready"} onClick={startShooting}>
              {shootLabel}
            </EventButton>
          )}
        </div>
      )}
    </section>
  );
}
