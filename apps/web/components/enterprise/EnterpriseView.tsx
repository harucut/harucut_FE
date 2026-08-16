import Link from "next/link";
import { QrCode } from "lucide-react";
import { EnterpriseInquiryForm } from "@/components/enterprise/EnterpriseInquiryForm";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Reveal } from "@/components/ui/Reveal";
import { COMPANY } from "@/constants/company";

// 행사에서 실제로 일어나는 순서. 주최자가 하는 일과 참가자가 하는 일을 갈라서 적는다 —
// "누가 무엇을 하는지"가 섞이면 도입을 검토하는 쪽이 자기 일을 가늠할 수 없다.
const FLOW = [
  {
    who: "주최자",
    title: "행사 프레임을 만들어요",
    body: "행사 이름·로고·색을 얹은 전용 프레임을 만듭니다. 원하는 이미지를 주시면 저희가 대신 만들어 드려요.",
  },
  {
    who: "주최자",
    title: "QR 한 장을 받아요",
    body: "그 행사 전용 촬영 주소를 QR로 만들어 드립니다. 인쇄해서 부스에 세워 두기만 하면 돼요.",
  },
  {
    who: "참가자",
    title: "QR을 찍고 바로 촬영해요",
    body: "앱을 받을 필요도, 가입할 필요도 없어요. 휴대폰 카메라로 QR을 찍으면 행사 이름이 뜬 촬영 화면이 그 행사의 컷 구성으로 열려요.",
  },
  {
    who: "참가자",
    title: "그 자리에서 자기 폰에 저장해요",
    body: "찍은 네 컷을 바로 내려받아요. 줄 서서 인화를 기다리지 않아도 되고, 종이가 모자랄 일도 없어요.",
  },
] as const;

// 부스 대여와 비교했을 때 무엇이 달라지는지. 숫자와 사실만 적는다.
const COMPARISON = [
  ["설치", "기계·부스 반입 없이 QR 한 장", "장비 반입·설치·철수"],
  ["동시 촬영", "참가자 각자의 휴대폰으로 동시에", "부스 수만큼(보통 1~2팀)"],
  ["대기", "줄이 생기지 않아요", "인화 대기열이 생겨요"],
  ["결과물", "각자 원본 화질로 저장", "종이 한 장"],
  ["행사 후", "프레임을 그대로 다시 쓸 수 있어요", "매번 다시 대여"],
] as const;

export function EnterpriseView() {
  return (
    <div className="hc-page-landing min-h-dvh text-[color:var(--hc-text)]">
      <MarketingNav />

      <main className="mx-auto flex w-full max-w-[1160px] flex-col gap-20 px-5 pb-24 pt-10 sm:px-8 lg:gap-28 lg:pt-16">
        {/* 히어로 */}
        <Reveal as="section" className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[color:var(--hc-accent-soft-border)] bg-[color:var(--hc-accent-soft-bg)] px-3.5 py-1.5 text-[12px] font-extrabold text-[color:var(--hc-accent-soft-text)]">
            <QrCode aria-hidden className="h-3.5 w-3.5" />
            행사·팬미팅용
          </span>
          <h1 className="max-w-[15ch] text-[34px] font-extrabold leading-[1.14] tracking-[-1px] sm:text-[46px] lg:text-[58px]">
            부스 대신 QR 한 장으로 네 컷을 찍어요
          </h1>
          <p className="max-w-[52ch] text-[16px] leading-[1.75] text-[color:var(--hc-muted)] lg:text-[18px]">
            행사 전용 프레임을 만들어 드리고, 행사 전용 촬영 QR을 드려요. 참가자는 앱을
            받지도, 가입하지도 않고 자기 휴대폰으로 찍어 그 자리에서 가져갑니다.
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <a
              href="#inquiry"
              className="hc-button-primary inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-extrabold"
            >
              도입 문의하기
            </a>
            <Link
              href="/features"
              className="hc-button-secondary inline-flex h-12 items-center justify-center rounded-full border px-7 text-[15px] font-semibold"
            >
              먼저 서비스 둘러보기
            </Link>
          </div>
        </Reveal>

        {/* 흐름 */}
        <Reveal as="section" className="flex flex-col gap-7">
          <h2 className="text-[24px] font-extrabold tracking-tight lg:text-[30px]">
            행사에서는 이렇게 돌아가요
          </h2>
          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FLOW.map((step, index) => (
              <li
                key={step.title}
                className="hc-surface-card flex flex-col gap-2.5 rounded-[20px] border p-6"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-bold text-[color:var(--hc-primary-strong)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="rounded-full border border-[color:var(--hc-border)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--hc-muted)]">
                    {step.who}
                  </span>
                </div>
                <h3 className="text-[16px] font-extrabold tracking-tight">
                  {step.title}
                </h3>
                <p className="text-[14px] leading-[1.7] text-[color:var(--hc-muted)]">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </Reveal>

        {/* 부스와의 비교 */}
        <Reveal as="section" className="flex flex-col gap-7">
          <h2 className="text-[24px] font-extrabold tracking-tight lg:text-[30px]">
            부스를 빌리는 것과 무엇이 다른가요
          </h2>
          {/*
            좁은 화면에서는 표가 가로로 스크롤된다. 스크롤되는 영역은 키보드로도 들어가
            움직일 수 있어야 한다 — tabIndex 가 없으면 마우스 없이는 오른쪽 열을 볼 수 없다.
          */}
          <div
            tabIndex={0}
            role="region"
            aria-label="하루컷과 부스 대여 비교표"
            className="overflow-x-auto rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--hc-primary)]"
          >
            <table className="w-full min-w-[560px] border-collapse text-left">
              <caption className="sr-only">
                하루컷 행사 프레임과 촬영 부스 대여 비교
              </caption>
              <thead>
                <tr className="border-b border-[color:var(--hc-border)]">
                  <th scope="col" className="w-[110px] py-3 pr-4 text-[12px] font-bold text-[color:var(--hc-muted)]">
                    항목
                  </th>
                  <th scope="col" className="py-3 pr-4 text-[13px] font-extrabold">
                    하루컷
                  </th>
                  <th scope="col" className="py-3 text-[13px] font-bold text-[color:var(--hc-muted)]">
                    부스 대여
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([label, ours, theirs]) => (
                  <tr key={label} className="border-b border-[color:var(--hc-border)]">
                    <th scope="row" className="py-3.5 pr-4 align-top text-[12px] font-bold text-[color:var(--hc-muted)]">
                      {label}
                    </th>
                    <td className="py-3.5 pr-4 align-top text-[14px] leading-[1.6] font-semibold">
                      {ours}
                    </td>
                    <td className="py-3.5 align-top text-[14px] leading-[1.6] text-[color:var(--hc-muted)]">
                      {theirs}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        {/* 지금 어떻게 진행되는지 — 자동화 전이라는 사실을 숨기지 않는다 */}
        <Reveal as="section" className="hc-surface-well flex flex-col gap-3 rounded-[20px] border p-6 lg:p-8">
          <h2 className="text-[18px] font-extrabold tracking-tight">
            지금은 사람이 직접 세팅해 드려요
          </h2>
          <p className="max-w-[62ch] text-[14px] leading-[1.8] text-[color:var(--hc-muted)]">
            셀프 서비스 관리자 화면은 아직 준비 중이에요. 지금은 문의를 주시면 저희가 행사
            프레임과 QR을 직접 만들어 전달해 드립니다. 그래서 행사 규모와 일정에 맞춰
            조율할 수 있고, 대신 준비 기간이 필요해요 —{" "}
            <b className="font-bold text-[color:var(--hc-text)]">
              행사 2주 전까지
            </b>{" "}
            문의해 주시면 여유 있게 준비할 수 있어요.
          </p>
          {/*
            지금 참가자에게 실제로 닿는 범위를 그대로 적는다. 로고·색을 얹은 전용 프레임은
            비회원이 읽을 수 있는 공개 조회가 서버에 생겨야 전달할 수 있다.
            팔기 전에 알려야 하는 조건이라 문의 절 바로 위에 둔다.
          */}
          <p className="max-w-[62ch] text-[13px] leading-[1.8] text-[color:var(--hc-muted)]">
            <b className="font-bold text-[color:var(--hc-text)]">
              지금 QR로 전달되는 범위
            </b>
            는 행사 이름과 컷 구성이에요. 참가자 화면에 행사 이름이 뜨고, 행사에 맞춘 컷
            구성으로 찍어 그 자리에서 내려받습니다. 로고·색을 얹은 전용 프레임까지 참가자에게
            바로 띄우는 건 준비 중이라, 그게 꼭 필요한 행사라면 문의하실 때 말씀해 주세요 —
            일정에 맞출 수 있는지 먼저 알려 드릴게요.
          </p>
          <p className="max-w-[62ch] text-[13px] leading-[1.8] text-[color:var(--hc-muted)]">
            비용은 행사 규모·기간에 따라 달라서 정찰가를 붙이지 않았어요. 아래 내용을 주시면
            견적을 함께 보내 드립니다.
          </p>
        </Reveal>

        {/* 문의 */}
        {/* 히어로의 "도입 문의하기"가 여기로 내려온다. */}
        <section id="inquiry" className="flex scroll-mt-24 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-[24px] font-extrabold tracking-tight lg:text-[30px]">
              도입 문의
            </h2>
            <p className="text-[14px] leading-[1.7] text-[color:var(--hc-muted)]">
              아래를 채우면 메일 본문이 그대로 만들어져요. {COMPANY.hours} 안에
              답장드립니다.
            </p>
          </div>
          <div className="hc-surface-card rounded-[20px] border p-6 lg:p-8">
            <EnterpriseInquiryForm />
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
