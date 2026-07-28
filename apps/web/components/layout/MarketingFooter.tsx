import Link from "next/link";
import { BrandMark } from "@/components/layout/BrandMark";
import { COMPANY } from "@/constants/company";

// 공개(마케팅) 페이지 공통 푸터.
// 랜딩만 브랜드+법인 정보 전체를 갖고 요금제·FAQ는 "·"로 이은 링크 한 줄이라
// 페이지마다 마감이 달라지던 것을 하나로 합쳤다. 전자상거래법 표시 항목도
// 세 페이지 모두에서 동일하게 노출된다.
// tone="dark"는 딥다크 고정 무대(랜딩·기능), 기본값은 테마 연동.
const FOOTER_COLS: {
  title: string;
  items: { label: string; href?: string }[];
}[] = [
  {
    title: "바로가기",
    items: [
      { label: "기능", href: "/features" },
      { label: "요금제", href: "/pricing" },
      { label: "자주 묻는 질문", href: "/faq" },
    ],
  },
  {
    title: "정책",
    items: [
      { label: "이용약관", href: "/terms" },
      { label: "개인정보 처리방침", href: "/privacy" },
    ],
  },
];

// 전자상거래법 제10조 표시사항. 값은 constants/company.ts 단일 소스에서만 온다.
// 고객센터·운영시간까지 여기서 한 벌로 전부 노출한다(위 브랜드 영역과 중복시키지 않는다).
const LEGAL_ROWS: [string, string][] = [
  ["상호", COMPANY.name],
  ["대표자", COMPANY.owner],
  ["사업자등록번호", COMPANY.bizRegNo],
  ["통신판매업 신고번호", COMPANY.mailOrderNo],
  ["주소", COMPANY.address],
  ["고객센터", `${COMPANY.email} · ${COMPANY.tel}`],
  ["운영시간", COMPANY.hours],
  ["결제대행", COMPANY.paymentAgent],
  ["호스팅", COMPANY.hosting],
];

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
  const bodyText = dark ? "text-[#6F6F73]" : "text-[color:var(--hc-muted-soft)]";
  const linkText = dark
    ? "text-[#B3B3B3] hover:text-white"
    : "text-[color:var(--hc-muted)] hover:text-[color:var(--hc-text)]";
  const rule = dark ? "border-white/[0.1]" : "border-[color:var(--hc-border)]";

  return (
    <footer className={shell}>
      <div
        className={`mx-auto flex w-full flex-wrap justify-between gap-8 px-7 pb-10 pt-12 ${width}`}
      >
        <div className="max-w-[300px]">
          <BrandMark href="/" tone={dark ? "light" : undefined} />
          <p className={`mt-3.5 text-[13px] leading-[1.6] ${bodyText}`}>
            온라인 인생네컷 서비스.
            <br />
            하루를 네 컷으로 남기세요.
          </p>
        </div>

        <div className="flex flex-wrap gap-14">
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <h6 className="mb-3.5 text-[13px] font-extrabold tracking-[.3px]">
                {col.title}
              </h6>
              {col.items.map((it) =>
                it.href ? (
                  <Link
                    key={it.label}
                    href={it.href}
                    className={`mb-2.5 block text-[13.5px] transition ${linkText}`}
                  >
                    {it.label}
                  </Link>
                ) : (
                  <span
                    key={it.label}
                    className={`mb-2.5 block text-[13.5px] ${bodyText}`}
                  >
                    {it.label}
                  </span>
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 전자상거래법 표시사항 — 라벨/값을 dl로 끊어 한 덩어리 텍스트가 되지 않게 한다. */}
      <div className={`border-t ${rule}`}>
        <div className={`mx-auto w-full px-7 py-6 ${width}`}>
          {/* 라벨 위 / 값 아래로 쌓아 라벨 길이(예: 통신판매업 신고번호)에 상관없이 정렬이 유지된다. */}
          <dl
            className={`grid gap-x-10 gap-y-4 text-[11.5px] leading-[1.6] sm:grid-cols-2 lg:grid-cols-3 ${bodyText}`}
          >
            {LEGAL_ROWS.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[10.5px] tracking-[0.4px] opacity-55">
                  {label}
                </dt>
                <dd className="mt-1 break-keep">{value}</dd>
              </div>
            ))}
          </dl>

          <p
            className={`mt-5 border-t pt-4 text-[11px] leading-[1.7] ${rule} ${bodyText}`}
          >
            {COMPANY.liability}
            <br />
            민원담당자: {COMPANY.complaintOfficer} ({COMPANY.tel} ·{" "}
            {COMPANY.email})
          </p>

          <div
            className={`mt-4 flex justify-between font-mono text-[11px] ${bodyText}`}
          >
            <span>© 2026 {COMPANY.name}</span>
            <span>harucut.com</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
