import { isMachineName, withoutExtension } from "@/lib/mediaName";

/**
 * 사진 공유 링크(2026-11-16 「받은 사람은 사진만 볼 수 있게 다운로드 할 수 있는」).
 *
 * 링크는 `https://<웹 오리진>/s/<토큰>` 이다. 받은 사람은 그 페이지에서 사진만 보고 저장한다(app/s/[token]/page.tsx).
 * 토큰은 백엔드가 사진마다 하나 준다 — 같은 사진이면 같은 토큰이라 먼저 올린 글의 링크가 살아 있다. 사진을 지우거나 보관
 * 기간이 지나면 링크가 닫힌다(사용자 결정). 계약은 백엔드에 요청한 제안이다 — docs/app-shell-backend-requests.md 의 「사진
 * 공유 링크」.
 *
 * 토큰은 페이지 **경로**에 있다. 카카오·X·메타의 미리보기 수집기가 og:image 를 가져가려면 서버가 주소만 보고 사진을 알아야
 * 해서다(행사 결과 링크 /r 은 fragment 라 미리보기가 없다). 대신 그 페이지는 리퍼러를 보내지 않고 색인도 막는다(next.config.ts).
 */

/** 토큰 모양. 백엔드가 128비트 이상을 base64url 로 준다. 모양이 아니면 백엔드까지 묻지 않는다. */
export function isShareToken(token: string) {
  return /^[A-Za-z0-9_-]{16,128}$/.test(token);
}

/** 받는 사람이 여는 주소. */
export function mediaShareUrl(origin: string, token: string) {
  return `${origin.replace(/\/+$/, "")}/s/${encodeURIComponent(token)}`;
}

/**
 * 공유하는 사진의 이름 — 공유 창의 카드와 받는 사람의 미리보기·탭 제목이 같은 이름이다. 기록 목록(lib/userMediaPreview.ts 의
 * getUserMediaTitle)과 같은 규칙이다: 사람이 붙인 이름은 그대로, 기계가 붙인 이름(harucut_20261115_143000)은 「11월 15일의 네 컷」.
 *
 * 받는 사람 페이지는 서버가 그린다. 서버 시간대에 기대지 않고 한국 시간으로 날짜를 읽는다 — 백엔드의 오프셋 없는 시각은
 * 한국 시간이다(lib/userMediaApi.ts 의 normalizeMedia 와 같은 판단).
 */
export function sharedPhotoTitle(displayName: string, createdAt: string | null, now = new Date()) {
  const name = displayName.trim();
  if (name && !isMachineName(name)) return withoutExtension(name);
  const raw = createdAt?.trim();
  const date = raw ? new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}+09:00`) : null;
  if (!date || Number.isNaN(date.getTime())) return "하루컷 네 컷";
  const kst = (value: Date, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...options }).format(value);
  const sameYear = kst(date, { year: "numeric" }) === kst(now, { year: "numeric" });
  return `${kst(date, sameYear ? { month: "long", day: "numeric" } : { year: "numeric", month: "long", day: "numeric" })}의 네 컷`;
}
