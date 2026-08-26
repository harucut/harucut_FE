"use client";

import type { ReactNode } from "react";

type Props = {
  /** 무엇인지. 값보다 작고 흐리게 — 읽는 순서는 값이 먼저다. */
  label: string;
  /** 지금 값. 없으면 빈 자리 대신 "—"처럼 부르는 쪽에서 채워 넣는다. */
  value: ReactNode;
  /** 값 바로 뒤에 붙는 것. 이 값을 고치는 연필이 여기 온다. */
  inlineAction?: ReactNode;
  /** 줄 오른쪽 끝. 값을 고치는 게 아니라 **다른 일을 하는** 버튼이 여기 온다. */
  action?: ReactNode;
  /** 값만으로 부족할 때 한 줄. */
  hint?: ReactNode;
};

/**
 * 계정 화면의 한 줄.
 *
 * 마이페이지는 **읽는 화면**이지 폼이 아니다. 예전에는 닉네임이 늘 열린 입력창이고
 * 이메일은 못 고치는데도 입력창 모양이라, 화면 전체가 "채워 넣으라"고 말하고 있었다.
 * 정작 지금 내 닉네임이 무엇인지는 그 입력창 안을 들여다봐야 알 수 있었다.
 *
 * 그래서 값을 값으로 둔다. 고치는 길은 두 가지로만 나눈다:
 *
 *   - `inlineAction` — 눈에 보이는 값을 고친다(닉네임 옆 연필). 기록 화면의 이름 고치기와
 *     같은 표시라, 제품 어디서든 연필은 "이 글자를 고친다"는 뜻 하나로 읽힌다.
 *   - `action`     — 값이 보이지 않거나 값을 고치는 게 아닌 일(비밀번호 바꾸기).
 *
 * 이 구분이 흐려지면 줄마다 버튼 모양이 달라지고, 사용자는 줄마다 다시 읽어야 한다.
 */
export function SettingRow({ label, value, inlineAction, action, hint }: Props) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-[color:var(--hc-muted)]">{label}</div>
        <div className="mt-0.5 flex items-center gap-0.5">
          <div className="min-w-0 truncate text-[15px] font-bold">{value}</div>
          {inlineAction}
        </div>
        {hint ? (
          <div className="mt-1 text-[12px] text-[color:var(--hc-muted)]">{hint}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
