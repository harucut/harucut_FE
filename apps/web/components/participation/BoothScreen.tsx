"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { EventButton, EventLogo, EventSurface, EventTitle } from "@/components/participation/EventSurface";
import { QrCode } from "@/components/qr/QrCode";
import {
  CaptureAndSend,
  ConsentStep,
  FrameShowcase,
  FrameStep,
  participantErrorMessage,
  sortedFrames,
} from "@/components/participation/EventParticipation";
import { useEventCamera } from "@/components/participation/useEventCamera";
import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
import {
  forgetBoothDevice,
  readBoothDevice,
  saveBoothDevice,
  type StoredBoothDevice,
} from "@/lib/event/credentialStore";
import {
  closeBoothRun,
  getBoothCurrentRun,
  getBoothMe,
  getResult,
  redeemBoothPairing,
  startBoothGuest,
  submitConsents,
} from "@/lib/event/eventApi";
import { pageThemeCopy } from "@/lib/event/pageTheme";
import type { CaptureRun, EventFrameRef, PublicEvent, ResultStatus } from "@/lib/event/types";

/**
 * 현장 부스 `/booth`(기획 R5 4절 「부스의 등록과 한 팀의 이용 과정」, ADR-0007 §7).
 *
 *  - 기기 자격은 연결 코드로 받는다. 운영자 계정의 장기 토큰을 화면에 남기지 않는다.
 *  - 손님(팀)마다 새 참가자 세션을 연다. 그 자격은 **메모리에만** 둔다 — 다음 손님에게 넘어가지 않고,
 *    새로고침·재시작 뒤 이전 손님의 회차를 이어 가지 않는다.
 *  - 「이어 찍기」가 없다. 다음 손님으로 넘어가면 회차를 닫고 사진·미리보기·결과 QR 을 모두 버린다.
 *  - 이전 손님의 늦은 결과는 새 손님 화면에 나오지 않는다 — 결과 QR 은 그 손님이 접수한 순간의
 *    토큰으로만 그리고, 화면을 넘기면 지운다.
 *  - 전체화면은 되는 기기에서만 쓰는 선택 기능이다. 안 돼도 흐름은 같다.
 */
type Phase =
  | { kind: "checking" }
  | { kind: "pairing" }
  | { kind: "idle" }
  | { kind: "consent" }
  | { kind: "frame" }
  | { kind: "capture" }
  | { kind: "sending"; progress: string }
  | { kind: "result"; resultToken: string }
  | { kind: "unavailable"; message: string };

type Guest = { token: string; run: CaptureRun | null };

/** 손님이 손을 떼고 이만큼 지나면 안내 뒤 처음 화면으로 돌아간다. */
export const BOOTH_IDLE_MS = 90_000;
/** 처음 화면으로 돌아가기 전에 안내를 띄우는 시간. */
export const BOOTH_IDLE_WARNING_MS = 15_000;

const BOOTH_DEVICE_CHANGED = "harucut:booth-device-changed";

function subscribeBoothDevice(onChange: () => void) {
  window.addEventListener(BOOTH_DEVICE_CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(BOOTH_DEVICE_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** 저장된 기기 자격(문자열 스냅샷 — 같은 값이면 같은 참조라 다시 그리지 않는다). 서버 렌더에서는 없다. */
function boothDeviceSnapshot(): string | null {
  const stored = readBoothDevice();
  return stored ? JSON.stringify(stored) : null;
}

function setBoothDevice(value: StoredBoothDevice | null) {
  if (value) saveBoothDevice(value);
  else forgetBoothDevice();
  window.dispatchEvent(new Event(BOOTH_DEVICE_CHANGED));
}

/** 대기 화면에서 행사 상태를 다시 묻는 간격. */
export const BOOTH_STATUS_POLL_MS = 30_000;

export function BoothScreen() {
  const deviceJson = useSyncExternalStore(subscribeBoothDevice, boothDeviceSnapshot, () => null);
  const device = useMemo<StoredBoothDevice | null>(() => (deviceJson ? JSON.parse(deviceJson) : null), [deviceJson]);
  const [checkedPhase, setPhase] = useState<Phase>({ kind: "checking" });
  // 기기 자격이 없으면 언제나 연결 화면이다(상태가 아니라 자격에서 정한다).
  const phase: Phase = device ? checkedPhase : { kind: "pairing" };
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  // null 이면 행사의 기본 프레임을 쓴다.
  const [chosenFrame, setFrame] = useState<EventFrameRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState(false);
  const [busy, setBusy] = useState(false);
  // 첫 손님이 시작하면 운영자 도구(전체화면·카메라 점검)를 치운다. 손님이 끌 버튼이 아니다.
  const [guestsStarted, setGuestsStarted] = useState(false);
  const lastActivityRef = useRef(0);

  const frames = useMemo(() => (event ? sortedFrames(event) : []), [event]);
  const defaultFrame = useMemo(() => frames.find((f) => f.isDefault) ?? frames[0] ?? null, [frames]);
  const frame = chosenFrame ?? defaultFrame;

  const toPairing = useCallback(() => {
    setBoothDevice(null);
    setEvent(null);
    setPhase({ kind: "checking" });
  }, []);

  /** 한 팀이 끝났다. 회차를 닫고(서버가 그 손님 세션도 회수) 이 화면의 손님 상태를 전부 버린다. */
  const finishGuest = useCallback(async () => {
    const current = guest;
    setGuest(null);
    setFrame(null);
    setError(null);
    setWarning(false);
    setPhase({ kind: "idle" });
    if (device && current?.run) {
      try {
        await closeBoothRun(device.token, current.run.captureRunId, current.run.stateVersion);
      } catch {
        // 이미 닫혔거나(만료) 버전이 바뀌었다 — 다음 손님 시작 때 서버가 활성 회차를 다시 판정한다.
      }
    }
  }, [device, guest]);

  // 기기 확인 → 남아 있는 회차가 있으면 닫는다(재시작 뒤 이전 손님 사진을 보이지 않는다).
  useEffect(() => {
    if (!device) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const me = await getBoothMe(device.token, controller.signal);
        if (controller.signal.aborted) return;
        if (!me.event) {
          setPhase({ kind: "unavailable", message: "이 기기에 배정된 행사가 없어요. 담당자에게 문의해 주세요." });
          return;
        }
        setEvent(me.event);
        const current = await getBoothCurrentRun(device.token, 0, controller.signal);
        if (current?.captureRunId) {
          await closeBoothRun(device.token, current.captureRunId, current.stateVersion).catch(() => {});
        }
        if (controller.signal.aborted) return;
        setPhase({ kind: "idle" });
      } catch (cause) {
        if (controller.signal.aborted) return;
        const { code, status } = getApiErrorDetails(cause);
        if (code === "BOOTH-003" || status === 401) toPairing();
        else setPhase({ kind: "unavailable", message: getUserFacingApiErrorMessage(cause, "부스 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.") });
      }
    })();
    return () => controller.abort();
  }, [device, toPairing]);

  /*
    대기 · 이용 불가 화면에서는 행사 상태를 다시 묻는다. 촬영 전에 부스를 켜 두면 「촬영 시간이 아님」이나 「배정된
    행사 없음」에서 시작하는데, 운영자가 게시하거나 촬영을 열어도 새로고침 전에는 그대로 멈춰 있었다
    (Codex 리뷰 #523). 이전 손님의 회차를 닫는 일은 처음 한 번만 한다 — 여기서는 행사 정보만 바꾼다.
  */
  const waitingForEvent =
    Boolean(device) && (phase.kind === "unavailable" || (phase.kind === "idle" && !event?.captureOpen));
  useEffect(() => {
    if (!waitingForEvent || !device) return;
    // 대기 화면을 떠난 뒤(손님이 촬영을 시작함) 도착한 응답은 버린다 — 촬영 화면을 대기로 되돌리지 않게.
    let cancelled = false;
    const timer = window.setInterval(() => {
      void getBoothMe(device.token)
        .then((me) => {
          if (cancelled || !me.event) return;
          setEvent(me.event);
          setPhase({ kind: "idle" });
        })
        .catch(() => {});
    }, BOOTH_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [waitingForEvent, device]);

  // 유휴 종료: 손님 단계에서 손을 떼고 시간이 지나면 안내 뒤 처음으로.
  const inGuestFlow = phase.kind === "consent" || phase.kind === "frame" || phase.kind === "capture" || phase.kind === "result";
  useEffect(() => {
    if (!inGuestFlow) return;
    const bump = () => {
      lastActivityRef.current = Date.now();
      setWarning(false);
    };
    bump();
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= BOOTH_IDLE_MS) void finishGuest();
      else if (idle >= BOOTH_IDLE_MS - BOOTH_IDLE_WARNING_MS) setWarning(true);
    }, 1_000);
    return () => {
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
      window.clearInterval(timer);
    };
  }, [inGuestFlow, finishGuest]);

  const onPair = async (code: string) => {
    setError(null);
    setBusy(true);
    try {
      const paired = await redeemBoothPairing(code.trim().toUpperCase());
      setPhase({ kind: "checking" });
      setBoothDevice({ token: paired.boothToken, deviceId: paired.deviceId, eventId: paired.eventId });
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "연결하지 못했어요. 코드를 다시 확인해 주세요."));
    } finally {
      setBusy(false);
    }
  };

  const onStartGuest = async () => {
    if (!device || !event) return;
    setError(null);
    setBusy(true);
    try {
      const issued = await startBoothGuest(device.token);
      setGuestsStarted(true);
      setGuest({ token: issued.participantToken, run: null });
      setPhase({ kind: "consent" });
    } catch (cause) {
      const { code } = getApiErrorDetails(cause);
      if (code === "BOOTH-003") toPairing();
      else setError(participantErrorMessage(cause, "시작하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setBusy(false);
    }
  };

  const onConsent = async (decisions: Record<string, boolean>) => {
    if (!event || !guest) return;
    setError(null);
    setBusy(true);
    try {
      const { status } = await submitConsents(
        guest.token,
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
      setPhase(frames.length > 1 ? { kind: "frame" } : { kind: "capture" });
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "동의를 저장하지 못했어요. 처음부터 다시 시작해 주세요."));
    } finally {
      setBusy(false);
    }
  };

  const resultLink =
    phase.kind === "result" && typeof window !== "undefined"
      ? `${window.location.origin}/r#${phase.resultToken}`
      : null;

  const operatorScreen = phase.kind === "pairing" || phase.kind === "checking" || phase.kind === "unavailable" || phase.kind === "idle";
  const eventName = event?.name ?? "부스";

  return (
    <EventSurface theme={event?.theme} className="flex min-h-dvh flex-col">
      {/* 부스는 태블릿 세로·가로, PC 모니터 어디든 놓인다. 짧은 변(vmin)을 기준으로 여백과 글자를 키운다. */}
      <div className="flex w-full flex-1 flex-col gap-[clamp(1rem,2.5vmin,2rem)] px-[clamp(1.25rem,4vmin,3.5rem)] pt-[max(clamp(1.25rem,3vmin,2.5rem),env(safe-area-inset-top))]">
        <header className="flex min-h-11 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <EventLogo className="h-[clamp(2.25rem,5vmin,3.5rem)] w-auto max-w-[40vw] shrink-0 object-contain" />
            {/* 대기 화면은 행사 이름이 크게 나온다. 손님이 이용 중일 때만 작게 둔다. */}
            {phase.kind === "idle" ? null : (
              <h1 className="min-w-0 truncate text-[clamp(1rem,2.4vmin,1.5rem)] font-bold">{eventName}</h1>
            )}
          </div>
          {/* 운영자가 준비할 때만 보인다. 손님 앞에 띄울 버튼이 아니다. */}
          {operatorScreen && !guestsStarted ? (
            <div className="flex shrink-0 items-center gap-2">
              {device ? <BoothCameraCheck /> : null}
              <FullscreenToggle />
            </div>
          ) : null}
        </header>

        {error ? <p role="alert" className="text-[clamp(1rem,2.2vmin,1.25rem)] font-semibold text-(--ev-danger)">{error}</p> : null}
        {warning ? (
          <p
            role="status"
            className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-40 w-max max-w-[90vw] -translate-x-1/2 rounded-full bg-(--ev-text) px-6 py-3 text-center text-[clamp(1rem,2.2vmin,1.25rem)] font-bold text-(--ev-bg) shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
          >
            곧 처음 화면으로 돌아가요. 계속하려면 화면을 눌러 주세요.
          </p>
        ) : null}

        {phase.kind === "checking" ? (
          <p role="status" className="flex flex-1 items-center justify-center text-[clamp(1rem,2.4vmin,1.5rem)] text-(--ev-muted)">
            부스를 준비하고 있어요…
          </p>
        ) : null}

        {phase.kind === "unavailable" ? (
          <p role="alert" className="flex flex-1 items-center justify-center break-keep text-center text-[clamp(1.125rem,3vmin,2rem)] font-semibold text-(--ev-muted)">
            {phase.message}
          </p>
        ) : null}

        {phase.kind === "pairing" ? <PairingForm busy={busy} onSubmit={(code) => void onPair(code)} /> : null}

        {phase.kind === "idle" && event ? (
          <BoothIdleView event={event} frames={frames} busy={busy} onStart={() => void onStartGuest()} />
        ) : null}

        {phase.kind === "consent" && event ? (
          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
            <ConsentStep variant="booth" busy={busy} items={event.consentItems} onSubmit={(decisions) => void onConsent(decisions)} />
          </div>
        ) : null}

        {phase.kind === "frame" ? (
          <FrameStep variant="booth" frames={frames} selected={frame} onSelect={setFrame} onNext={() => setPhase({ kind: "capture" })} />
        ) : null}

        {(phase.kind === "capture" || phase.kind === "sending") && event && guest && frame ? (
          <CaptureAndSend
            variant="booth"
            event={event}
            token={guest.token}
            frame={frame}
            sending={phase.kind === "sending" ? phase.progress : null}
            onProgress={(progress) => setPhase(progress ? { kind: "sending", progress } : { kind: "capture" })}
            onLeave={() => void finishGuest()}
            leaveLabel="처음으로"
            onRunOpened={(run, runToken) =>
              // 앞 손님의 회차 열림 응답이 다음 손님 뒤에 도착할 수 있다(유휴 종료 뒤). 그 손님의 것일 때만 반영한다.
              setGuest((current) => (current && current.token === runToken ? { ...current, run } : current))
            }
            onDone={(resultToken, run) => {
              setGuest((current) => (current ? { ...current, run } : current));
              setPhase({ kind: "result", resultToken });
            }}
            onSessionEnded={() => void finishGuest()}
            onConsentRequired={() => {
              // 손님이 찍는 사이 재게시로 새 필수 동의가 생겼다. 최신 항목을 받아 이 손님에게 다시 묻는다.
              if (!device) return;
              void getBoothMe(device.token)
                .then((me) => {
                  if (me.event) setEvent(me.event);
                })
                .catch(() => {})
                .finally(() => setPhase({ kind: "consent" }));
            }}
            onUnavailable={(cause) =>
              setPhase({ kind: "unavailable", message: participantErrorMessage(cause, "지금은 촬영할 수 없어요.") })
            }
          />
        ) : null}

        {phase.kind === "result" && resultLink ? (
          <BoothResult
            key={phase.resultToken}
            event={event}
            resultToken={phase.resultToken}
            resultLink={resultLink}
            onNext={() => void finishGuest()}
          />
        ) : null}
      </div>
    </EventSurface>
  );
}

/** 부스 대기 화면. 지나가는 사람도 멀리서 읽게 행사 이름을 크게 둔다. */
export function BoothIdleView({
  event,
  frames,
  busy,
  onStart,
}: {
  event: PublicEvent;
  frames: EventFrameRef[];
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <section className="ev-step flex flex-1 flex-col gap-[clamp(1.5rem,4vmin,3.5rem)] pb-[max(clamp(1.25rem,3vmin,2.5rem),env(safe-area-inset-bottom))] landscape:flex-row landscape:items-stretch">
      <FrameShowcase frames={frames} className="min-h-[36vmin] flex-1" />
      <div className="ev-readable flex flex-col justify-end gap-[clamp(1rem,3vmin,2rem)] landscape:w-[46%] landscape:justify-center">
        <EventTitle className="text-[clamp(2.5rem,8vmin,5.5rem)]">{event.name}</EventTitle>
        {event.captureOpen ? (
          <>
            {event.theme?.copy?.welcome ? (
              <p className="break-keep text-[clamp(1.125rem,3vmin,2rem)] font-semibold leading-snug text-(--ev-muted)">
                {pageThemeCopy(event.theme, "welcome", "")}
              </p>
            ) : null}
            <EventButton size="booth" disabled={busy} aria-busy={busy} onClick={onStart}>
              {busy ? "잠시만요…" : "촬영 시작"}
            </EventButton>
          </>
        ) : (
          <p className="break-keep text-[clamp(1.125rem,3vmin,2rem)] font-semibold text-(--ev-muted)">
            {pageThemeCopy(event.theme, "closed", "지금은 촬영 시간이 아니에요.")}
          </p>
        )}
      </div>
    </section>
  );
}

/** 결과 화면에서 완성을 다시 묻는 간격. 사진이 나오면 멈춘다. */
const BOOTH_RESULT_POLL_MS = 3_000;
/** 「다음 손님」을 한 번 누른 뒤 확인을 기다리는 시간. */
const NEXT_GUEST_ARM_MS = 5_000;

/**
 * 부스의 정점은 사진이 나오는 순간이다. 사진과 QR 을 함께 내민다. 합성이 끝나기 전에도 QR 은 바로 쓸 수 있다.
 * 결과는 이 화면에서 이 손님의 토큰으로만 읽고, 화면을 넘기면 함께 사라진다(key 로 새로 그린다).
 */
function BoothResult({
  event,
  resultToken,
  resultLink,
  onNext,
}: {
  event: PublicEvent | null;
  resultToken: string;
  resultLink: string;
  onNext: () => void;
}) {
  const [result, setResult] = useState<ResultStatus | null>(null);
  const [armed, setArmed] = useState(false);
  const status = result?.status ?? "PENDING";

  useEffect(() => {
    if (status !== "PENDING") return;
    const controller = new AbortController();
    let timer = 0;
    const poll = () => {
      void getResult(resultToken, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          setResult(next);
          if (next.status === "PENDING") timer = window.setTimeout(poll, BOOTH_RESULT_POLL_MS);
        })
        .catch(() => {
          // QR 로 받는 데는 지장이 없다. 조용히 다시 묻는다.
          if (!controller.signal.aborted) timer = window.setTimeout(poll, BOOTH_RESULT_POLL_MS);
        });
    };
    poll();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [resultToken, status]);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), NEXT_GUEST_ARM_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const photo = status === "DONE" ? (result?.imageUrl ?? result?.thumbnailUrl ?? null) : null;
  const message =
    status === "DONE"
      ? pageThemeCopy(event?.theme, "done", "사진이 완성됐어요.")
      : status === "FAILED"
        ? pageThemeCopy(event?.theme, "error", "사진을 만들지 못했어요. 담당자에게 알려 주세요.")
        : pageThemeCopy(event?.theme, "composing", "사진을 만들고 있어요. 링크는 지금 받아 가도 돼요.");

  return (
    <BoothResultView
      photo={photo ? <BoothResultPhoto src={photo} /> : null}
      resultLink={resultLink}
      message={message}
      armed={armed}
      onNext={() => {
        if (armed) onNext();
        else setArmed(true);
      }}
    />
  );
}

function BoothResultPhoto({ src }: { src: string }) {
  return (
    // 짧은 서명 URL 이라 next/image 로 보내지 않는다. Referer 도 보내지 않는다.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="완성된 사진"
      referrerPolicy="no-referrer"
      className="ev-develop max-h-[38dvh] w-auto max-w-full rounded-xl object-contain shadow-[0_18px_44px_rgba(0,0,0,0.22)] landscape:max-h-full"
    />
  );
}

/** 사진과 QR 을 함께 내미는 화면의 모양. 상태는 부모가 갖는다(Studio 미리보기도 이 모양을 쓴다). */
export function BoothResultView({
  photo,
  resultLink,
  message,
  armed,
  onNext,
}: {
  photo: React.ReactNode;
  resultLink: string;
  message: string;
  armed: boolean;
  onNext: () => void;
}) {
  return (
    <section className="ev-step flex flex-1 flex-col items-center justify-center gap-[clamp(1.25rem,3.5vmin,3.5rem)] pb-[max(clamp(1.25rem,3vmin,2.5rem),env(safe-area-inset-bottom))] landscape:flex-row">
      <div className="flex min-h-0 w-full items-center justify-center landscape:h-[min(78dvh,46rem)] landscape:w-auto landscape:flex-1">
        {photo ?? <div aria-hidden className="ev-developing aspect-2/3 h-[34dvh] rounded-2xl border border-(--ev-border) bg-(--ev-card) landscape:h-full" />}
      </div>
      <div className="ev-readable flex w-full max-w-xl flex-col items-center gap-[clamp(0.75rem,2vmin,1.5rem)] text-center landscape:w-[clamp(20rem,40vw,36rem)]">
        {/* QR 은 바탕을 행사 색에 맡기지 않는다. 흰 바탕이어야 어떤 테마에서도 스캐너가 읽는다. */}
        <div className="shrink-0 rounded-[clamp(1.25rem,3vmin,2.5rem)] bg-white p-[clamp(0.5rem,1.5vmin,1.25rem)] shadow-[0_18px_44px_rgba(0,0,0,0.18)]">
          <QrCode value={resultLink} size={280} label="사진 받기 QR" className="size-[clamp(12rem,38vmin,26rem)]" />
        </div>
        <h2 className="break-keep text-[clamp(1.5rem,4.2vmin,2.75rem)] font-extrabold leading-[1.2] tracking-[-0.02em]">
          휴대폰 카메라로 QR을 찍어 사진을 받아 가세요
        </h2>
        <p role="status" className="break-keep text-[clamp(1.125rem,2.6vmin,1.5rem)] text-(--ev-muted)">
          {message}
        </p>
        {/* QR 은 한 번 넘기면 다시 볼 수 없다. 같은 무게로 누르게 두지 않는다. */}
        <EventButton tone={armed ? "primary" : "quiet"} size="xl" className="mt-[clamp(0.25rem,1vmin,0.75rem)]" onClick={onNext}>
          {armed ? "QR 찍으셨어요? 한 번 더 누르면 넘어가요" : "다음 손님"}
        </EventButton>
      </div>
    </section>
  );
}

/** 첫 손님 앞에서 권한 창이 뜨지 않게, 운영자가 미리 권한을 받고 구도를 본다(기획 D02 카메라 점검). */
function BoothCameraCheck() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-11 shrink-0 rounded-full border border-(--ev-border) px-4 text-[14px] font-bold text-(--ev-muted)"
      >
        카메라 점검
      </button>
      {open ? <BoothCameraPreview onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function BoothCameraPreview({ onClose }: { onClose: () => void }) {
  const { videoRef, state, start, stop } = useEventCamera(3 / 4);
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);
  useEffect(() => {
    void startRef.current();
  }, []);
  const statusText =
    state === "denied"
      ? "카메라 권한이 막혀 있어요. 브라우저 설정에서 이 사이트의 카메라를 허용해 주세요."
      : state === "unsupported"
        ? "이 브라우저에서는 카메라를 쓸 수 없어요. Safari나 Chrome으로 열어 주세요."
        : state === "error"
          ? "카메라를 켜지 못했어요. 다른 앱이 쓰고 있지 않은지 확인해 주세요."
          : state === "ready"
            ? "손님 눈높이에서 얼굴이 잘 보이는지 확인해 주세요."
            : "카메라를 켜고 있어요. 권한을 물으면 허용해 주세요…";
  return (
    <div role="dialog" aria-modal="true" aria-label="카메라 점검" className="ev-stage fixed inset-0 z-50 flex flex-col items-center gap-4 p-[clamp(1rem,3vmin,2.5rem)]">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <video ref={videoRef} playsInline muted className="max-h-full max-w-full -scale-x-100 rounded-2xl bg-[#18181a]" />
      </div>
      <p role="status" className="break-keep text-center text-[clamp(1rem,2.4vmin,1.375rem)] text-(--ev-muted)">{statusText}</p>
      <EventButton
        size="xl"
        className="max-w-md"
        onClick={() => {
          stop();
          onClose();
        }}
      >
        이대로 시작
      </EventButton>
    </div>
  );
}

function PairingForm({ busy, onSubmit }: { busy: boolean; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState("");
  // Studio 의 QR 은 코드를 주소 끝(#pair=)에 싣는다. 태블릿에서 코드를 다시 치지 않게 채워 둔다. 주소에는 남기지 않는다.
  useEffect(() => {
    const fillFromHash = () => {
      const match = window.location.hash.match(/^#pair=([A-Za-z0-9-]{4,16})$/);
      if (!match) return;
      setCode(match[1].toUpperCase());
      window.history.replaceState(window.history.state, "", window.location.pathname);
    };
    fillFromHash();
  }, []);
  return (
    <form
      className="ev-step mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-5 pb-[20vh]"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(code);
      }}
    >
      <label className="flex flex-col gap-3 text-center">
        <span className="break-keep text-[clamp(1.25rem,3.2vmin,2rem)] font-extrabold">담당자에게 받은 연결 코드를 넣어 주세요</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX"
          maxLength={9}
          className="h-[clamp(4rem,9vmin,5.5rem)] rounded-2xl border border-(--ev-border) bg-(--ev-card) px-4 text-center text-[clamp(1.5rem,4vmin,2.5rem)] font-bold tracking-[0.2em]"
        />
      </label>
      <EventButton type="submit" size="xl" disabled={code.trim().length < 8 || busy} aria-busy={busy}>
        {busy ? "잠시만요…" : "연결"}
      </EventButton>
    </form>
  );
}

/**
 * 전체화면은 지원하는 기기에서만 보이는 선택 버튼이다(기획 R5 「추가 사용자 결정」 — 전체화면).
 * 거부·해제·미지원이어도 부스 흐름은 같다. OS 키오스크 잠금과 같지 않다.
 */
function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

function FullscreenToggle() {
  const supported = useSyncExternalStore(
    subscribeFullscreen,
    () => Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen),
    () => false,
  );
  const active = useSyncExternalStore(subscribeFullscreen, () => Boolean(document.fullscreenElement), () => false);
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={() => {
        const request = active ? document.exitFullscreen() : document.documentElement.requestFullscreen();
        void request.catch(() => {});
      }}
      className="h-11 shrink-0 rounded-full border border-(--ev-border) px-4 text-[14px] font-bold text-(--ev-muted)"
    >
      {active ? "전체화면 끄기" : "전체화면"}
    </button>
  );
}
