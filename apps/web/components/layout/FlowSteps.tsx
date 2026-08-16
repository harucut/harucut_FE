type FlowStepsProps = {
  steps: readonly string[];
  /** 지금 단계(0부터). 범위를 벗어나면 아무것도 그리지 않는다. */
  current: number;
  className?: string;
};

/**
 * 여러 화면에 걸친 흐름에서 "지금 몇 번째인지"를 보여준다.
 *
 * 촬영은 프레임 고르기 → 촬영 → 사진 고르기 → 완성까지 네 화면을 지난다. 그런데 어느
 * 화면에도 전체가 몇 단계인지, 지금이 어디인지가 없어서 매번 "이게 마지막인가?"를
 * 짐작해야 했다. 남은 단계를 알면 중간에 그만둘지도 스스로 정할 수 있다.
 *
 * 목록으로 표시해 스크린리더가 "3개 중 2번째"를 그대로 읽게 하고, 현재 단계는
 * aria-current="step" 으로 알린다.
 */
export function FlowSteps({ steps, current, className }: FlowStepsProps) {
  if (current < 0 || current >= steps.length) return null;

  return (
    <ol
      aria-label={`진행 단계 ${current + 1} / ${steps.length}`}
      className={[
        "flex items-center gap-1.5 text-[11px] font-semibold",
        className ?? "",
      ].join(" ")}
    >
      {steps.map((label, index) => {
        const isCurrent = index === current;
        const isDone = index < current;

        return (
          <li
            key={label}
            aria-current={isCurrent ? "step" : undefined}
            className="flex min-w-0 items-center gap-1.5"
          >
            <span
              className={[
                "inline-flex h-6 items-center rounded-full px-2.5 tabular-nums transition",
                // 지나간 단계와 남은 단계 모두 --hc-muted 로 둔다. 더 옅은 -muted-soft 는
                // 라이트 테마에서 2.69:1 이라 읽히지 않는다(실측). 구분은 번호 대 체크로 한다.
                isCurrent
                  ? "bg-[color:var(--hc-accent-soft-bg)] text-[color:var(--hc-accent-soft-text)]"
                  : "text-[color:var(--hc-muted)]",
              ].join(" ")}
            >
              {/*
                번호·체크와 이름을 한 텍스트 노드로 둔다. 기호만 든 요소를 따로 감싸면
                axe 가 "글자인지 판별 불가"로 내려 대비 검사에서 통째로 빠진다.
                지난 단계는 번호 대신 체크로 줄여, 지금 단계가 눈에 먼저 들어오게 한다.
              */}
              <span className="truncate">{`${isDone ? "✓" : index + 1} ${label}`}</span>
            </span>
            {index < steps.length - 1 ? (
              <span
                aria-hidden
                className="h-px w-3 shrink-0 bg-[color:var(--hc-border)]"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
