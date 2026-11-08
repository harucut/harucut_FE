import Image from "next/image";
import Link from "next/link";
import { EnterpriseInquiryForm } from "@/components/enterprise/EnterpriseInquiryForm";
import { FramePreview } from "@/components/frame/FramePreview";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { COMPANY } from "@/constants/company";
import { DEMO_WEDDING_PHOTOS } from "@/constants/demoPhotos";
import { DEMO_WEDDING_THEME } from "@/constants/demoTheme";

// 행사에서 실제로 일어나는 순서. 주최자가 하는 일과 참가자가 하는 일을 갈라서 적는다 —
// "누가 무엇을 하는지"가 섞이면 도입을 검토하는 쪽이 자기 일을 가늠할 수 없다.
// 번호는 두 줄기를 이어서 센다. 주최자가 끝나야 참가자가 시작하니 순서가 곧 정보다.
const HOST_STEPS: FlowStepCopy[] = [
  {
    n: 1,
    title: "행사를 만들고 꾸며요",
    body: "Studio 에서 행사 이름, 참가 방식, 제공할 프레임, 참가 동의 문구, 행사 화면의 색과 로고를 정하고 게시해요.",
    // 조건을 1000px 아래에 두면 팔고 난 뒤에 읽힌다. 약속하는 자리에서 바로 말한다.
    note: "게시하려면 이용권이 필요해요. 문의를 주시면 계약에 맞춰 열어 드려요.",
  },
  {
    n: 2,
    title: "참가 링크·QR과 현장 부스를 준비해요",
    body: "게시하면 그 행사의 참가 링크와 QR이 생겨요. 현장에 태블릿을 두면 연결 코드 하나로 부스 기기가 돼요.",
  },
];

const GUEST_STEPS: FlowStepCopy[] = [
  {
    n: 3,
    title: "자기 휴대폰이나 부스로 바로 찍어요",
    body: "앱을 받을 필요도, 가입할 필요도 없어요. QR을 찍거나 부스 앞에 서서 동의하면 그 행사의 프레임으로 촬영 화면이 열려요.",
  },
  {
    n: 4,
    title: "결과 링크로 가져가요",
    body: "완성된 네 컷을 바로 내려받고, 개인 결과 링크로 보관 기간 안에 다시 받을 수 있어요. 줄 서서 인화를 기다리지 않아도 돼요.",
  },
];

type FlowStepCopy = { n: number; title: string; body: string; note?: string };

function FlowStep({ n, title, body, note }: FlowStepCopy) {
  return (
    <li className="flex flex-col gap-2">
      <span aria-hidden className="font-mono text-[12px] font-bold tabular-nums text-(--hc-muted)">
        {String(n).padStart(2, "0")}
      </span>
      <h4 className="break-keep text-[16px] font-extrabold tracking-tight">{title}</h4>
      <p className="break-keep text-[14px] leading-[1.7] text-(--hc-muted)">{body}</p>
      {note ? <p className="break-keep text-[12px] leading-[1.6] text-(--hc-muted)">{note}</p> : null}
    </li>
  );
}

// 부스 대여와 비교했을 때 무엇이 달라지는지. 숫자와 사실만 적는다.
const COMPARISON = [
  ["설치", "QR 한 장, 부스가 필요하면 태블릿만", "장비 반입·설치·철수"],
  ["동시 촬영", "참가자 각자의 휴대폰으로 동시에", "부스 수만큼(보통 1~2팀)"],
  ["대기", "줄이 생기지 않아요", "인화 대기열이 생겨요"],
  ["결과물", "각자 원본 화질로 저장, 결과 링크로 다시 받기", "종이 한 장"],
  ["주최자 사진", "Studio 사진함에서 보고 한꺼번에 받기", "현장 인화본만"],
  ["행사 후", "행사를 복제해 다음 행사에 다시 써요", "매번 다시 대여"],
] as const;

export function EnterpriseView() {
  return (
    <div className="hc-stage-dark hc-page-landing min-h-dvh text-(--hc-text)">
      <MarketingNav />

      <main className="mx-auto flex w-full max-w-290 flex-col gap-20 px-5 pb-24 pt-10 sm:px-8 lg:gap-28 lg:pt-16">
        {/* 히어로 */}
        <section className="grid min-w-0 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14">
          <div className="flex min-w-0 flex-col gap-6">
            {/*
              DESIGN.md 의 display-sm. 34→58px 사이를 매끈하게 오간다.
              브레이크포인트마다 34/46/58 로 계단을 밟던 것을 클램프 하나로 바꿨다 —
              중간 폭(예: 900px)에서 글자만 덩그러니 작게 남던 구간이 사라진다.
            */}
            <h1 className="max-w-[15ch] break-keep text-[clamp(2.125rem,5vw,3.625rem)] font-extrabold leading-[1.14] tracking-[-1px]">
              링크와 부스로 행사 네 컷을 운영해요
            </h1>
            <p className="max-w-[52ch] break-keep text-[16px] leading-[1.75] text-(--hc-muted) lg:text-[18px]">
              주최자는 Studio 에서 행사를 만들어 게시해요. 참가자는 앱을 받지도, 가입하지도
              않고 자기 휴대폰이나 현장 부스로 찍어 결과 링크로 가져갑니다.
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
          </div>
          <figure className="min-w-0">
            <div className="relative">
              <div className="relative aspect-3/2 overflow-hidden rounded-[28px]">
                <Image
                  src="/demo/booth-wedding.webp"
                  alt="결혼식 로비에 세워 둔 태블릿 부스 앞에서 두 사람이 사진을 찍는 모습"
                  fill
                  priority
                  sizes="(min-width: 1160px) 610px, (min-width: 1024px) 53vw, 100vw"
                  className="object-cover"
                />
              </div>
              {/* 부스에서 나오는 결과물. 왼쪽 아래에 걸쳐 얼굴과 태블릿을 가리지 않는다. */}
              <div className="absolute -bottom-7 -left-2 h-[60%] -rotate-[4deg] drop-shadow-2xl sm:left-3 lg:-left-8">
                <FramePreview
                  frameId="grid-4"
                  images={DEMO_WEDDING_PHOTOS}
                  theme={DEMO_WEDDING_THEME}
                  borderColor="#fafaf7"
                  imageLoading="eager"
                  className="h-full! w-auto!"
                />
              </div>
            </div>
          </figure>
        </section>

        {/* 흐름 */}
        <section className="flex min-w-0 flex-col gap-8">
          <h2 className="text-[24px] font-extrabold tracking-tight lg:text-[30px]">
            행사에서는 이렇게 돌아가요
          </h2>
          <div className="flex flex-col">
            <div className="grid gap-6 border-t border-(--hc-border) py-8 lg:grid-cols-[6rem_minmax(0,1fr)] lg:gap-8">
              <h3 className="text-[15px] font-extrabold">주최자</h3>
              <ol className="grid gap-8 sm:grid-cols-2">
                {HOST_STEPS.map((step) => (
                  <FlowStep key={step.n} {...step} />
                ))}
              </ol>
            </div>
            <div className="grid gap-6 border-t border-(--hc-border) pt-8 lg:grid-cols-[6rem_minmax(0,1fr)] lg:gap-8">
              <h3 className="text-[15px] font-extrabold">참가자</h3>
              <div className="grid items-center gap-8 sm:grid-cols-2">
                <ol start={3} className="flex flex-col gap-8 sm:order-2">
                  {GUEST_STEPS.map((step) => (
                    <FlowStep key={step.n} {...step} />
                  ))}
                </ol>
                <figure className="min-w-0 sm:order-1">
                  <div className="relative aspect-3/2 overflow-hidden rounded-[20px]">
                    <Image
                      src="/demo/guest-selfie.webp"
                      alt="행사장에서 두 참가자가 휴대폰을 높이 들고 함께 사진을 찍는 뒷모습"
                      fill
                      sizes="(min-width: 1160px) 500px, (min-width: 640px) 46vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                </figure>
              </div>
            </div>
          </div>
        </section>

        {/* 부스와의 비교 */}
        <section className="min-w-0 flex flex-col gap-7">
          <h2 className="text-[24px] font-extrabold tracking-tight lg:text-[30px]">
            부스를 빌리는 것과 무엇이 다른가요
          </h2>
          {/*
            좁은 화면(sm 미만)에서는 표를 쓰지 않는다.

            390px 에서 컨테이너는 350px 인데 표는 최소 560px 이라 "부스 대여" 열이 통째로
            화면 밖으로 나갔다. 스크롤된다는 시각 힌트도 없어서, 비교하라고 만든 자리가
            한쪽만 보여 주고 있었다. 두 값이 세로로 붙어 있어야 비교가 된다.
          */}
          <ul className="flex flex-col gap-3 sm:hidden">
            {COMPARISON.map(([label, ours, theirs]) => (
              <li
                key={label}
                className="hc-surface-card rounded-2xl border p-4"
              >
                <p className="text-[12px] font-bold text-(--hc-muted)">
                  {label}
                </p>
                <p className="mt-2 text-[14px] font-semibold leading-[1.6]">
                  하루컷 · {ours}
                </p>
                <p className="mt-1 text-[13px] leading-[1.6] text-(--hc-muted)">
                  부스 대여 · {theirs}
                </p>
              </li>
            ))}
          </ul>

          {/*
            sm 이상에서만 표. 그래도 좁아지면 가로 스크롤이 생기므로, 스크롤 영역은
            키보드로도 들어가 움직일 수 있어야 한다(tabIndex 가 없으면 마우스 없이는
            오른쪽 열을 못 본다).
          */}
          <div
            tabIndex={0}
            role="region"
            aria-label="하루컷과 부스 대여 비교표"
            className="hidden overflow-x-auto rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--hc-primary) sm:block"
          >
            <table className="w-full min-w-140 border-collapse text-left">
              <caption className="sr-only">
                하루컷 행사 프레임과 촬영 부스 대여 비교
              </caption>
              <thead>
                <tr className="border-b border-(--hc-border)">
                  <th scope="col" className="w-27.5 py-3 pr-4 text-[12px] font-bold text-(--hc-muted)">
                    항목
                  </th>
                  <th scope="col" className="py-3 pr-4 text-[13px] font-extrabold">
                    하루컷
                  </th>
                  <th scope="col" className="py-3 text-[13px] font-bold text-(--hc-muted)">
                    부스 대여
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([label, ours, theirs]) => (
                  <tr key={label} className="border-b border-(--hc-border)">
                    <th scope="row" className="py-3.5 pr-4 align-top text-[12px] font-bold text-(--hc-muted)">
                      {label}
                    </th>
                    <td className="py-3.5 pr-4 align-top text-[14px] leading-[1.6] font-semibold">
                      {ours}
                    </td>
                    <td className="py-3.5 align-top text-[14px] leading-[1.6] text-(--hc-muted)">
                      {theirs}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 도입 절차 — 이용권은 계약으로 열고, 그 뒤 운영은 주최자가 Studio 에서 직접 한다 */}
        <section className="min-w-0 hc-surface-well flex flex-col gap-3 rounded-[20px] border p-6 lg:p-8">
          <h2 className="text-[18px] font-extrabold tracking-tight">
            도입은 이렇게 진행돼요
          </h2>
          <p className="max-w-[62ch] text-[14px] leading-[1.8] text-(--hc-muted)">
            문의를 남기면 행사 규모와 기간에 맞춰 계약하고, 촬영 한도·보관 기간·쓸 수 있는 기능을
            담은 이용권을 열어 드려요. 그다음부터는 Studio 에서 직접 행사를 만들고 게시하고
            운영해요. 함께 운영할 사람을 초대하고, 신랑신부처럼 사진만 볼 분에게는 그 행사 사진
            권한만 줄 수 있어요. 첫 행사라면 세팅을 함께 도와 드려요.{" "}
            <b className="font-bold text-(--hc-text)">
              행사 2주 전까지
            </b>{" "}
            문의해 주시면 여유 있게 준비할 수 있어요.
          </p>
          {/*
            팔기 전에 알려야 하는 조건이라 문의 절 바로 위에 둔다. 화이트라벨은 이용권 기능이고(게시 검사가 막는다),
            촬영 한도를 다 쓰면 참가자 화면이 촬영 마감으로 바뀐다(ENT-002).
          */}
          <p className="max-w-[62ch] text-[13px] leading-[1.8] text-(--hc-muted)">
            <b className="font-bold text-(--hc-text)">미리 알아 두실 것.</b> 행사 화면에서 하루컷
            표시를 숨기려면 화이트라벨 이용권이 필요해요. 촬영 한도를 다 쓰면 참가자 화면이 촬영
            마감으로 바뀌니, 한도는 예상 참가 인원보다 넉넉히 잡아 주세요.
          </p>
          <p className="max-w-[62ch] text-[13px] leading-[1.8] text-(--hc-muted)">
            비용은 행사 규모·기간에 따라 달라서 정찰가를 붙이지 않았어요. 아래 내용을 주시면
            견적을 함께 보내 드립니다.
          </p>
        </section>

        {/* 문의 */}
        {/* 히어로의 "도입 문의하기"가 여기로 내려온다. */}
        <section id="inquiry" className="flex scroll-mt-24 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-[24px] font-extrabold tracking-tight lg:text-[30px]">
              도입 문의
            </h2>
            <p className="text-[14px] leading-[1.7] text-(--hc-muted)">
              아래를 남기면 담당자가 확인하고 {COMPANY.hours} 안에 연락드려요.
              메일로 보내셔도 돼요.
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
