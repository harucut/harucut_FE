"use client";

import { SOCIAL_LABELS, SOCIAL_PROVIDER_ORDER, type SocialProvider } from "@harucut/shared";
import { loginGoogle, loginKakao, loginNaver } from "@/lib/authLogin";
import { GoogleMark, KakaoMark, NaverMark } from "./socialMarks";

type Props = {
  mode?: "login" | "signup";
  redirectTo?: string | null;
};

/**
 * 세 버튼은 색만 다르고 나머지는 전부 같다.
 *
 * 예전에는 구조가 셋 다 달랐다 — 왼쪽 48px 아이콘 레일을 두고, 구글은 거기에 세로 구분선을,
 * 네이버는 더 진한 초록 배경과 흰 구분선을 넣고, 카카오는 레일 배경이 버튼색과 같아 아무것도
 * 보이지 않았다. 라벨은 `flex-1 pr-12` 로 왼쪽 레일 폭을 오른쪽 패딩으로 상쇄해 가운데를
 * 맞추고 있었다. 한 줄에 세 종류의 버튼이 서 있었던 셈이다.
 *
 * 이제 마크와 라벨이 한 묶음으로 가운데 정렬된다. 레일도 구분선도 없다. 이 배치는 세 가이드가
 * 모두 명시적으로 허용한다 — 카카오 "심볼은 좌측 정렬하거나, 레이블과 함께 가운데 정렬할 수
 * 있습니다", 네이버 "로고를 레이블과 함께 가운데 정렬하거나... 가운데 정렬 시 로고와 레이블의
 * 간격은 8px을 유지해 주세요"(그래서 gap-2), 구글 logo_alignment center.
 *
 * 알약 모양은 DESIGN.md L244 "버튼·칩·토글은 전부 border-radius: 9999px" 를 따른 것이다.
 * 예전 rounded-[12px] 는 사이트 전체에서 이 규칙을 어기는 유일한 버튼이었다.
 * (카카오 가이드는 컨테이너 반경을 12px 로 적지만, 형태보다 색·심볼·문구 규정이 훨씬 강하게
 * 못박혀 있고 카카오도 PSD 원본 수정 경로를 공식 제공한다. 이웃 버튼과 모양이 어긋나는 쪽이
 * 사용자에게 더 크게 어색해서 알약을 택했다.)
 */
export function SocialLoginSection({ mode = "login", redirectTo }: Props) {
  const dividerLabel = mode === "signup" ? "간편가입" : "또는";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[13px] text-[color:var(--hc-muted)]">
        <span className="h-px flex-1 bg-[color:var(--hc-border)]" />
        <span>{dividerLabel}</span>
        <span className="h-px flex-1 bg-[color:var(--hc-border)]" />
      </div>

      {/* 순서·문구·마크 크기는 모두 shared 에서 온다. 예전에는 웹이 구글부터, 앱이 카카오부터였다. */}
      <div className="flex flex-col gap-2">
        {SOCIAL_PROVIDER_ORDER.map((provider) => {
          const Mark = MARK[provider];
          return (
            <button
              key={provider}
              type="button"
              onClick={() => START_LOGIN[provider](redirectTo)}
              className={[
                "hc-social-button inline-flex h-12 w-full items-center justify-center rounded-full",
                // gap-2 = 8px — 네이버 "가운데 정렬 시 로고와 레이블의 간격은 8px"
                "gap-2 text-[15px] font-bold tracking-[-0.01em]",
                TONE_CLASS[provider],
              ].join(" ")}
            >
              <Mark />
              {SOCIAL_LABELS[provider]}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const TONE_CLASS: Record<SocialProvider, string> = {
  google: "hc-social-google",
  kakao: "hc-social-kakao",
  naver: "hc-social-naver",
};

const MARK = {
  google: GoogleMark,
  kakao: KakaoMark,
  naver: NaverMark,
} as const;

const START_LOGIN: Record<SocialProvider, (redirectTo?: string | null) => void> = {
  google: loginGoogle,
  kakao: loginKakao,
  naver: loginNaver,
};
