import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/layout/BrandMark";
import { COMPANY, PAYMENTS_ENABLED } from "@/constants/company";

// 공개(마케팅) 페이지 공통 푸터.
// 레이아웃은 전부 좌측 정렬 한 덩어리다 — 고객센터 → 사업자 정보 → 구분선 →
// 카피라이트+로고 → 바로가기 링크 순. 라벨/값을 표로 벌려 놓는 대신
// "값 | 값 | 값" 한 줄로 이어 붙여 세로 길이를 줄인다(전자상거래법 표시 항목은 그대로 전부 노출).
// tone="dark"는 딥다크 고정 무대(랜딩·기능), 기본값은 테마 연동.

const FOOTER_LINKS: { label: string; href: string }[] = [
  { label: "기능", href: "/features" },
  { label: "요금제", href: "/pricing" },
  { label: "자주 묻는 질문", href: "/faq" },
  { label: "이용약관", href: "/terms" },
  { label: "개인정보 처리방침", href: "/privacy" },
];

// "값 | 값 | 값" 한 줄. 좁은 화면에서는 자연스럽게 접히고, 구분자는 낭독에서 제외한다.
function PipeRow({
  items,
  className = "",
}: {
  items: ReactNode[];
  className?: string;
}) {
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <span aria-hidden className="select-none opacity-30">
              |
            </span>
          ) : null}
          <span className="break-keep">{item}</span>
        </Fragment>
      ))}
    </p>
  );
}

export function MarketingFooter({
  tone = "auto",
  width = "max-w-[1160px]",
}: {
  tone?: "auto" | "dark";
  /** 페이지 본문 컨테이너와 좌변을 맞추기 위한 폭. */
  width?: string;
}) {
  const dark = tone === "dark";

  const shell = dark
    ? "border-t border-white/[0.1] bg-[#161617]"
    : "border-t border-[color:var(--hc-border)] bg-[color:var(--hc-surface-soft)]";
  const headText = dark ? "text-white/85" : "text-[color:var(--hc-text)]";
  // 법정 표시 텍스트도 본문과 같은 대비 등급을 쓴다.
  // 이전 값(다크 #6F6F73 / 라이트 --hc-muted-soft)은 12px 일반 텍스트에서
  // 각각 약 3.6:1, 약 2.9:1로 WCAG AA(4.5:1) 미달이었다 —
  // 같은 푸터 안에 통과 줄과 미달 줄이 섞이지 않도록 bodyText로 통일한다.
  const bodyText = dark ? "text-[#8A8A8E]" : "text-[color:var(--hc-muted)]";
  const linkText = dark
    ? "text-[#B3B3B3] hover:text-white"
    : "text-[color:var(--hc-muted)] hover:text-[color:var(--hc-text)]";
  const rule = dark ? "border-white/[0.1]" : "border-[color:var(--hc-border)]";

  return (
    <footer className={shell}>
      <div className={`mx-auto w-full px-7 pb-10 pt-12 ${width}`}>
        <h2 className={`text-[13px] font-bold ${headText}`}>고객센터</h2>
        <PipeRow
          className={`mt-2.5 text-[13px] leading-[1.7] ${bodyText}`}
          items={[
            COMPANY.hours,
            `이메일 ${COMPANY.email}`,
            `전화 문의 ${COMPANY.tel}`,
          ]}
        />

        {/* 전자상거래법 제10조 표시사항 */}
        <div className={`mt-6 space-y-1.5 text-[12px] leading-[1.7] ${bodyText}`}>
          <PipeRow
            items={[
              COMPANY.name,
              `대표자 ${COMPANY.owner}`,
              COMPANY.address,
            ]}
          />
          <PipeRow
            items={[
              `사업자등록번호 ${COMPANY.bizRegNo}`,
              `통신판매업 신고번호 ${COMPANY.mailOrderNo}`,
            ]}
          />
          {/* 결제대행사는 결제를 실제로 받을 때만 적는다. 아직 결제가 닫혀 있는데
              상시 표기하면 사실과 다르다(PAYMENTS_ENABLED 로 켠다). */}
          <PipeRow
            items={[
              ...(PAYMENTS_ENABLED ? [`결제대행 ${COMPANY.paymentAgent}`] : []),
              `호스팅 ${COMPANY.hosting}`,
              `민원담당자 ${COMPANY.complaintOfficer}`,
            ]}
          />
          <p className="break-keep">{COMPANY.liability}</p>
        </div>

        <hr className={`my-7 border-t ${rule}`} />

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-5">
          <span className={`text-[12px] ${bodyText}`}>
            © 2026 {COMPANY.name}. All rights reserved.
          </span>
          <BrandMark href="/" tone={dark ? "light" : undefined} />
        </div>

        <nav
          aria-label="푸터 바로가기"
          className={`mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] font-semibold ${linkText}`}
        >
          {FOOTER_LINKS.map((item, index) => (
            <Fragment key={item.href}>
              {index > 0 ? (
                <span aria-hidden className="select-none opacity-30">
                  |
                </span>
              ) : null}
              <Link
                href={item.href}
                // "기능"처럼 두 글자짜리 라벨은 22px 밖에 안 돼 손가락으로 겨냥이 안 됐다.
                // 밑줄 위치를 지키면서 최소 폭만 확보한다.
                className="min-w-[44px] justify-center text-center underline underline-offset-4 transition"
              >
                {item.label}
              </Link>
            </Fragment>
          ))}
        </nav>
      </div>
    </footer>
  );
}
