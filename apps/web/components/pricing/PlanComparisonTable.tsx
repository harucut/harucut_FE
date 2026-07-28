import { Check, X } from "lucide-react";
import { PLANS } from "@/constants/plans";

// 기능(행) × 플랜(열) 비교 매트릭스. PLANS의 positional feats를 전치한다.
// note가 있으면 개수·기간·"미정" 등 텍스트를, 없으면 included에 따라 체크/X를 보여준다.
const FEATURE_ROWS = PLANS[0].feats.map((feat, rowIndex) => ({
  label: feat[0],
  cells: PLANS.map((plan) => {
    const [, included, note] = plan.feats[rowIndex];
    return { included, note };
  }),
}));

export function PlanComparisonTable() {
  return (
    // 좌우 거터만큼 빼내 표가 화면 끝까지 스크롤되게 한다.
    // -mx/px 값은 부모(PricingView) 컨테이너 거터와 반드시 같아야 한다.
    <div className="-mx-7 overflow-x-auto px-7">
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr className="border-b border-[color:var(--hc-border)]">
            <th className="py-3 pr-3 text-left text-[12px] font-medium text-[color:var(--hc-muted)]">
              기능
            </th>
            {PLANS.map((plan) => (
              <th
                key={plan.id}
                className={`px-3 py-3 text-center ${
                  plan.hot ? "bg-[color:var(--hc-accent-soft-bg)]" : ""
                }`}
              >
                <span
                  className={`block text-[14px] font-extrabold ${
                    plan.hot
                      ? "text-[color:var(--hc-primary)]"
                      : "text-[color:var(--hc-text)]"
                  }`}
                >
                  {plan.name}
                </span>
                <span className="mt-0.5 block text-[11px] font-medium text-[color:var(--hc-muted)]">
                  {plan.price}
                  {plan.sub ? ` ${plan.sub}` : ""}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FEATURE_ROWS.map((row) => (
            <tr key={row.label} className="border-b border-[color:var(--hc-border)]">
              <th
                scope="row"
                className="py-3 pr-3 text-left text-[13px] font-semibold text-[color:var(--hc-text)]"
              >
                {row.label}
              </th>
              {row.cells.map((cell, i) => (
                <td
                  key={PLANS[i].id}
                  className={`px-3 py-3 text-center align-middle ${
                    PLANS[i].hot ? "bg-[color:var(--hc-accent-soft-bg)]" : ""
                  }`}
                >
                  {cell.note ? (
                    <span
                      className={`text-[13px] font-semibold ${
                        cell.included
                          ? "text-[color:var(--hc-text)]"
                          : "text-[color:var(--hc-muted)]"
                      }`}
                    >
                      {cell.note}
                    </span>
                  ) : cell.included ? (
                    <Check
                      className="mx-auto h-4 w-4 text-[color:var(--hc-primary)]"
                      strokeWidth={3}
                    />
                  ) : (
                    <X className="mx-auto h-4 w-4 text-[color:var(--hc-muted)]" />
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
