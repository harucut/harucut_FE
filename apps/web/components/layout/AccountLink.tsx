import Link from "next/link";
import { User } from "lucide-react";

/**
 * 계정(MY)으로 가는 사람 아이콘 — 폰 하단 탭의 「MY」와 같은 아이콘(2026-11-14).
 *
 * 개인 화면의 상단 메뉴와 행사 운영 화면이 같이 쓴다. 행사 운영에서 개인 화면으로 건너가는 길은 이것
 * 하나다(개인 화면에서 행사 운영으로 가는 길은 MY 의 「행사 운영」 하나). 로그아웃·비밀번호처럼 계정에
 * 딸린 일은 같은 계정이라 MY 에 한 벌만 둔다.
 */
export function AccountLink() {
  return (
    <Link
      href="/mypage"
      aria-label="마이페이지"
      className="grid h-10.5 w-10.5 place-items-center rounded-full border border-(--hc-border) bg-(--hc-surface) text-(--hc-text) transition hover:border-(--hc-border-strong)"
    >
      <User aria-hidden className="h-5 w-5" />
    </Link>
  );
}
