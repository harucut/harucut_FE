"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  ParticipantJob,
  PublicEvent,
} from "@/lib/event/types";
import { useEventCamera } from "@/components/participation/useEventCamera";

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
const COUNTDOWN_SECONDS = 3;

export function sortedFrames(event: PublicEvent): EventFrameRef[] {
  const allowed = new Set(event.allowedLayouts);
  return [...event.frames]
    .filter((frame) => allowed.has(frame.layoutType))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function slotAspectOf(frame: EventFrameRef | null) {
  const layout = FRAME_LAYOUTS[frameIdFromFrameType(frame?.layoutType ?? "CLASSIC")];
  const slot = layout.slots[0];
  return slot.width / slot.height;
}

export function EventParticipation({ slug }: { slug: string }) {
  const router = useRouter();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<EventFrameRef | null>(null);
  const [results, setResults] = useState<ParticipantJob[]>([]);

  const frames = useMemo(() => (event ? sortedFrames(event) : []), [event]);

  const showUnavailable = useCallback((cause: unknown, fallback: string) => {
    setStep({ kind: "unavailable", message: getUserFacingApiErrorMessage(cause, fallback) });
  }, []);

  /** 참가자 자격이 끝났다(만료·회수). 이 행사의 자격만 버리고 처음으로 돌아간다. */
  const resetSession = useCallback((eventId: string) => {
    forgetParticipant(eventId);
    setSession(null);
    setStep({ kind: "intro" });
  }, []);

  const loadResults = useCallback(async (token: string, eventId: string) => {
    try {
      setResults(await listParticipantResults(token, eventId));
    } catch {
      setResults([]);
    }
  }, []);

  // 행사 정보 → 저장된 자격이 있으면 세션 복원.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      let loaded: PublicEvent;
      try {
        loaded = await getPublicEvent(slug, controller.signal);
      } catch (cause) {
        if (controller.signal.aborted) return;
        showUnavailable(cause, "행사를 찾을 수 없어요. 받은 링크를 다시 확인해 주세요.");
        return;
      }
      if (controller.signal.aborted) return;
      setEvent(loaded);
      const defaultFrame = sortedFrames(loaded).find((f) => f.isDefault) ?? sortedFrames(loaded)[0] ?? null;
      setFrame(defaultFrame);
      if (!loaded.byodEnabled) {
        setStep({ kind: "unavailable", message: "이 행사는 현장 부스에서만 참여할 수 있어요." });
        return;
      }

      const stored = readParticipant(loaded.eventId);
      if (!stored) {
        setStep({ kind: "intro" });
        return;
      }
      try {
        const state = await getParticipantSession(stored.token, controller.signal);
        if (controller.signal.aborted) return;
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
  }, [slug, showUnavailable, resetSession, loadResults]);

  useEffect(() => {
    if (event) document.title = event.name;
  }, [event]);

  const onJoin = async () => {
    if (!event) return;
    setError(null);
    try {
      const issued = await startByodSession(slug);
      const stored = { token: issued.participantToken, participantId: issued.participantId, expiresAt: issued.expiresAt };
      saveParticipant(event.eventId, stored);
      setSession(stored);
      setStep({ kind: "consent" });
    } catch (cause) {
      const { code } = getApiErrorDetails(cause);
      if (code === "EVENT-001" || code === "EVENT-002") showUnavailable(cause, "지금은 참여할 수 없어요.");
      else setError(getUserFacingApiErrorMessage(cause, "참여를 시작하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
  };

  const onConsent = async (decisions: Record<string, boolean>) => {
    if (!event || !session) return;
    setError(null);
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
      if (status === "ACTIVE") {
        setStep({ kind: "home" });
        void loadResults(session.token, event.eventId);
      } else {
        setError("필수 안내에 동의하면 촬영할 수 있어요.");
      }
    } catch (cause) {
      if (getApiErrorDetails(cause).status === 401) resetSession(event.eventId);
      else setError(getUserFacingApiErrorMessage(cause, "동의를 저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
  };

  const onStartShooting = () => {
    setError(null);
    setStep(frames.length > 1 ? { kind: "frame" } : { kind: "capture" });
  };

  const goToResult = useCallback(
    (resultToken: string) => {
      // 결과 링크는 fragment 로만 옮긴다(경로·쿼리에 싣지 않는다).
      router.push(`/r#${resultToken}`);
    },
    [router],
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
    try {
      const { url } = await getParticipantDownload(session.token, jobId);
      const link = document.createElement("a");
      link.href = url;
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "사진을 내려받지 못했어요."));
    }
  };

  return (
    <main className="ev-surface flex min-h-dvh flex-col items-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8">
      <div className="flex w-full max-w-md flex-col gap-5">
        <h1 className="text-[24px] font-extrabold">{event?.name ?? "행사 촬영"}</h1>

        {step.kind === "loading" ? (
          <p role="status" className="text-[15px] text-(--ev-muted)">행사 정보를 불러오고 있어요.</p>
        ) : null}

        {step.kind === "unavailable" ? (
          <p role="alert" className="text-[15px] text-(--ev-muted)">{step.message}</p>
        ) : null}

        {error ? (
          <p role="alert" className="text-[14px] text-(--ev-danger)">{error}</p>
        ) : null}

        {step.kind === "intro" && event ? (
          <IntroStep event={event} onJoin={() => void onJoin()} />
        ) : null}

        {step.kind === "consent" && event ? (
          <ConsentStep items={event.consentItems} onSubmit={(decisions) => void onConsent(decisions)} />
        ) : null}

        {step.kind === "home" && event ? (
          <HomeStep
            captureOpen={event.captureOpen}
            results={results}
            onStart={onStartShooting}
            onShare={(jobId) => void onShareResult(jobId)}
            onDownload={(jobId) => void onDownloadResult(jobId)}
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
            onSessionEnded={() => resetSession(event.eventId)}
            onUnavailable={(cause) => showUnavailable(cause, "지금은 촬영할 수 없어요.")}
          />
        ) : null}
      </div>
    </main>
  );
}

function IntroStep({ event, onJoin }: { event: PublicEvent; onJoin: () => void }) {
  return (
    <section className="flex flex-col gap-4">
      {!event.captureOpen ? (
        <p className="text-[15px] text-(--ev-muted)">지금은 촬영 시간이 아니에요. 받은 사진은 그대로 다시 받을 수 있어요.</p>
      ) : (
        <p className="text-[15px] text-(--ev-muted)">휴대폰 카메라로 네 컷을 찍어 행사 사진을 만들어요.</p>
      )}
      <button
        type="button"
        onClick={onJoin}
        className="h-14 rounded-full bg-(--ev-accent) text-[16px] font-extrabold text-(--ev-accent-contrast)"
      >
        참여하기
      </button>
    </section>
  );
}

export function ConsentStep({
  items,
  onSubmit,
}: {
  items: ConsentItem[];
  onSubmit: (decisions: Record<string, boolean>) => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const missingRequired = items.some((item) => item.required && !checked[item.code]);
  return (
    <section className="flex flex-col gap-4">
      <p className="text-[15px]">사진을 받는 곳과 쓰는 목적, 보관 기간을 확인해 주세요.</p>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={`${item.code}:${item.version}`} className="rounded-2xl border border-(--ev-border) bg-(--ev-card) p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={Boolean(checked[item.code])}
                onChange={(e) => setChecked((prev) => ({ ...prev, [item.code]: e.target.checked }))}
                className="mt-1 size-5"
              />
              <span className="flex flex-col gap-1">
                <span className="text-[15px] font-bold">
                  {item.required ? "[필수] " : "[선택] "}
                  {item.title}
                </span>
                {item.body ? <span className="whitespace-pre-line text-[13px] text-(--ev-muted)">{item.body}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={missingRequired}
        onClick={() => onSubmit(checked)}
        className="h-14 rounded-full bg-(--ev-accent) text-[16px] font-extrabold text-(--ev-accent-contrast) disabled:opacity-40"
      >
        동의하고 계속
      </button>
    </section>
  );
}

function HomeStep({
  captureOpen,
  results,
  onStart,
  onShare,
  onDownload,
}: {
  captureOpen: boolean;
  results: ParticipantJob[];
  onStart: () => void;
  onShare: (jobId: number) => void;
  onDownload: (jobId: number) => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      {captureOpen ? (
        <button
          type="button"
          onClick={onStart}
          className="h-14 rounded-full bg-(--ev-accent) text-[16px] font-extrabold text-(--ev-accent-contrast)"
        >
          촬영 시작
        </button>
      ) : (
        <p className="text-[15px] text-(--ev-muted)">지금은 촬영 시간이 아니에요.</p>
      )}
      {results.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-[16px] font-bold">이 행사에서 만든 사진</h2>
          <ul className="flex flex-col gap-2">
            {results.map((job, index) => (
              <li key={job.jobId} className="flex items-center justify-between gap-2 rounded-2xl border border-(--ev-border) bg-(--ev-card) p-3">
                <span className="text-[14px]">
                  {index + 1}번째 사진 · {job.status === "DONE" ? "완성" : job.status === "PENDING" ? "만드는 중" : "실패"}
                </span>
                {job.status === "DONE" ? (
                  <span className="flex gap-2">
                    <button type="button" onClick={() => onDownload(job.jobId)} className="h-11 rounded-full border border-(--ev-border) px-4 text-[13px] font-bold">
                      저장
                    </button>
                    <button type="button" onClick={() => onShare(job.jobId)} className="h-11 rounded-full border border-(--ev-border) px-4 text-[13px] font-bold">
                      링크
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function FrameStep({
  frames,
  selected,
  onSelect,
  onNext,
}: {
  frames: EventFrameRef[];
  selected: EventFrameRef | null;
  onSelect: (frame: EventFrameRef) => void;
  onNext: () => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[16px] font-bold">프레임을 골라 주세요</h2>
      <div className="grid grid-cols-2 gap-3">
        {frames.map((frame) => (
          <button
            key={frame.frameVersionId}
            type="button"
            aria-pressed={selected?.frameVersionId === frame.frameVersionId}
            onClick={() => onSelect(frame)}
            className="flex flex-col items-center gap-2 rounded-2xl border-2 border-(--ev-border) bg-(--ev-card) p-2 aria-pressed:border-(--ev-accent)"
          >
            {frame.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={frame.previewUrl} alt="" referrerPolicy="no-referrer" className="h-40 w-full object-contain" />
            ) : (
              <span className="flex h-40 items-center text-[13px] text-(--ev-muted)">{frame.layoutType}</span>
            )}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={!selected}
        onClick={onNext}
        className="h-14 rounded-full bg-(--ev-accent) text-[16px] font-extrabold text-(--ev-accent-contrast) disabled:opacity-40"
      >
        이 프레임으로 찍기
      </button>
    </section>
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
  onSessionEnded,
  onUnavailable,
}: {
  event: PublicEvent;
  token: string;
  frame: EventFrameRef;
  sending: string | null;
  onProgress: (progress: string | null) => void;
  /** 접수가 끝났다. 부스는 회차를 닫으려고 회차 정보도 받는다. */
  onDone: (resultToken: string, run: CaptureRun) => void;
  onSessionEnded: () => void;
  onUnavailable: (cause: unknown) => void;
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
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef<CaptureRun | null>(null);
  const uploadedRef = useRef<(string | null)[]>(Array(SHOT_COUNT).fill(null));
  const idempotencyKeyRef = useRef<string | null>(null);

  const openRun = useCallback(async () => {
    runRef.current = await startCaptureRun(token, event.eventId);
    uploadedRef.current = Array(SHOT_COUNT).fill(null);
    idempotencyKeyRef.current = crypto.randomUUID();
  }, [token, event.eventId]);

  /*
    부모가 넘기는 콜백은 렌더마다 새로 만들어진다. 그걸 시작 이펙트의 의존성에 넣으면 전송 진행
    표시가 바뀔 때마다 이펙트가 다시 돌아 회차를 새로 열고(올린 칸 기록이 지워진다) 카메라도 다시
    켠다. 그래서 시작은 화면에 들어올 때 한 번만 하고, 콜백은 최신 값을 ref 로 읽는다.
  */
  const handlersRef = useRef({ onSessionEnded, onUnavailable, startCamera, stopCamera, openRun });
  useEffect(() => {
    handlersRef.current = { onSessionEnded, onUnavailable, startCamera, stopCamera, openRun };
  }, [onSessionEnded, onUnavailable, startCamera, stopCamera, openRun]);

  useEffect(() => {
    const { startCamera: start, stopCamera: stop, openRun: open } = handlersRef.current;
    void start();
    void open().catch((cause) => {
      const { status, code } = getApiErrorDetails(cause);
      if (status === 401) handlersRef.current.onSessionEnded();
      else if (code === "EVENT-001") handlersRef.current.onUnavailable(cause);
      else setError(getUserFacingApiErrorMessage(cause, "촬영을 시작하지 못했어요. 잠시 후 다시 시도해 주세요."));
    });
    return () => stop();
  }, []);

  // 미리보기 주소는 바뀌거나 화면을 떠날 때 해제한다.
  useEffect(() => () => previews.forEach((url) => url && URL.revokeObjectURL(url)), [previews]);

  const nextEmpty = shots.findIndex((shot) => shot === null);

  const takeShot = useCallback(async () => {
    if (nextEmpty < 0) return;
    try {
      const photo = await captureFrame();
      setShots((prev) => prev.map((shot, i) => (i === nextEmpty ? photo : shot)));
      setPreviews((prev) => prev.map((url, i) => (i === nextEmpty ? URL.createObjectURL(photo) : url)));
      uploadedRef.current[nextEmpty] = null;
    } catch {
      setError("사진을 찍지 못했어요. 다시 시도해 주세요.");
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

  const retake = (index: number) => {
    setShots((prev) => prev.map((shot, i) => (i === index ? null : shot)));
    setPreviews((prev) => prev.map((url, i) => (i === index ? null : url)));
    uploadedRef.current[index] = null;
  };

  const send = async (retriedForNewRun = false) => {
    setError(null);
    try {
      if (!runRef.current) await openRun();
      const run = runRef.current!;
      for (let slot = 0; slot < SHOT_COUNT; slot += 1) {
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
      onProgress("사진을 만드는 중");
      const accepted = await submitEventCompose(token, event.eventId, {
        captureRunId: run.captureRunId,
        frameVersionId: frame.frameVersionId,
        sourceAssetIds: uploadedRef.current as string[],
        idempotencyKey: idempotencyKeyRef.current!,
      });
      stopCamera();
      onDone(accepted.resultToken, run);
    } catch (cause) {
      onProgress(null);
      const { status, code } = getApiErrorDetails(cause);
      if (status === 401) return onSessionEnded();
      if (code === "EVENT-001") return onUnavailable(cause);
      if (code === "PART-003" && !retriedForNewRun) {
        // 회차가 끝났다(유효시간 초과 등). 새 회차를 열고 같은 사진을 처음부터 올린다.
        runRef.current = null;
        return send(true);
      }
      setError(getUserFacingApiErrorMessage(cause, "사진을 보내지 못했어요. 다시 시도해 주세요."));
    }
  };

  const allTaken = nextEmpty < 0;

  if (cameraState === "denied" || cameraState === "unsupported") {
    return (
      <section className="flex flex-col gap-3">
        <p role="alert" className="text-[15px]">
          {cameraState === "denied"
            ? "카메라를 쓸 수 있게 허용해 주세요. 브라우저 설정에서 이 사이트의 카메라 권한을 켠 뒤 다시 시도해 주세요."
            : "이 브라우저에서는 카메라를 쓸 수 없어요. Safari나 Chrome에서 이 링크를 열어 주세요."}
        </p>
        <button type="button" onClick={() => void startCamera()} className="h-12 rounded-full border border-(--ev-border) text-[15px] font-bold">
          다시 시도
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: String(slotAspectOf(frame)) }}>
        <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" />
        {countdown !== null && countdown > 0 ? (
          <span aria-live="assertive" className="absolute inset-0 flex items-center justify-center text-[56px] font-extrabold tabular-nums text-white">
            {countdown}
          </span>
        ) : null}
      </div>

      <ol className="grid grid-cols-4 gap-2" aria-label="찍은 사진">
        {previews.map((url, index) => (
          <li key={index} className="flex flex-col items-center gap-1">
            <div className="aspect-square w-full overflow-hidden rounded-lg border border-(--ev-border) bg-(--ev-card)">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={`${index + 1}번째 사진`} className="size-full object-cover" />
              ) : null}
            </div>
            {url && !sending ? (
              <button type="button" onClick={() => retake(index)} className="h-11 text-[12px] font-bold text-(--ev-muted)">
                다시 찍기
              </button>
            ) : null}
          </li>
        ))}
      </ol>

      {error ? <p role="alert" className="text-[14px] text-(--ev-danger)">{error}</p> : null}
      {sending ? <p role="status" className="text-[15px] text-(--ev-muted)">{sending}</p> : null}

      {!allTaken ? (
        <button
          type="button"
          disabled={cameraState !== "ready" || countdown !== null}
          onClick={() => setCountdown(COUNTDOWN_SECONDS)}
          className="h-16 rounded-full bg-(--ev-accent) text-[18px] font-extrabold text-(--ev-accent-contrast) disabled:opacity-40"
        >
          {nextEmpty + 1}번째 사진 찍기
        </button>
      ) : (
        <button
          type="button"
          disabled={Boolean(sending)}
          onClick={() => void send()}
          className="h-16 rounded-full bg-(--ev-accent) text-[18px] font-extrabold text-(--ev-accent-contrast) disabled:opacity-40"
        >
          이 사진으로 만들기
        </button>
      )}
    </section>
  );
}
