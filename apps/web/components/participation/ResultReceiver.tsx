"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
import { getResult, getResultDownload } from "@/lib/event/eventApi";
import type { ResultStatus } from "@/lib/event/types";

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

/** 짧은 서명 URL 로 이동한다. 이 화면 주소가 Referer 로 저장소에 넘어가지 않게 noreferrer 링크를 쓴다. */
function openWithoutReferrer(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
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
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
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
            retryable: status === undefined || status >= 500,
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

  const onDownload = async () => {
    if (!token) return;
    setDownloading(true);
    try {
      const { url } = await getResultDownload(token);
      openWithoutReferrer(url);
    } catch (error) {
      setView({
        kind: "error",
        message: getUserFacingApiErrorMessage(error, "사진을 내려받지 못했어요. 잠시 후 다시 시도해 주세요."),
        retryable: true,
      });
    } finally {
      setDownloading(false);
    }
  };

  const onCopy = async () => {
    try {
      // 전체 주소(fragment 포함)를 복사한다. 이 링크 자체가 사진을 받는 권한이다.
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="ev-surface flex min-h-dvh flex-col items-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-10">
      <div className="flex w-full max-w-md flex-col gap-5">
        <h1 className="text-[22px] font-extrabold">
          {view.kind === "ready" ? view.result.eventName : "사진 받기"}
        </h1>

        {view.kind === "reading" || view.kind === "loading" ? (
          <p role="status" className="text-[15px] text-(--ev-muted)">
            사진을 찾고 있어요.
          </p>
        ) : null}

        {view.kind === "no-token" ? (
          <p role="alert" className="text-[15px] text-(--ev-muted)">
            받은 링크를 다시 열어 주세요. 링크 끝부분이 빠지면 사진을 찾을 수 없어요.
          </p>
        ) : null}

        {view.kind === "error" ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-[15px] text-(--ev-danger)">
              {view.message}
            </p>
            {view.retryable && token ? (
              <button
                type="button"
                onClick={() => load(token)}
                className="h-12 rounded-full border border-(--ev-border) bg-(--ev-card) text-[15px] font-bold"
              >
                다시 확인
              </button>
            ) : null}
          </div>
        ) : null}

        {view.kind === "ready" ? <ResultBody result={view.result} /> : null}

        {view.kind === "ready" && view.result.status === "DONE" ? (
          <button
            type="button"
            onClick={() => void onDownload()}
            disabled={downloading}
            className="h-14 rounded-full bg-(--ev-accent) text-[16px] font-extrabold text-(--ev-accent-contrast) disabled:opacity-60"
          >
            {downloading ? "준비 중…" : "사진 저장"}
          </button>
        ) : null}

        {view.kind === "ready" && view.result.status === "PENDING" && token ? (
          <button
            type="button"
            onClick={() => {
              pollStartedRef.current = Date.now();
              load(token);
            }}
            className="h-12 rounded-full border border-(--ev-border) bg-(--ev-card) text-[15px] font-bold"
          >
            다시 확인
          </button>
        ) : null}

        {view.kind === "ready" && view.result.status !== "EXPIRED" ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-(--ev-border) bg-(--ev-card) p-4">
            <p className="text-[13px] text-(--ev-muted)">
              이 링크를 가진 사람은 이 사진을 받을 수 있어요. 나중에 다시 받으려면 링크를 저장해 두세요.
            </p>
            <button
              type="button"
              onClick={() => void onCopy()}
              className="h-11 rounded-full border border-(--ev-border) text-[14px] font-bold"
            >
              {copied ? "링크를 복사했어요" : "링크 복사"}
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function ResultBody({ result }: { result: ResultStatus }) {
  const until = new Date(result.expiresAt);
  const untilText = Number.isNaN(until.getTime())
    ? null
    : until.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

  if (result.status === "EXPIRED") {
    return (
      <p role="status" className="text-[15px] text-(--ev-muted)">
        사진을 받을 수 있는 기간이 지났어요.
      </p>
    );
  }
  if (result.status === "FAILED") {
    return (
      <p role="alert" className="text-[15px] text-(--ev-danger)">
        사진을 만들지 못했어요. 행사 담당자에게 문의해 주세요.
      </p>
    );
  }
  if (result.status === "PENDING") {
    return (
      <p role="status" className="text-[15px] text-(--ev-muted)">
        사진을 만들고 있어요. 이 화면을 열어 두면 준비되는 대로 보여 드려요.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {result.thumbnailUrl ? (
        // 짧은 서명 URL 이라 next/image 최적화 경로로 보내지 않는다(서버가 주소를 받아 가면 로그에 남는다).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={result.thumbnailUrl}
          alt="완성된 사진 미리보기"
          referrerPolicy="no-referrer"
          className="w-full rounded-2xl border border-(--ev-border) bg-(--ev-card) object-contain"
        />
      ) : null}
      {untilText ? (
        <p className="text-[13px] text-(--ev-muted)">{untilText}까지 받을 수 있어요.</p>
      ) : null}
    </div>
  );
}
