"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { useModalDialog } from "@/hooks/useModalDialog";
import { clientApi } from "@/lib/clientApi";
import {
  getApiErrorDetails,
  getUserFacingApiErrorMessage,
} from "@/lib/apiError";
import {
  fetchActiveTerms,
  submitTermsConsents,
  type MyTermsConsent,
} from "@/lib/termsApi";

type Props = {
  consents: MyTermsConsent[];
  onDone: () => void;
  contentHref: (code: string) => string | null;
};

export type TermsContentState = "loading" | "done" | "failed";

/**
 * 약관 본문 확보.
 *
 * `MyTermsConsent` 에는 본문이 없고, 정적 링크(`termsContentHref`)는 tos·terms·privacy·
 * marketing 네 코드에만 있다. 관리자가 다른 코드로 약관을 추가하면 사용자는 **제목만 보고**
 * 동의하게 된다 — 가입 화면은 서버 본문을 펼쳐 주는데 여기와 설정 패널만 그렇지 않았다.
 *
 * 활성 약관 목록에 본문 전문이 함께 온다(`ActiveTerms.content`). 인증도 필요 없다.
 * 못 받아도 화면은 그대로 뜬다 — 정적 링크가 있는 약관은 그 링크로 읽을 수 있다.
 *
 * 재동의 다이얼로그와 설정 패널이 같은 규칙을 쓰도록 훅 하나를 공유한다. 규칙이 갈라지면
 * 한쪽에서만 제목만 보고 동의가 기록되는 상태로 되돌아간다.
 */
export function useTermsContent() {
  const [contentByCode, setContentByCode] = useState<Record<string, string>>({});
  const [state, setState] = useState<TermsContentState>("loading");
  // 다시 시도용 카운터. 조회 실패는 "읽을 수단 없음"으로 굳으므로 되돌릴 길을 남긴다.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchActiveTerms()
      .then((terms) => {
        if (cancelled) return;
        setContentByCode(
          Object.fromEntries(
            terms
              .filter((item) => item.content?.trim())
              .map((item) => [item.code, item.content]),
          ),
        );
        setState("done");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
    };
    // attempt 가 바뀌면 다시 부른다.
  }, [attempt]);

  const reload = useCallback(() => {
    setState("loading");
    setAttempt((current) => current + 1);
  }, []);

  return { contentByCode, state, reload };
}

/**
 * 필수 약관에 동의가 없을 때 붙잡는 화면.
 *
 * 두 경우에 뜬다 — 약관이 개정됐거나(`NEEDS_RECONSENT`), 동의 화면을 거치지 않고 계정이
 * 생겼거나(소셜 로그인 → `NOT_AGREED`).
 *
 * 세 가지를 지킨다.
 *  - **미리 체크해 두지 않는다.** 동의는 사용자가 직접 눌러야 성립한다. 개정 전 버전에
 *    동의했다는 사실은 새 버전에 대한 동의가 아니다.
 *  - **선택 약관의 기존 값은 지운 적 없이 그대로 둔다.** 이 화면을 필수 약관 때문에 띄웠는데
 *    마케팅 수신 동의가 조용히 철회되면 안 된다.
 *  - **닫을 수 없다.** 대신 로그아웃으로 나갈 길을 준다. 필수 약관은 철회가 불가능하고
 *    (TERMS-003) 정책상 탈퇴로만 가능하므로, 동의하지 않겠다면 계정을 쓰지 않는 것이 맞다.
 *  - **읽을 수 없는 항목에 새 동의를 받지 않는다.** 막는 것은 주는 방향뿐이다 — 이미 한
 *    동의를 거두는 것도, 동의할 필요가 없는 선택 약관 때문에 필수 재동의를 막는 것도
 *    아니다. 가입 화면(TermsConsentFieldset)·설정 패널(TermsConsentPanel)과 같은
 *    규칙이다. 위 `useTermsContent` 주석 참고.
 *  - **사용자가 고르지 않은 철회도 기록하지 않는다.** 읽을 수 없는 항목에서 보내는 것은
 *    사용자가 이 화면에서 직접 거둔 것뿐이고, 나머지는 페이로드에서 빼 서버 값을 그대로
 *    둔다. 동의는 법적 기록이라 사용자가 고르지 않은 값을 쓰지 않는다.
 */
export function TermsReconsentDialog({ consents, onDone, contentHref }: Props) {
  const required = useMemo(
    () => consents.filter((item) => item.required && item.status !== "AGREED"),
    [consents],
  );
  const optional = useMemo(() => consents.filter((item) => !item.required), [consents]);

  const {
    contentByCode,
    state: contentState,
    reload: reloadContent,
  } = useTermsContent();

  /**
   * 읽을 수단이 아직 없는 약관인가.
   *
   * 정적 링크도 없고 본문도 못 받았으면 사용자는 **제목만 보고 동의**하게 된다.
   * 그 동의는 받지 않는다 — 새로 체크하는 것을 막고 왜 막혔는지 말한다.
   */
  const isUnreadable = (code: string) =>
    contentHref(code) === null && !contentByCode[code];


  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    // 선택 약관만 지금 값으로 채운다. 필수는 빈 칸에서 시작한다.
    Object.fromEntries(optional.map((item) => [item.code, item.status === "AGREED"])),
  );
  /**
   * 이 화면에서 사용자가 직접 누른 항목.
   *
   * 읽을 수 없는 약관을 페이로드에 넣을지는 **체크 여부가 아니라 이것으로** 가른다.
   * 빈 체크에는 두 가지가 섞여 있다 — 사용자가 방금 거둔 것과, 서버가
   * `NEEDS_RECONSENT`·`NOT_AGREED` 로 줘서 처음부터 비어 있던 것. 구별하지 않으면
   * 뒤엣것이 사용자가 고르지 않은 철회로 나간다.
   */
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  /**
   * 사용자가 이 화면에서 직접 거둔 동의인가.
   *
   * 읽을 수 없는 항목이 페이로드에 남는 **유일한** 경우다. 읽지 못한 본문에 새 동의를
   * 기록하지도, 사용자가 고르지 않은 철회를 기록하지도 않는다.
   */
  const isWithdrawnByUser = (code: string) =>
    Boolean(touched[code]) && !checked[code];
  /**
   * 제출할 수 있는가.
   *
   * 읽을 수단이 없으면 막는다 — 본문 조회가 늦거나 실패한 사이에 "제목만 보고 한 동의"가
   * 기록되지 않게 한다. 다만 **막는 것은 필수 약관뿐이다.**
   *
   * 선택 약관까지 세면, 동의할 필요조차 없는 항목 하나가 필수 재동의를 영구히 잠근다 —
   * 닫을 수 없는 화면이라 사용자에게는 로그아웃 말고 갈 곳이 없다. 읽을 수 없는 선택
   * 약관은 제출을 막는 대신 아래 페이로드에서 뺀다.
   */
  const canSubmit =
    required.every((item) => checked[item.code]) &&
    !required.some((item) => isUnreadable(item.code));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 닫을 수 없는 다이얼로그다. 훅에는 포커스 이동·트랩만 맡기고 Esc 는 흘려보낸다.
  const dialogRef = useModalDialog(true, () => undefined);

  const revised = required.some((item) => item.status === "NEEDS_RECONSENT");

  const handleSubmit = async () => {
    // 제출 버튼은 disabled 로 잠그지 않는다(아래 주석 참고). 대신 여기서 막는다.
    if (isSubmitting || isLoggingOut || !canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      // 화면에 보인 항목만 보낸다. 여기 없는 약관을 끼워 넣으면 사용자가 고르지 않은 값이
      // 장부에 남는다. 전부 아니면 전무라 한 번에 보낸다.
      await submitTermsConsents([
        ...required.map((item) => ({ code: item.code, agreed: true })),
        ...optional
          // 읽을 수 없는 항목은 **사용자가 직접 거둔 것만** 보낸다.
          //
          //  - 체크가 살아 있는 것은 예전에 받아 둔 동의다. 그대로 보내면 읽지 못한 최신
          //    버전에 대한 동의로 새로 기록된다.
          //  - 체크가 비어 있는 것도 대개 서버가 준 초기값이다. `NEEDS_RECONSENT` 를
          //    `agreed: false` 로 보내면 예전 동의가 그대로 지워진다(실측 2026-09-02:
          //    `NEEDS_RECONSENT`(agreedVersion 1) → `NOT_AGREED`). 체크박스는 비활성이라
          //    사용자는 되돌릴 수도 없다.
          //
          // 빼면 서버 값이 그대로 남는다 — 보내지 않은 코드는 건드리지 않는다(실측).
          // 해제(철회)는 본문과 무관하므로 사용자가 직접 누른 것이면 그대로 보낸다.
          .filter(
            (item) => !isUnreadable(item.code) || isWithdrawnByUser(item.code),
          )
          .map((item) => ({
            code: item.code,
            agreed: Boolean(checked[item.code]),
          })),
      ]);
      onDone();
    } catch (err) {
      console.error(err);
      setError(
        getUserFacingApiErrorMessage(
          err,
          "동의를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * 나가는 유일한 출구. 실패를 삼키지 않는다.
   *
   * 쿠키를 지우는 것은 로그아웃 응답의 `Set-Cookie` 뿐이다 — 실패하면 그 헤더가 오지 않는다.
   * 그대로 이동하면 인증 쿠키를 남긴 채 `/login` 에 도착하고, 로그인 화면의 세션 검사
   * (`useRedirectIfAuthenticated`)가 사용자를 보호 화면으로 되돌린다. 닫을 수 없는 이
   * 다이얼로그로 다시 와서 로그아웃만 무한히 반복하게 된다. 그래서 성공을 확인한 뒤에만
   * 이동하고, 실패는 저장 실패와 같은 자리에 남겨 그대로 다시 누르게 한다.
   *
   * 백엔드는 토큰이 없거나 엉터리여도 200 + 쿠키 만료를 준다(실측 2026-09-02). 즉 여기서
   * 잡히는 실패는 대개 요청이 백엔드에 닿지 못한 쪽(GEN-502)이고, 그때 쿠키는 그대로다.
   *
   * 401 만 예외로 이동시킨다. 서버가 이 토큰을 모른다는 뜻이라 세션 검사도 같은 답을 준다
   * (`/api/auth/status` 401 → `authenticated: false`) — 되돌려 보내지지 않는다. 여기서
   * 붙잡으면 이미 끊긴 세션 때문에 영영 못 나간다. 로그아웃은 재발급 대상도 아니라
   * (`clientApi` 의 `SESSION_REFRESH_EXEMPT_PATHS`) 다시 눌러도 계속 401 이다.
   */
  const handleLogout = async () => {
    // 로그아웃 버튼도 disabled 로 잠그지 않는다(아래 주석 참고). 대신 여기서 막는다.
    if (isSubmitting || isLoggingOut) return;
    setIsLoggingOut(true);
    setError(null);
    try {
      await clientApi.delete("/api/client/logout");
    } catch (err) {
      console.error(err);
      if (getApiErrorDetails(err).status !== 401) {
        setError(
          getUserFacingApiErrorMessage(
            err,
            "로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.",
          ),
        );
        setIsLoggingOut(false);
        return;
      }
    }
    // 이동을 시작하면 잠금을 풀지 않는다. 떠나는 동안 한 번 더 눌리지 않게 한다.
    // 클라이언트 전환이 아니라 문서를 새로 받는다 — 로그아웃 직후라 쿠키가 바뀌었고,
    // 스토어에 남은 세션 캐시와 RSC 캐시를 통째로 버려야 한다(app/oauth2/callback 주석 참고).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  };

  return (
    <div className="fixed inset-0 z-130 flex items-end justify-center bg-[rgba(10,24,45,0.6)] px-4 py-6 sm:items-center">
      {/*
        목록은 서버 약관 수만큼 늘어나고 전문을 펼치면 더 늘어난다. 패널이 뷰포트를 넘으면
        제출·로그아웃 버튼이 화면 밖으로 잘리는데, 이 다이얼로그는 닫을 수도 없다.
        오버레이가 아니라 패널을 캡한다 — flex 정렬에서 시작쪽으로 넘친 부분은 오버레이에
        스크롤을 걸어도 닿지 않는다.
      */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-reconsent-title"
        className="hc-surface-card max-h-full w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl border p-6 shadow-(--hc-card-shadow)"
      >
        <span className="hc-accent-chip inline-flex h-12 w-12 items-center justify-center rounded-3xl border">
          <FileText className="h-5 w-5" />
        </span>
        <h2 id="terms-reconsent-title" className="mt-4 text-[18px] font-extrabold">
          {revised ? "약관이 개정되었어요" : "약관 동의가 필요해요"}
        </h2>
        <p className="mt-1.5 text-[13px] leading-6 text-(--hc-muted)">
          {revised
            ? "계속 이용하시려면 개정된 약관에 다시 동의해 주세요."
            : "서비스를 이용하려면 아래 약관에 동의해 주세요."}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {[...required, ...optional].map((item) => {
            const href = contentHref(item.code);
            return (
              <div key={item.code} className="flex flex-col gap-1">
                <label className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-[13px]">
                  <input
                    type="checkbox"
                    checked={checked[item.code] ?? false}
                    // 읽을 수 없는 약관은 **새로 체크하는 것만** 막는다. 이 화면을 띄운
                    // 김에 예전 동의를 거두는 길까지 잠그지 않는다(TermsConsentPanel 과
                    // 같은 규칙).
                    disabled={
                      isSubmitting ||
                      (isUnreadable(item.code) && !checked[item.code])
                    }
                    onChange={(e) => {
                      setChecked((current) => ({
                        ...current,
                        [item.code]: e.target.checked,
                      }));
                      setTouched((current) => ({ ...current, [item.code]: true }));
                    }}
                    className="h-4 w-4 accent-(--hc-primary)"
                  />
                  <span>
                    <span
                      className={
                        item.required
                          ? "text-(--hc-primary-strong)"
                          : "text-zinc-500"
                      }
                    >
                      {item.required ? "[필수]" : "[선택]"}
                    </span>{" "}
                    {item.title}
                  </span>
                  {href ? (
                    <Link
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto shrink-0 text-[11px] text-zinc-500 underline underline-offset-4"
                    >
                      보기
                    </Link>
                  ) : null}
                </label>
                {/* 읽을 수단이 없으면 왜 동의할 수 없는지 말한다. */}
                {isUnreadable(item.code) ? (
                  <p className="ml-6 text-[11px] text-(--hc-muted)">
                    {contentState === "loading"
                      ? "약관 본문을 불러오는 중이에요."
                      : "약관 본문을 불러오지 못했어요."}
                  </p>
                ) : null}
                {/* 정적 링크가 없는 약관은 서버가 준 전문을 그 자리에서 펼친다. */}
                {!href && contentByCode[item.code] ? (
                  <details className="ml-6">
                    <summary className="cursor-pointer text-[11px] text-zinc-500 underline underline-offset-4">
                      전문 보기
                    </summary>
                    <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-950/60 p-2 text-[11px] leading-5 text-zinc-400">
                      {contentByCode[item.code]}
                    </p>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* 닫을 수 없는 화면이라 조회 실패가 그대로 잠김이 된다. 체크 상태를 잃지 않고 다시 부른다. */}
        {contentState === "failed" ? (
          <button
            type="button"
            onClick={reloadContent}
            className="mt-3 text-[12px] text-(--hc-muted) underline underline-offset-4"
          >
            약관 본문 다시 불러오기
          </button>
        ) : null}

        {/* 저장 실패는 알려야 한다 — 다이얼로그 안에 있는 스크린리더 사용자에게도. */}
        {error ? (
          <p role="alert" className="mt-3 text-[12px] text-(--hc-danger)">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          {/*
            disabled 가 아니라 aria-disabled 다.

            포커스를 쥔 요소가 disabled 로 바뀌면 브라우저는 포커스를 body 로 내려놓는다.
            키보드로 여기까지 와서 Enter 를 누른 사용자는 저장에 실패한 순간 모달 밖에
            서 있게 되고, 그 뒤 Tab 은 뒤쪽 화면으로 새어 나간다. 눌림은 handleSubmit
            앞머리에서 막는다.
          */}
          <button
            type="button"
            onClick={handleSubmit}
            aria-disabled={!canSubmit || isSubmitting || isLoggingOut}
            className="hc-button-primary inline-flex h-12 items-center justify-center rounded-full text-[15px] font-extrabold aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
          >
            {isSubmitting ? "저장 중…" : "동의하고 계속하기"}
          </button>
          {/* 실패하면 이 자리에 남아 안내를 읽어야 한다. 제출 버튼과 같은 이유로 disabled 를
              쓰지 않는다 — 누른 순간 포커스가 body 로 떨어지면 안내를 놓친다. */}
          <button
            type="button"
            onClick={handleLogout}
            aria-disabled={isSubmitting || isLoggingOut}
            className="h-10 text-[13px] text-(--hc-muted) underline underline-offset-4 aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
          >
            {isLoggingOut ? "로그아웃 중…" : "동의하지 않고 로그아웃"}
          </button>
        </div>
      </div>
    </div>
  );
}
