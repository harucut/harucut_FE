"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
import {
  EventActionBar,
  EventButton,
  EventLogo,
  EventSurface,
  EventTitle,
  useEventCopy,
} from "@/components/participation/EventSurface";
import { getResult, getResultDownload } from "@/lib/event/eventApi";
import { takeResultHandoff } from "@/lib/event/resultHandoff";
import type { ResultStatus } from "@/lib/event/types";
import { saveImageFromSignedUrl, saveImageMessage, sharePhotoFile, shareOrCopyLink } from "@/lib/share";

/** 결과 토큰 문법(32바이트 base64url 이 43자). 그 밖의 fragment 는 토큰으로 보내지 않는다. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
/** 준비 중이면 이 간격으로 다시 묻는다. 서버 접수 후 결과가 나오기까지 보통 수십 초다. */
export const RESULT_POLL_MS = 3_000;
/** 준비 중 확인을 멈추는 상한. 넘으면 「다시 확인」 버튼을 둔다. */
const RESULT_POLL_LIMIT_MS = 10 * 60_000;

function readTokenFromHash(): string | null {
  const raw = window.location.hash.replace(/^#/, "");
  let token = raw;
  try {
    token = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return TOKEN_PATTERN.test(token) ? token : null;
}

type ViewState =
  | { kind: "reading" }
  | { kind: "no-token" }
  | { kind: "loading" }
  | { kind: "ready"; result: ResultStatus }
  | { kind: "error"; message: string; retryable: boolean };

/**
 * 결과 수령 화면 본문.
 *
 *  - 토큰은 fragment 에서 읽어 **메모리에만** 둔다. localStorage·촬영 저장소·서버 HTML·로그에 옮기지
 *    않는다. 재방문·새로고침은 fragment 가 든 링크 자체로 한다(R5 16절).
 *  - 결과 API 에는 Authorization Bearer 로 보낸다. 경로·쿼리에 다시 싣지 않는다.
 *  - 같은 탭에서 다른 결과 링크로 바뀌면(hashchange) 이전 결과와 진행 중인 요청을 먼저 버린다.
 *    토큰이 없거나 잘못됐을 때 이전 결과를 대신 보여 주지 않는다.
 *  - 첫 조회로 토큰이 소모되지 않는다 — 함께 찍은 여러 명이 같은 QR 을 스캔한다.
 */
export function ResultReceiver() {
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>({ kind: "reading" });
  // 어느 결과의 저장을 받고 있는가. 지금 토큰과 같을 때만 「저장 중」이다 — 링크가 바뀌면 새 화면은 저장 중이 아니다.
  const [downloadingFor, setDownloadingFor] = useState<string | null>(null);
  const downloading = downloadingFor !== null && downloadingFor === token;
  const [copied, setCopied] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  // 방금 촬영에서 넘어온 사람만 돌아갈 곳이 있다. 링크로 받은 사람에게는 행사 주소를 알리지 않는다.
  const [eventPath, setEventPath] = useState<string | null>(null);
  // 자동 확인을 멈춘 뒤에만 사람에게 다시 확인하라고 한다. 돌고 있는 동안의 버튼은 누를 이유가 없다.
  const [pollGaveUp, setPollGaveUp] = useState(false);
  // 공유 시트는 누른 직후에만 열린다. 받아 두지 않으면 서명 URL 왕복 뒤 브라우저가 거절한다.
  const preparedFileRef = useRef<{ token: string; file: File } | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const pollRef = useRef<number | null>(null);
  const pollStartedRef = useRef(0);
  // 폴링 예약이 다음 렌더의 load 를 부르게 한다(콜백 안에서 자기 자신을 참조하지 않는다).
  const loadRef = useRef<(token: string) => void>(() => {});

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) window.clearTimeout(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => {
    const sync = () => {
      const next = readTokenFromHash();
      setToken(next);
      setSaveNotice(null);
      setPollGaveUp(false);
      preparedFileRef.current = null;
      // 방금 촬영에서 넘어왔으면 서버를 기다리지 않고 그 행사의 모습으로 「만드는 중」을 바로 보여 준다.
      const handoff = next ? takeResultHandoff(next) : null;
      setEventPath(handoff?.eventPath ?? null);
      if (handoff) {
        setView({
          kind: "ready",
          result: { status: "PENDING", eventName: handoff.eventName, thumbnailUrl: null, expiresAt: "", theme: handoff.theme },
        });
        return;
      }
      setView(next ? { kind: "loading" } : { kind: "no-token" });
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const load = useCallback(
    (current: string) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      stopPolling();
      void getResult(current, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setView({ kind: "ready", result });
          if (result.status === "PENDING") {
            if (Date.now() - pollStartedRef.current < RESULT_POLL_LIMIT_MS) {
              pollRef.current = window.setTimeout(() => loadRef.current(current), RESULT_POLL_MS);
            } else {
              setPollGaveUp(true);
            }
          }
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          const { status } = getApiErrorDetails(error);
          setView({
            kind: "error",
            message: getUserFacingApiErrorMessage(error, "사진을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."),
            // 429(GEN-061)는 잠시 뒤 다시 하면 되는 실패다 — 틀린 토큰을 많이 낸 같은 IP 에만 난다.
            retryable: status === undefined || status >= 500 || status === 429,
          });
        });
    },
    [stopPolling],
  );

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (!token) {
      requestRef.current?.abort();
      stopPolling();
      return;
    }
    pollStartedRef.current = Date.now();
    load(token);
    return () => {
      requestRef.current?.abort();
      stopPolling();
    };
  }, [token, load, stopPolling]);

  // 저장을 누른 뒤 다른 결과 링크로 바뀌면, 이전 요청의 응답이 새 결과 화면에 닿으면 안 된다 — 이전 사진을
  // 열거나 이전 실패로 새 화면을 덮었다(Codex 리뷰 #523). 응답을 받을 때 지금 토큰과 견준다.
  const currentTokenRef = useRef(token);
  useEffect(() => {
    currentTokenRef.current = token;
  }, [token]);

  // 사진이 나오면 미리 받아 둔다. 공유 시트가 되는 기기(주로 휴대폰)에서만 — 다른 기기에는 필요 없다.
  const readyImageUrl = view.kind === "ready" && view.result.status === "DONE" ? (view.result.imageUrl ?? null) : null;
  const readyEventName = view.kind === "ready" ? view.result.eventName : "";
  useEffect(() => {
    if (!readyImageUrl || !token || typeof navigator.canShare !== "function") return;
    const controller = new AbortController();
    void fetch(readyImageUrl, { credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!blob || controller.signal.aborted) return;
        preparedFileRef.current = {
          token,
          file: new File([blob], `${readyEventName || "행사 사진"}.jpg`, { type: blob.type || "image/jpeg" }),
        };
      })
      // 저장소가 교차 출처 읽기를 막으면 받아 두지 못한다. 저장 버튼이 링크로 받는다.
      .catch(() => {});
    return () => controller.abort();
  }, [readyImageUrl, readyEventName, token]);

  const onDownload = async () => {
    if (!token) return;
    const requested = token;
    setSaveNotice(null);
    const prepared = preparedFileRef.current;
    if (prepared?.token === requested) {
      const shared = await sharePhotoFile(prepared.file);
      if (shared) {
        setSaveNotice(saveImageMessage(shared));
        return;
      }
    }
    setDownloadingFor(requested);
    try {
      const { url } = await getResultDownload(requested);
      if (currentTokenRef.current !== requested) return;
      const saved = await saveImageFromSignedUrl(url, `${readyEventName || "행사 사진"}.jpg`);
      if (currentTokenRef.current !== requested) return;
      setSaveNotice(saved === "failed" ? "사진을 저장하지 못했어요. 다시 눌러 주세요." : saveImageMessage(saved));
    } catch (error) {
      if (currentTokenRef.current !== requested) return;
      setView({
        kind: "error",
        message: getUserFacingApiErrorMessage(error, "사진을 내려받지 못했어요. 잠시 후 다시 시도해 주세요."),
        retryable: true,
      });
    } finally {
      setDownloadingFor((current) => (current === requested ? null : current));
    }
  };

  useEffect(() => {
    if (readyEventName) document.title = readyEventName;
  }, [readyEventName]);

  const onCopy = async () => {
    try {
      // 전체 주소(fragment 포함)를 복사한다. 이 링크 자체가 사진을 받는 권한이다.
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  // 공유 시트가 되는 기기에서는 메신저로 바로 보낼 수 있게 한다. 링크를 잃으면 사진도 못 받는다.
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const onShare = async () => {
    try {
      await shareOrCopyLink({ title: readyEventName || "행사 사진", url: window.location.href });
    } catch {
      setCopied(false);
    }
  };

  const showTitle = view.kind !== "reading" && view.kind !== "loading";

  return (
    <EventSurface
      theme={view.kind === "ready" ? view.result.theme : null}
      className="flex min-h-dvh flex-col items-center"
    >
      <div className="flex w-full max-w-md flex-1 flex-col gap-4 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <EventLogo />
        {showTitle ? (
          <div className="ev-readable">
            <EventTitle className="text-[clamp(1.5rem,6.4vw,1.875rem)]">
              {view.kind === "ready" ? view.result.eventName : "사진 받기"}
            </EventTitle>
          </div>
        ) : null}

        {view.kind === "reading" || view.kind === "loading" ? (
          <p role="status" className="text-[15px] text-(--ev-muted)">
            사진을 준비하고 있어요…
          </p>
        ) : null}

        {view.kind === "no-token" ? (
          <p role="alert" className="break-keep text-[16px] leading-relaxed text-(--ev-muted)">
            받은 링크를 다시 열어 주세요. 링크 끝부분이 빠지면 사진을 찾을 수 없어요. 그래도 안 되면 행사 담당자에게 문의해 주세요.
          </p>
        ) : null}

        {view.kind === "error" ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="break-keep text-[16px] font-semibold leading-relaxed text-(--ev-danger)">
              {view.message}
            </p>
            {view.retryable && token ? (
              <EventButton tone="quiet" size="md" onClick={() => load(token)}>
                다시 확인
              </EventButton>
            ) : null}
          </div>
        ) : null}

        {view.kind === "ready" ? <ResultBody result={view.result} /> : null}

        {view.kind === "ready" && view.result.status !== "EXPIRED" && view.result.status !== "FAILED" ? (
          <div className="flex flex-col gap-2.5 rounded-2xl border border-(--ev-border) bg-(--ev-card) p-4">
            <p className="break-keep text-[13px] leading-relaxed text-(--ev-muted)">
              이 링크를 가진 사람은 이 사진을 받을 수 있어요. 나중에 다시 받으려면 링크를 저장해 두세요.
            </p>
            <div className="flex gap-2">
              {canShare ? (
                <EventButton tone="quiet" size="md" className="flex-1" onClick={() => void onShare()}>
                  링크 보내기
                </EventButton>
              ) : null}
              <EventButton tone="quiet" size="md" className="flex-1" onClick={() => void onCopy()}>
                {copied ? "링크를 복사했어요" : "링크 복사"}
              </EventButton>
            </div>
          </div>
        ) : null}

        {view.kind === "ready" && view.result.status === "DONE" && eventPath ? (
          <Link href={eventPath} className="flex min-h-11 items-center justify-center text-[14px] font-semibold text-(--ev-muted) underline underline-offset-4">
            한 번 더 찍기
          </Link>
        ) : null}

        {view.kind === "ready" && view.result.status === "DONE" ? (
          <EventActionBar>
            {saveNotice ? (
              <p role="status" className="break-keep text-center text-[14px] font-semibold">
                {saveNotice}
              </p>
            ) : null}
            <EventButton onClick={() => void onDownload()} disabled={downloading} aria-busy={downloading}>
              {downloading ? "준비 중…" : "사진 저장"}
            </EventButton>
          </EventActionBar>
        ) : null}

        {view.kind === "ready" && view.result.status === "PENDING" && pollGaveUp && token ? (
          <EventActionBar>
            <EventButton
              tone="quiet"
              size="md"
              onClick={() => {
                setPollGaveUp(false);
                pollStartedRef.current = Date.now();
                load(token);
              }}
            >
              다시 확인
            </EventButton>
          </EventActionBar>
        ) : null}

        {view.kind !== "ready" || view.result.status !== "DONE" ? (
          <div className="pb-[max(1rem,env(safe-area-inset-bottom))]" />
        ) : null}
      </div>
    </EventSurface>
  );
}

function ResultBody({ result }: { result: ResultStatus }) {
  const expired = useEventCopy("expired", "사진을 받을 수 있는 기간이 지났어요.");
  const failed = useEventCopy("error", "사진을 만들지 못했어요. 행사 담당자에게 문의해 주세요.");
  const composing = useEventCopy("composing", "사진을 만들고 있어요. 이 화면을 열어 두면 준비되는 대로 보여 드려요.");
  const done = useEventCopy("done", "사진이 완성됐어요.");
  // 이 화면에서 기다린 사람에게만 사진이 현상되듯 나타난다. 다시 열어 본 사람은 바로 본다.
  const [waited, setWaited] = useState(result.status === "PENDING");
  if (result.status === "PENDING" && !waited) setWaited(true);
  const until = new Date(result.expiresAt);
  const untilText = Number.isNaN(until.getTime())
    ? null
    : until.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

  if (result.status === "EXPIRED") {
    return (
      <p role="status" className="break-keep text-[16px] leading-relaxed text-(--ev-muted)">
        {expired}
      </p>
    );
  }
  if (result.status === "FAILED") {
    return (
      <p role="alert" className="break-keep text-[16px] font-semibold leading-relaxed text-(--ev-danger)">
        {failed}
      </p>
    );
  }
  if (result.status === "PENDING") {
    return (
      <div className="flex flex-col items-center gap-4">
        <div aria-hidden className="ev-developing aspect-2/3 w-full max-w-60 rounded-2xl border border-(--ev-border) bg-(--ev-card)" />
        <p role="status" className="break-keep text-center text-[15px] leading-relaxed text-(--ev-muted)">
          {composing}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="ev-readable break-keep text-[16px] leading-relaxed">{done}</p>
      {result.imageUrl || result.thumbnailUrl ? (
        // 짧은 서명 URL 이라 next/image 최적화 경로로 보내지 않는다(서버가 주소를 받아 가면 로그에 남는다).
        // 원본을 먼저 쓴다 — 썸네일은 긴 변 512px 라 세로 4컷이면 폭이 170px 로, 참가자가 자기 사진을 처음 보는 순간이 뿌옇다.
        // 높이를 묶어 「사진 저장」이 첫 화면 안에 들어오게 한다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={result.imageUrl ?? result.thumbnailUrl ?? undefined}
          alt="완성된 사진 미리보기"
          referrerPolicy="no-referrer"
          fetchPriority="high"
          className={`mx-auto max-h-[56svh] w-auto max-w-full rounded-xl object-contain shadow-[0_14px_34px_rgba(0,0,0,0.18)] ${waited ? "ev-develop" : ""}`}
        />
      ) : null}
      {untilText ? (
        <p className="text-center text-[13px] text-(--ev-muted)">{untilText}까지 받을 수 있어요.</p>
      ) : null}
    </div>
  );
}
