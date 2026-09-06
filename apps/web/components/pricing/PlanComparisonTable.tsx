import { Check, X } from "lucide-react";
import { PLANS, type PlanId } from "@/constants/plans";

// 기능(행) × 플랜(열) 비교 매트릭스. PLANS의 positional feats를 전치한다.
// note가 있으면 개수·기간 등 텍스트를, 없으면 included에 따라 체크/X를 보여준다.
// 전치는 인덱스에만 의존하므로 플랜별 행 순서가 어긋나면 값이 엉뚱한 행에 붙는다.
// 개발 환경에서 라벨을 대조해 즉시 드러나게 한다(프로덕션에서는 검사하지 않음).
const FEATURE_ROWS = PLANS[0].feats.map((feat, rowIndex) => {
  const label = feat[0];
  return {
    label,
    cells: PLANS.map((plan) => {
      const row = plan.feats[rowIndex];
      if (process.env.NODE_ENV !== "production" && row?.[0] !== label) {
        console.error(
          `[PlanComparisonTable] 피처 행 순서 불일치: ${plan.id}[${rowIndex}]="${row?.[0] ?? "없음"}" (기대: "${label}"). constants/plans.ts의 모든 플랜이 같은 행 순서·라벨을 써야 합니다.`,
        );
      }
      return { included: row?.[1] ?? false, note: row?.[2] };
    }),
  };
});

export function PlanComparisonTable({
  currentPlanId,
}: {
  /** 로그인 사용자의 현재 플랜. 해당 열 헤더에 "현재 플랜"을 붙인다. */
  currentPlanId?: PlanId | null;
}) {
  return (
    // 좌우 거터만큼 빼내 표가 화면 끝까지 스크롤되게 한다.
    // -mx/px 값은 부모(PricingView) 컨테이너 거터와 반드시 같아야 한다.
    <div
      className="-mx-7 overflow-x-auto px-7"
      // 가로 스크롤 영역은 포커스를 받을 수 있어야 키보드로도 표를 끝까지 볼 수 있다.
      tabIndex={0}
      role="region"
      aria-label="요금제 기능 비교표"
    >
      {/* 플랜이 둘이라 520px 이 필요 없다. 393px 폰에서 '베이직' 열이 통째로 화면 밖에 있었다. */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-(--hc-border)">
            <th className="w-[40%] py-3 pr-3 text-left text-[12px] font-medium text-(--hc-muted)">
              기능
            </th>
            {PLANS.map((plan) => (
              <th
                key={plan.id}
                className={`px-2 py-3 text-center sm:px-3 ${
                  plan.hot ? "bg-(--hc-accent-soft-bg)" : ""
                }`}
              >
                <span
                  className={`block text-[14px] font-extrabold ${
                    plan.hot
                      ? "text-(--hc-primary-strong)"
                      : "text-(--hc-text)"
                  }`}
                >
                  {plan.name}
                </span>
                <span className="mt-0.5 block text-[11px] font-medium text-(--hc-muted)">
                  {plan.price === "무료" ? "₩0" : plan.price}
                  {plan.sub ? ` ${plan.sub}` : ""}
                </span>
                {currentPlanId === plan.id ? (
                  <span className="mt-1.5 inline-block rounded-full bg-(--hc-primary) px-2 py-0.5 text-[11px] font-extrabold text-(--hc-primary-contrast)">
                    현재 플랜
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FEATURE_ROWS.map((row) => (
            <tr key={row.label} className="border-b border-(--hc-border)">
              <th
                scope="row"
                className="py-3 pr-3 text-left text-[13px] font-semibold text-(--hc-text)"
              >
                {row.label}
              </th>
              {row.cells.map((cell, i) => (
                <td
                  key={PLANS[i].id}
                  className={`px-2 py-3 text-center align-middle sm:px-3 ${
                    PLANS[i].hot ? "bg-(--hc-accent-soft-bg)" : ""
                  }`}
                >
                  {cell.note ? (
                    <span
                      className={`text-[13px] font-semibold ${
                        cell.included
                          ? "text-(--hc-text)"
                          : "text-(--hc-muted)"
                      }`}
                    >
                      {cell.note}
                    </span>
                  ) : cell.included ? (
                    <Check
                      className="mx-auto h-4 w-4 text-(--hc-primary-strong)"
                      strokeWidth={3}
                    />
                  ) : (
                    <X className="mx-auto h-4 w-4 text-(--hc-muted)" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
