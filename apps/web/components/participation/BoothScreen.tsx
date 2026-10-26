"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { QrCode } from "@/components/qr/QrCode";
import {
  CaptureAndSend,
  ConsentStep,
  FrameStep,
  sortedFrames,
} from "@/components/participation/EventParticipation";
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
  redeemBoothPairing,
  startBoothGuest,
  submitConsents,
} from "@/lib/event/eventApi";
import type { CaptureRun, EventFrameRef, PublicEvent } from "@/lib/event/types";

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
    const timer = window.setInterval(() => {
      void getBoothMe(device.token)
        .then((me) => {
          if (!me.event) return;
          setEvent(me.event);
          setPhase({ kind: "idle" });
        })
        .catch(() => {});
    }, BOOTH_STATUS_POLL_MS);
    return () => window.clearInterval(timer);
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
    try {
      const paired = await redeemBoothPairing(code.trim().toUpperCase());
      setPhase({ kind: "checking" });
      setBoothDevice({ token: paired.boothToken, deviceId: paired.deviceId, eventId: paired.eventId });
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "연결하지 못했어요. 코드를 다시 확인해 주세요."));
    }
  };

  const onStartGuest = async () => {
    if (!device || !event) return;
    setError(null);
    try {
      const issued = await startBoothGuest(device.token);
      setGuest({ token: issued.participantToken, run: null });
      setPhase({ kind: "consent" });
    } catch (cause) {
      const { code } = getApiErrorDetails(cause);
      if (code === "BOOTH-003") toPairing();
      else setError(getUserFacingApiErrorMessage(cause, "시작하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
  };

  const onConsent = async (decisions: Record<string, boolean>) => {
    if (!event || !guest) return;
    setError(null);
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
    }
  };

  const resultLink =
    phase.kind === "result" && typeof window !== "undefined"
      ? `${window.location.origin}/r#${phase.resultToken}`
      : null;

  return (
    <main className="ev-surface flex min-h-dvh flex-col items-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-[30px] font-extrabold">{event?.name ?? "부스"}</h1>
          <FullscreenToggle />
        </header>

        {error ? <p role="alert" className="text-[15px] text-(--ev-danger)">{error}</p> : null}
        {warning ? (
          <p role="status" className="rounded-2xl border border-(--ev-border) bg-(--ev-card) p-4 text-[16px]">
            곧 처음 화면으로 돌아가요. 계속하려면 화면을 눌러 주세요.
          </p>
        ) : null}

        {phase.kind === "checking" ? (
          <p role="status" className="text-[16px] text-(--ev-muted)">부스를 준비하고 있어요.</p>
        ) : null}

        {phase.kind === "unavailable" ? (
          <p role="alert" className="text-[16px] text-(--ev-muted)">{phase.message}</p>
        ) : null}

        {phase.kind === "pairing" ? <PairingForm onSubmit={(code) => void onPair(code)} /> : null}

        {phase.kind === "idle" && event ? (
          event.captureOpen ? (
            <button
              type="button"
              onClick={() => void onStartGuest()}
              className="h-24 rounded-3xl bg-(--ev-accent) text-[30px] font-extrabold text-(--ev-accent-contrast)"
            >
              촬영 시작
            </button>
          ) : (
            <p className="text-[18px] text-(--ev-muted)">지금은 촬영 시간이 아니에요.</p>
          )
        ) : null}

        {phase.kind === "consent" && event ? (
          <ConsentStep items={event.consentItems} onSubmit={(decisions) => void onConsent(decisions)} />
        ) : null}

        {phase.kind === "frame" ? (
          <FrameStep frames={frames} selected={frame} onSelect={setFrame} onNext={() => setPhase({ kind: "capture" })} />
        ) : null}

        {(phase.kind === "capture" || phase.kind === "sending") && event && guest && frame ? (
          <CaptureAndSend
            event={event}
            token={guest.token}
            frame={frame}
            sending={phase.kind === "sending" ? phase.progress : null}
            onProgress={(progress) => setPhase(progress ? { kind: "sending", progress } : { kind: "capture" })}
            onRunOpened={(run) => setGuest((current) => (current ? { ...current, run } : current))}
            onDone={(resultToken, run) => {
              setGuest((current) => (current ? { ...current, run } : current));
              setPhase({ kind: "result", resultToken });
            }}
            onSessionEnded={() => void finishGuest()}
            onUnavailable={(cause) =>
              setPhase({ kind: "unavailable", message: getUserFacingApiErrorMessage(cause, "지금은 촬영할 수 없어요.") })
            }
          />
        ) : null}

        {phase.kind === "result" && resultLink ? (
          <section className="flex flex-col items-center gap-4">
            <p className="text-[18px] font-bold">휴대폰 카메라로 QR을 찍어 사진을 받아 가세요.</p>
            <div className="rounded-3xl bg-white p-4">
              <QrCode value={resultLink} size={280} label="사진 받기 QR" />
            </div>
            <p className="text-[14px] text-(--ev-muted)">사진은 잠시 뒤 완성돼요. 링크는 지금 받아 가도 돼요.</p>
            <button
              type="button"
              onClick={() => void finishGuest()}
              className="h-16 w-full rounded-full bg-(--ev-accent) text-[18px] font-extrabold text-(--ev-accent-contrast)"
            >
              다음 손님
            </button>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function PairingForm({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(code);
      }}
    >
      <label className="flex flex-col gap-2 text-[16px] font-bold">
        담당자에게 받은 연결 코드
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX"
          maxLength={9}
          className="h-14 rounded-2xl border border-(--ev-border) bg-(--ev-card) px-4 text-center text-[24px] tracking-[0.2em]"
        />
      </label>
      <button
        type="submit"
        disabled={code.trim().length < 8}
        className="h-14 rounded-full bg-(--ev-accent) text-[18px] font-extrabold text-(--ev-accent-contrast) disabled:opacity-40"
      >
        연결
      </button>
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
      className="h-11 rounded-full border border-(--ev-border) px-4 text-[14px] font-bold"
    >
      {active ? "전체화면 끄기" : "전체화면"}
    </button>
  );
}
