import type { ReactNode } from "react";
import type { LegalDocument } from "@harucut/shared";
import { AppNav } from "@/components/layout/AppNav";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";

// 약관·개인정보 처리방침 공통 뷰.
// 비로그인 방문자에게는 다른 공개 페이지(랜딩·기능·요금제·FAQ)와 같은 네비·푸터를 쓴다 —
// 예전에는 이 화면만 단독이라 요금제·FAQ로 돌아갈 길도, 사업자 정보 표시도 없었다.
// 로그인 뒤에는 요금제와 같은 방식으로 앱 셸로 갈아탄다(아래 authed).
export function LegalDocumentView({
  document,
  extra,
  authed = false,
}: {
  document: LegalDocument;
  // 약관 본문 아래에 덧붙일 추가 섹션(예: 유료 서비스 요금·혜택 안내).
  extra?: ReactNode;
  /**
   * 로그인 사용자인가. 마이페이지 약관 동의의 「보기」가 이 화면으로 오는데, 거기까지
   * 마케팅 셸을 씌우면 고른 라이트 테마가 딥다크로 뒤집히고 앱으로 돌아갈 네비도 사라진다.
   * 딥다크로 고정하는 것은 **비로그인 공개 무대**뿐이고, 갈림선은 마케팅 네비와 앱 네비가
   * 갈리는 자리다(DESIGN.md 「테마 정책 — 무대는 하나, 앱은 사용자의 것」).
   */
  authed?: boolean;
}) {
  // 셸마다 네비 폭이 다르다 — AppNav 는 max-w-5xl(1024), MarketingNav 는 max-w-290(1160, 기본값).
  // 본문과 푸터가 지금 셸의 폭을 따라가야 좌변이 네비와 맞는다.
  const shellWidth = authed ? "max-w-5xl" : "max-w-290";

  return (
    <main
      // 로그인 셸에서는 하단 고정 탭바(lg 미만)가 본문 끝을 덮는다 — 그만큼 아래를 비운다.
      className={`hc-page-app min-h-dvh text-(--hc-text) ${
        authed ? "pb-22.5 lg:pb-16" : "hc-stage-dark pb-16"
      }`}
    >
      {authed ? <AppNav /> : <MarketingNav />}

      {/* 컨테이너는 nav·푸터와 같은 폭으로 좌변을 맞추고,
          본문 컬럼만 안쪽에서 폭을 제한해 가독성을 지킨다. */}
      <div className={`mx-auto w-full px-7 py-10 lg:py-14 ${shellWidth}`}>
        {/* 읽는 글이라 폭을 묶는다. 820px 에서는 한 줄이 70자를 넘어 눈이 줄을 잃었다. */}
        <div className="flex max-w-170 flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.6px] sm:text-[30px]">
              {document.title}
            </h1>
            <p className="text-[12px] text-(--hc-muted)">
              시행일 {document.effectiveDate}
            </p>
            <p className="text-[14px] leading-[1.7] text-(--hc-muted)">
              {document.intro}
            </p>
          </header>

          <div className="flex flex-col gap-5 rounded-2xl border border-(--hc-border) bg-(--hc-surface) p-5">
            {document.sections.map((section) => (
              <section key={section.heading} className="flex flex-col gap-2">
                <h2 className="text-[15px] font-bold text-(--hc-text)">
                  {section.heading}
                </h2>
                {section.paragraphs?.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="text-[13px] leading-6 text-(--hc-muted)"
                  >
                    {paragraph}
                  </p>
                ))}
                {section.bullets ? (
                  <ul className="flex list-disc flex-col gap-1.5 pl-5">
                    {section.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="text-[13px] leading-6 text-(--hc-muted)"
                      >
                        {bullet}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          {extra}
        </div>
      </div>

      <MarketingFooter width={shellWidth} />

      {/* AppNav 는 lg 이상에서만 보인다 — 좁은 화면에서 앱으로 돌아갈 길은 탭바가 낸다. */}
      {authed ? <MobileTabBar publicShoot /> : null}
    </main>
  );
}
