import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FramePreview } from "@/components/frame/FramePreview";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Reveal } from "@/components/ui/Reveal";
import { TapeStrip } from "@/components/ui/TapeStrip";
import { DEMO_DECORATED_THEME } from "@/constants/demoTheme";
import { DEMO_PHOTOS } from "@/constants/demoPhotos";

// STUDIO 마케팅 스테이지는 랜딩과 같은 딥다크 고정.
const GREEN = "#1ED760";

// 슬롯 넉 장에 서로 다른 사진이 들어간다(constants/demoPhotos.ts 주석 참고).
const DEMO_IMAGES = DEMO_PHOTOS;

// 스티커 실물 — 39종 중 성격이 다른 것들만 골라 노출(에셋 자체가 브랜드 언어).
const SHOWCASE_STICKERS = [
  "sticker-003",
  "sticker-012",
  "sticker-021",
  "sticker-030",
  "sticker-036",
];

// 부스에서 못 하는 것 = 하루컷이 파는 것. 요금제 유료 행과 1:1로 맞춘 세 축.
const AXES = [
  {
    n: "01",
    title: "부스 앞에 줄 서지 않아요",
    body: "역 앞 부스를 찾아갈 필요도, 뒷사람 눈치를 볼 필요도 없어요. 카메라로 여덟 장을 찍어 마음에 드는 네 컷만 남기면 돼요.",
    booth: "있는 곳까지 찾아가야 하고, 찍는 동안 뒤에 줄이 서요.",
    facts: [
      ["촬영", "카메라로 여덟 장, 그중 네 컷"],
      ["프레임", "직접 만들어 골라 쓰기"],
      ["기기", "휴대폰·PC 어디서든"],
    ],
  },
  {
    n: "02",
    title: "프레임을 직접 만들어요",
    body: "사진이 프레임에 박히면 끝이 아니에요. 그 위에 스티커를 붙이고, 글씨를 얹고, 배경을 깎아내요. 어느 게 위로 올라올지 순서까지 직접 잡을 수 있어요.",
    booth: "정해둔 프레임 중에서만 고를 수 있어요.",
    facts: [
      ["스티커", "39종 · 크기·각도 자유"],
      ["텍스트", "글꼴·색·정렬"],
      ["누끼", "셀 단위 배경 제거"],
      ["레이어", "순서·잠금·숨김"],
    ],
  },
  {
    n: "03",
    title: "그날 사진이 사라지지 않아요",
    body: "뽑은 종이 한 장은 지갑 안에서 색이 바래고, 나중엔 어디 뒀는지도 잊어버려요. 하루컷은 계정에 그대로 쌓여요. 날짜별로 다시 꺼내 보고, 원본 화질로 다시 받을 수 있어요.",
    booth: "종이 한 장뿐이라 잃어버리면 그걸로 끝이에요.",
    facts: [
      ["보관", "Free 3일 · Plus 3달 · Pro 무제한"],
      ["기록", "날짜별로 다시 보기"],
      ["저장", "원본 화질 다시 받기"],
    ],
  },
] as const;

function AxisVisual({ index }: { index: number }) {
  if (index === 0) {
    // 어디서든 — 촬영 진입과 프레임 제작을 모노 라벨 카드로.
    return (
      <div className="flex w-full flex-col gap-3">
        {[
          { t: "카메라로 찍기", d: "여덟 장 촬영 후 네 컷 선택" },
          { t: "프레임 만들기", d: "스티커·텍스트로 나만의 프레임" },
        ].map((row, i) => (
          <div
            key={row.t}
            className="flex items-center gap-5 rounded-[10px] border border-white/[0.08] bg-[#0E0E0F] px-6 py-6"
            style={{ borderColor: i ? undefined : "rgba(30,215,96,.28)" }}
          >
            <span
              aria-hidden
              className="h-[34px] w-[3px] shrink-0 rounded-full"
              style={{
                background: i ? "rgba(255,255,255,.14)" : GREEN,
              }}
            />
            <div className="min-w-0">
              <p className="text-[16px] font-extrabold tracking-[-.3px]">
                {row.t}
              </p>
              <p className="mt-1 text-[13px] text-white/75">{row.d}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (index === 1) {
    // 커스텀 프레임 — 실제 에디터 출력(ThemeExportJson)을 제품 렌더러로 그린다.
    return (
      <div className="flex flex-col items-center gap-7">
        <div className="h-[300px] drop-shadow-2xl sm:h-[360px]">
          <FramePreview
            frameId="grid-4"
            images={DEMO_IMAGES}
            theme={DEMO_DECORATED_THEME}
            borderColor="#141416"
            className="!h-full !w-auto"
          />
        </div>
        {/* 스티커 실물 — 붙이기 전 상태 그대로 흩뿌려 놓는다. */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          {SHOWCASE_STICKERS.map((name, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={name}
              src={`/stickers/${name}.png`}
              alt=""
              aria-hidden
              className="h-11 w-auto object-contain drop-shadow-lg sm:h-12"
              style={{ transform: `rotate(${(i - 2) * 6}deg)` }}
            />
          ))}
        </div>
      </div>
    );
  }

  // 남는 기록 — 보관 기간을 게이지처럼 눕혀서 대비시킨다.
  const rows = [
    { plan: "부스 종이", span: "그날 하루", pct: 4, dim: true },
    { plan: "FREE", span: "3일", pct: 12, dim: true },
    { plan: "PLUS", span: "3달", pct: 46, dim: false },
    { plan: "PRO", span: "무제한", pct: 100, dim: false },
  ];

  return (
    <div className="w-full rounded-[10px] border border-white/[0.08] bg-[#0E0E0F] px-7 py-8">
      <div className="flex flex-col gap-6">
        {rows.map((row) => (
          <div key={row.plan}>
            <div className="mb-2.5 flex items-baseline justify-between">
              <span
                className="font-mono text-[11px] tracking-[2px]"
                style={{
                  color: row.dim ? "rgba(255,255,255,.5)" : GREEN,
                }}
              >
                {row.plan}
              </span>
              <span
                className={`text-[13px] ${row.dim ? "text-white/75" : "font-bold text-white"}`}
              >
                {row.span}
              </span>
            </div>
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${row.pct}%`,
                  background: row.dim ? "rgba(255,255,255,.22)" : GREEN,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeaturesView() {
  return (
    <div className="min-h-dvh bg-[#0B0B0C] text-white">
      <MarketingNav tone="dark" />

      {/* 페이지 헤드 — 랜딩 히어로보다 한 단계 낮은 타입 스케일 */}
      <section className="mx-auto max-w-[1160px] px-7 pb-14 pt-12 sm:pt-16">
        <Reveal>
          <h1 className="text-[40px] font-black leading-[1.16] tracking-[-1.8px] sm:text-[56px] sm:tracking-[-2.6px]">
            하루컷은
            <br />
            <span className="hc-accent-word">무엇이 다를까요?</span>
          </h1>
        </Reveal>
      </section>

      {/* 세 축 — 좌우 번갈아 배치. 카드 그리드 대신 점선 구분의 에디토리얼 레이아웃 */}
      <section className="border-t border-white/[0.1]">
        {AXES.map((axis, i) => (
          <div
            key={axis.n}
            className={i ? "border-t border-dashed border-white/[0.12]" : ""}
          >
            <div className="mx-auto max-w-[1160px] px-7 py-[72px]">
              <Reveal>
                <div
                  className={`grid items-center gap-12 lg:grid-cols-2 lg:gap-20 ${
                    i % 2 ? "lg:[&>*:first-child]:order-2" : ""
                  }`}
                >
                  <div>
                    <span
                      className="mb-5 block font-mono text-[58px] font-extrabold leading-[.8] tracking-[-3px]"
                      style={{ color: GREEN }}
                    >
                      {axis.n}
                    </span>

                    <h2 className="text-[30px] font-extrabold leading-[1.25] tracking-[-.8px] sm:text-[34px]">
                      {axis.title}
                    </h2>
                    <p className="mt-5 max-w-[460px] text-[15px] leading-[1.75] text-white/75">
                      {axis.body}
                    </p>

                    {/* 부스와의 대비 — 취소선 대신 죽은 색으로 눌러 놓는다 */}
                    <p className="mt-6 max-w-[460px] border-l border-white/[0.1] pl-4 text-[13px] leading-[1.65] text-white/70">
                      <span className="mr-2 font-bold text-white/85">
                        부스는
                      </span>
                      {axis.booth}
                    </p>

                    <dl className="mt-8 flex flex-col gap-3 border-t border-white/[0.08] pt-6">
                      {axis.facts.map(([k, v]) => (
                        <div key={k} className="flex items-baseline gap-5">
                          <dt className="w-[56px] shrink-0 font-mono text-[11px] tracking-[1.2px] text-white/75">
                            {k}
                          </dt>
                          <dd className="text-[14px] text-white/70">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  <div className="flex justify-center">
                    <AxisVisual index={i} />
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        ))}
      </section>

      {/* 요금제로 잇기 */}
      <section className="border-y border-white/[0.1] bg-black">
        <TapeStrip />
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-6 px-7 py-14">
          <div>
            <h2 className="text-[24px] font-extrabold tracking-[-.7px]">
              어디까지 무료인지 먼저 볼까요?
            </h2>
            <p className="mt-2.5 text-[15px] text-white/75">
              촬영과 기본 프레임은 가입만 해도 무료예요. 커스텀 프레임과 보관
              기간이 플랜에 따라 달라집니다.
            </p>
          </div>
          <Link
            href="/pricing"
            className="hc-button-secondary inline-flex h-12 shrink-0 items-center gap-2 rounded-full border px-7 text-[15px] font-semibold"
          >
            요금제 보기 <ArrowRight className="h-[17px] w-[17px]" />
          </Link>
        </div>
        <TapeStrip />
      </section>

      {/* CTA — 랜딩과 같은 그린 블록 */}
      <section className="mx-auto max-w-[1160px] px-7 pb-[90px] pt-14">
        <div
          className="flex flex-wrap items-center justify-between gap-5 rounded-3xl px-10 py-9"
          style={{ background: GREEN }}
        >
          <h2
            className="text-[30px] font-extrabold tracking-[-1px]"
            style={{ color: "#06140A" }}
          >
            오늘 하루, 네 컷으로 남겨볼까요?
          </h2>
          <Link
            href="/login"
            className="hc-button-neutral inline-flex h-12 shrink-0 items-center gap-2 rounded-full px-7 text-[15px] font-extrabold"
          >
            시작하기 <ArrowRight className="h-[19px] w-[19px]" />
          </Link>
        </div>
      </section>

      <MarketingFooter tone="dark" />
    </div>
  );
}
