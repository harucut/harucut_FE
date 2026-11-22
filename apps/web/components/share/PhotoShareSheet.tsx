"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, Link2, X } from "lucide-react";
import { KakaoMark } from "@/components/auth/socialMarks";
import { InstagramMark, ThreadsMark, XMark } from "@/components/share/brandMarks";
import { RetryButton } from "@/components/ui/LoadFailed";
import { useModalDialog } from "@/hooks/useModalDialog";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { mediaShareUrl } from "@/lib/mediaShareLink";
import { isNativeShell } from "@/lib/nativeBridge";
import { copyText, isCopyFailedError, sharePhoto } from "@/lib/share";
import { createMediaShareLink } from "@/lib/userMediaApi";

/** 사진마다 링크는 하나다(백엔드가 같은 토큰을 준다). 창을 다시 열 때 다시 묻지 않는다. */
const linkCache = new Map<number, string>();

type LinkState = { status: "loading" } | { status: "ready"; url: string } | { status: "error"; message: string };

type Props = {
  open: boolean;
  onClose: () => void;
  mediaId: number;
  /** 사진 이름. 카드 제목이자, 링크로 갈 때의 제목이다. */
  title: string;
  thumbnailSrc: string | null;
  /** 카카오톡·인스타그램이 넘기는 사진 파일(lib/share.ts 의 sharePhoto). 브라우저는 미리 받아 둔 파일이 있어야 한다. */
  photo: { file: File | null; getUrl: () => Promise<string>; filename: string };
};

const X_INTENT = "https://x.com/intent/tweet";
const THREADS_INTENT = "https://www.threads.com/intent/post";

/** 이 기기에서 사진 파일을 앱으로 넘길 수 있는가 — 앱이거나, 파일 공유가 되는 터치 기기(휴대폰·태블릿) 브라우저. */
function canSendPhotoFile() {
  if (isNativeShell()) return true;
  return typeof navigator.canShare === "function" && window.matchMedia?.("(pointer: coarse)").matches === true;
}

/**
 * 공유 창(2026-11-16 「하단에서 스륵 올라오는 일반적인 거」 + 참고 그림). 휴대폰에서는 아래에서 올라오고, 넓은 화면에서는
 * 가운데에 뜬다. 위에 무엇을 보내는지(사진 카드), 아래에 보낼 곳이 한 줄로 있다.
 *
 * - 카카오톡·인스타그램: 사진 파일을 기기 공유 창에 넘긴다 — 거기서 카카오톡 대화방이나 인스타그램 스토리·피드·DM 을
 *   고른다. 웹은 두 앱에 사진을 바로 넣을 길이 없다(카카오톡은 카카오 앱 키, 인스타그램 스토리는 메타 앱 ID 가 있어야 한다).
 *   PC 처럼 파일을 넘길 수 없는 기기에는 두 단추를 두지 않는다 — 눌러도 할 일이 없다.
 * - 스레드·X: 받는 사람 페이지 링크로 새 글 쓰기를 연다. 미리보기에 사진이 뜬다(app/s/[token]/page.tsx 의 og:image).
 * - 링크 복사: 같은 링크를 복사한다.
 *
 * 링크는 창을 열 때 받아 둔다. 누른 뒤에 받으면 그사이 제스처가 풀려 브라우저가 새 창·복사를 막는다.
 */
export function PhotoShareSheet({ open, onClose, mediaId, title, thumbnailSrc, photo }: Props) {
  const dialogRef = useModalDialog(open, onClose);
  const titleId = useId();
  const [fetched, setFetched] = useState<Record<number, LinkState>>({});
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cached = linkCache.get(mediaId);
  const link: LinkState = cached ? { status: "ready", url: cached } : (fetched[mediaId] ?? { status: "loading" });

  useEffect(() => {
    if (!open || linkCache.has(mediaId)) return;
    let cancelled = false;
    createMediaShareLink(mediaId)
      .then((token) => {
        const url = mediaShareUrl(window.location.origin, token);
        linkCache.set(mediaId, url);
        if (!cancelled) setFetched((prev) => ({ ...prev, [mediaId]: { status: "ready", url } }));
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setFetched((prev) => ({
          ...prev,
          [mediaId]: { status: "error", message: getUserFacingApiErrorMessage(reason, "링크를 만들지 못했어요.") },
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [open, mediaId, attempt]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!open) return null;

  const ready = link.status === "ready" ? link.url : null;
  const fileTargets = canSendPhotoFile();
  // 브라우저는 받아 둔 파일이 있어야 바로 넘긴다. 앱은 네이티브가 그 자리에서 받는다.
  const fileDisabled = sending || (!isNativeShell() && !photo.file);

  const sendPhoto = async () => {
    setError(null);
    setSending(true);
    try {
      const result = await sharePhoto({ ...photo, link: ready ?? undefined, title: `${title} | 하루컷` });
      if (result === "shared") onClose();
      if (result === "copied") setCopied(true);
    } catch (reason) {
      setError(
        isCopyFailedError(reason)
          ? "복사가 막혔어요. 브라우저에서 복사를 허용한 뒤 다시 눌러 주세요."
          : getUserFacingApiErrorMessage(reason, "사진을 보내지 못했어요. 다시 눌러 주세요."),
      );
    } finally {
      setSending(false);
    }
  };

  const openIntent = (base: string) => {
    if (!ready) return;
    // 새 창을 누른 그 자리에서 연다 — 기다렸다 열면 팝업 차단에 걸린다. 앱에서는 셸이 X·스레드 앱(없으면 브라우저)으로 연다.
    window.open(`${base}?url=${encodeURIComponent(ready)}`, "_blank", "noopener,noreferrer");
    onClose();
  };

  const copyLink = async () => {
    if (!ready) return;
    setError(null);
    try {
      await copyText(ready);
      setCopied(true);
    } catch (reason) {
      setError(
        isCopyFailedError(reason)
          ? "복사가 막혔어요. 브라우저에서 복사를 허용한 뒤 다시 눌러 주세요."
          : "링크를 복사하지 못했어요.",
      );
    }
  };

  return (
    <div className="fixed inset-0 z-120 flex items-end justify-center hc-modal sm:items-center sm:px-4 sm:py-6">
      <button type="button" aria-hidden="true" tabIndex={-1} onClick={onClose} className="absolute inset-0" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="hc-sheet hc-surface-card relative w-full rounded-t-[28px] border-x-0 border-b-0 border-t px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 shadow-(--hc-card-shadow) sm:max-w-md sm:rounded-3xl sm:border sm:pb-6"
      >
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-[18px] font-extrabold">
            사진 공유하기
          </h2>
          {/* 닫기는 X 글자 하나, 눌리는 면은 44px(components/guest/GuestTrialOverlay.tsx 와 같다). */}
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="-mr-2.5 grid size-11 place-items-center rounded-full text-(--hc-muted) transition hover:text-(--hc-text)"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        {/* 무엇을 보내는지. 받는 사람의 미리보기도 이 사진과 이름이다. */}
        <div className="hc-surface-well mt-3 flex items-center gap-3 rounded-2xl border p-3">
          {thumbnailSrc ? (
            // 서명 주소라 next/image 최적화를 거치지 않는다.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailSrc}
              alt=""
              referrerPolicy="no-referrer"
              className="size-14 shrink-0 rounded-xl object-cover object-top"
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-[12px] text-(--hc-muted)">하루컷</p>
            <p className="truncate text-[15px] font-bold">{title}</p>
          </div>
        </div>

        <ul className="mt-5 flex justify-center gap-x-2" aria-label="보낼 곳">
          {fileTargets ? (
            <>
              <Target label="카카오톡" circle="bg-[#FEE500]" disabled={fileDisabled} onClick={() => void sendPhoto()}>
                <KakaoMark size={26} />
              </Target>
              <Target
                label="인스타그램"
                circle="bg-[radial-gradient(circle_at_30%_107%,#fdf497_0%,#fdf497_5%,#fd5949_45%,#d6249f_60%,#285aeb_90%)] text-white"
                disabled={fileDisabled}
                onClick={() => void sendPhoto()}
              >
                <InstagramMark className="size-6" />
              </Target>
            </>
          ) : null}
          <Target label="스레드" circle="bg-black text-white" disabled={!ready} onClick={() => openIntent(THREADS_INTENT)}>
            <ThreadsMark className="size-6" />
          </Target>
          <Target label="X" circle="bg-black text-white" disabled={!ready} onClick={() => openIntent(X_INTENT)}>
            <XMark className="size-5" />
          </Target>
          <Target
            label={copied ? "복사했어요" : "링크 복사"}
            circle="hc-surface-card border"
            disabled={!ready}
            onClick={() => void copyLink()}
          >
            {copied ? (
              <Check aria-hidden className="size-5" strokeWidth={2.6} />
            ) : (
              <Link2 aria-hidden className="size-5" strokeWidth={2.2} />
            )}
          </Target>
        </ul>

        {error ? (
          <p role="alert" className="mt-3 text-center text-[12px] text-(--hc-danger)">
            {error}
          </p>
        ) : null}
        {link.status === "error" ? (
          <div className="mt-3 flex flex-col items-center gap-2">
            <p role="alert" className="text-center text-[12px] text-(--hc-danger)">
              {link.message}
            </p>
            <RetryButton
              onClick={() => {
                setFetched((prev) => {
                  const next = { ...prev };
                  delete next[mediaId];
                  return next;
                });
                setAttempt((value) => value + 1);
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Target({
  label,
  circle,
  disabled,
  onClick,
  children,
}: {
  label: string;
  circle: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex w-15 flex-col items-center gap-1.5 rounded-2xl py-1 transition disabled:opacity-40"
      >
        {/* 어두운 화면에서도 검은 원의 테두리가 보이게 안쪽에 옅은 선을 둔다. */}
        <span
          className={`grid size-13 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(128,128,128,0.18)] ${circle}`}
        >
          {children}
        </span>
        <span className="whitespace-nowrap text-[12px] font-semibold">{label}</span>
      </button>
    </li>
  );
}
