/**
 * 소셜 로그인 심볼 — 구글 G, 카카오 말풍선, 네이버 N.
 *
 * 경로·크기·색은 전부 `@harucut/shared` 의 social-marks 에서 읽는다. 앱도 같은 값을 읽고,
 * 앱용 PNG 는 scripts/gen-social-marks.mjs 가 같은 경로에서 뽑는다. 왜 그렇게까지 하는지는
 * 그 파일 주석에 적었다 — 예전에는 웹 18/20/22px, 앱 20/26/30px 로 갈라져 있었다.
 *
 * ## 왜 PNG 를 걷어냈나
 *
 * 예전에는 세 개의 PNG 를 `<img>` 로 얹었는데, 셋이 서로 다른 종(種)이었다(실측):
 *
 * | 파일 | 캔버스 | 실제 담긴 것 |
 * |---|---|---|
 * | google-g-logo.png | 80×80 | **알파 채널이 아예 없는** 불투명 흰 사각형 위의 G |
 * | kakao-symbol.png  | 72×72 | 노랑(#FEE500)이 구워진 불투명 사각형 위의 말풍선(잉크 36×34, 캔버스의 50%) |
 * | naver-symbol.png  | 192×192 | 네이버가 배포하는 **아이콘형 버튼 그 자체**(초록 원 배지 + 흰 N) |
 *
 * 그래서 CSS 로 18/20/22px 을 줘도 화면에 실제로 그려진 마크는 16.0 / 10.0 / 22.0px 이었다.
 * 카카오 말풍선이 네이버 배지의 절반도 안 됐다. px 을 다르게 준 것이 격차를 오히려 키웠다.
 *
 * 더 나쁜 것은 나머지 둘이다. 구글 PNG 는 알파가 없어 흰 버튼 위에서만 우연히 성립했고,
 * 네이버 PNG 는 "라벨 없이 단독으로 쓰는 버튼"을 다른 버튼 안에 로고로 밀어 넣은 것이라
 * 네이버 가이드의 "로고 형태를 변경하거나 다른 형태와 조합하는 것은 금지" 조항에 정면으로 걸렸다.
 */
import {
  SOCIAL_MARK_GEOMETRY,
  SOCIAL_MARK_SIZE,
  type SocialProvider,
} from "@harucut/shared";

type MarkProps = {
  /** 마크 한 변의 px. 기본값은 공식 규격과 광학 매칭을 반영한 값이라 보통 넘기지 않는다. */
  size?: number;
  className?: string;
};

function Mark({ provider, size, className }: MarkProps & { provider: SocialProvider }) {
  const { viewBox, paths } = SOCIAL_MARK_GEOMETRY[provider];
  const px = size ?? SOCIAL_MARK_SIZE[provider];

  return (
    <svg
      width={px}
      height={px}
      viewBox={viewBox}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((p) => (
        <path key={p.d} fill={p.fill} d={p.d} />
      ))}
    </svg>
  );
}

/** 구글 G — 4색 고정. 구글은 단색화·색 변경·크기 변경을 금지한다. */
export function GoogleMark(props: MarkProps) {
  return <Mark provider="google" {...props} />;
}

/** 카카오 말풍선 — 규정색은 #000000 하나뿐이라 색을 바깥에서 정할 수 없다. */
export function KakaoMark(props: MarkProps) {
  return <Mark provider="kakao" {...props} />;
}

/**
 * 네이버 N — `currentColor` 라 버튼의 글자색을 그대로 따른다.
 * 초록 배경 위 흰색, 흰 배경 위 네이버 초록 두 조합이 모두 공식 규격이다.
 */
export function NaverMark(props: MarkProps) {
  return <Mark provider="naver" {...props} />;
}
