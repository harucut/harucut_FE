/**
 * 소셜 로그인 심볼과 브랜드 색 — 웹과 앱이 같은 값을 본다.
 *
 * 왜 shared 로 올렸나: 예전에는 웹과 앱이 같은 PNG 를 각자 다른 크기로 그리고 있었다.
 * 로고는 웹 18/20/22px, 앱 20/26/30px. 네이버 버튼색은 웹 #007A3D, 앱 #03C75A — 같은 제품의
 * 같은 버튼이 플랫폼마다 다른 크기, 다른 색이었다. 값을 한 곳에서 읽게 만든다.
 * (그 뒤 ADR-0003 으로 앱이 웹을 그대로 띄우게 되어, 지금 이 값을 그리는 곳은 웹 하나다.)
 *
 * 여기 있는 것은 **각 사의 규격**이지 우리 취향이 아니다. 바꾸려면 각 사 가이드를 먼저 볼 것.
 *  - 카카오 https://developers.kakao.com/docs/ko/kakaologin/design-guide
 *  - 네이버 https://developers.naver.com/docs/login/bi/bi.md
 *  - 구글   https://developers.google.com/identity/branding-guidelines
 */

export type SocialProvider = 'kakao' | 'naver' | 'google';

/** 화면에 그릴 순서. 웹·앱이 같다(예전에는 웹이 구글부터, 앱이 카카오부터였다). */
export const SOCIAL_PROVIDER_ORDER: SocialProvider[] = ['kakao', 'naver', 'google'];

/**
 * 마크 한 변의 px.
 *
 * 같은 px 이면 같아 보이지 않는다 — 밀도가 구글 0.51 / 카카오 0.69 / 네이버 0.80 이라
 * 속이 꽉 찬 카카오 말풍선이 가장 무겁게 보인다. 마크를 가우시안으로 뭉갠 뒤 남는 덩어리의
 * 유효 지름(2√(질량/π))이 같아지는 값을 찾았고, σ 를 1.0~2.0px 로 바꿔도 결과가 같았다.
 *
 *   구글 20px → 16.00   카카오 18px → 16.08 (+0.4%)   네이버 16px → 16.16 (+1.0%)
 *
 * 세 값이 전부 공식 규격과 맞물린다. 구글 20px 은 공식 에셋 실측치(40px 버튼 안의 G 가 정확히
 * 20×20), 네이버 16px 은 완성형 최소 규정이자 공식 H48 가운데정렬 에셋의 실측 N 크기다.
 * 카카오만 수치 규정이 없는데, 대신 "심볼은 타사의 심볼과 동등한 시각적 비중을 가져야 합니다"
 * 라고 적혀 있어 광학 매칭이 곧 규정 준수가 된다.
 */
export const SOCIAL_MARK_SIZE: Record<SocialProvider, number> = {
  google: 20,
  kakao: 18,
  naver: 16,
};

export type MarkPath = { d: string; fill: string };

export type MarkGeometry = {
  viewBox: string;
  paths: MarkPath[];
};

/**
 * 심볼 경로. 손으로 그린 것이 아니라 각 사 공식 심볼이고, 기존 공식 PNG 에서 잉크만 뽑은
 * 마스크와 픽셀로 대조해 형태 일치도(IoU)를 확인했다 — 구글 94.1%, 카카오 94.9%, 네이버 98.5%.
 * (남는 차이는 안티에일리어싱 가장자리다.)
 *
 * `fill: 'currentColor'` 는 네이버뿐이다. 네이버 N 은 초록 배경 위에서 흰색, 흰 배경 위에서
 * 초록인 두 조합이 모두 공식 규격이라 색을 바깥에서 정한다. 구글·카카오는 색 변경이 금지라 박아 둔다.
 */
export const SOCIAL_MARK_GEOMETRY: Record<SocialProvider, MarkGeometry> = {
  google: {
    viewBox: '0 0 48 48',
    paths: [
      {
        fill: '#EA4335',
        d: 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z',
      },
      {
        fill: '#4285F4',
        d: 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z',
      },
      {
        fill: '#FBBC05',
        d: 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z',
      },
      {
        fill: '#34A853',
        d: 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z',
      },
    ],
  },
  kakao: {
    viewBox: '0 0 24 24',
    paths: [
      {
        fill: '#000000',
        d: 'M12 0C5.373 0 0 4.13 0 9.226c0 3.24 2.148 6.09 5.395 7.73-.18.65-1.15 4.13-1.19 4.4 0 0-.02.2.11.28.13.08.28.02.28.02.37-.05 4.28-2.8 4.96-3.27.8.11 1.62.17 2.44.17 6.63 0 12-4.13 12-9.23C24 4.13 18.63 0 12 0',
      },
    ],
  },
  naver: {
    viewBox: '0 0 24 24',
    paths: [
      {
        fill: 'currentColor',
        d: 'M16.273 12.845 7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845Z',
      },
    ],
  },
};

/**
 * 버튼 색 — 전부 각 사 지정값이다.
 *
 * 카카오: 컨테이너 #FEE500 / 심볼 #000000 / 레이블 #000000 85%. "위의 색상 규정에 벗어난
 *   색상을 적용해서는 안 됩니다." 테마별 변형이 아예 없어 라이트·다크가 같다.
 * 네이버: 2025년 하반기 개정색 #03A94D. 예전 #03C75A 도, 우리가 쓰던 #007A3D 도 아니다.
 *   다크 렌디션 #05AC4F 가 따로 있지만 흰 글자 대비가 2.99:1 로 비텍스트 3:1 문턱에도 못 미쳐
 *   두 테마 모두 #03A94D 를 쓴다(같은 지정색이다).
 * 구글: Light #FFFFFF / stroke #747775 / text #1F1F1F, Dark #131314 / #8E918F / #E3E3E3.
 *   구글만 공식 다크 렌디션이 있다.
 */
export const SOCIAL_BRAND_COLORS = {
  kakao: {
    light: { bg: '#FEE500', label: 'rgba(0, 0, 0, 0.85)', mark: '#000000', line: null },
    dark: { bg: '#FEE500', label: 'rgba(0, 0, 0, 0.85)', mark: '#000000', line: null },
  },
  naver: {
    light: { bg: '#03A94D', label: '#FFFFFF', mark: '#FFFFFF', line: null },
    dark: { bg: '#03A94D', label: '#FFFFFF', mark: '#FFFFFF', line: null },
  },
  google: {
    light: { bg: '#FFFFFF', label: '#1F1F1F', mark: null, line: '#747775' },
    dark: { bg: '#131314', label: '#E3E3E3', mark: null, line: '#8E918F' },
  },
} as const;

/**
 * 버튼 라벨.
 *
 * 카카오가 가장 빡빡하다 — 허용 문구는 "카카오 로그인 / 로그인 / Login with Kakao / Login"
 * 넷뿐이고 목록 밖 문구는 쓸 수 없다("완성형과 축약형 레이블 외의 다른 레이블을 적용할 수
 * 없습니다"). 예전 "카카오로 계속하기" 와 로딩 중 문구 "카카오 로그인 중..." 이 둘 다 목록 밖이었다.
 * ("카카오로 시작하기" 는 카카오싱크 도입사 전용이라 우리는 쓸 수 없다.)
 *
 * 네이버는 "로그인 목적에 부합하면" 자유롭고, 구글은 Sign in / Sign up / Continue with Google
 * 세 갈래의 현지화를 권장한다. 그래서 셋을 "OO 로그인" 으로 나란히 맞출 수 있었다.
 */
export const SOCIAL_LABELS: Record<SocialProvider, string> = {
  kakao: '카카오 로그인',
  naver: '네이버 로그인',
  google: 'Google 로그인',
};

/**
 * 마크 기하를 SVG 문자열로.
 *
 * 화면에 그리는 쪽은 이 함수를 쓰지 않는다 — 웹은 SOCIAL_MARK_GEOMETRY 로 직접 <path> 를
 * 그린다(apps/web/components/auth/socialMarks.tsx). 여기 남은 이유는 규격 테스트다:
 * socialLogin.test.ts 가 이 문자열로 "구글 G 를 단색으로 칠하지 않는다" 같은 각 사 금지
 * 조항을 검사한다.
 */
export function socialMarkToSvg(provider: SocialProvider, fill?: string): string {
  const { viewBox, paths } = SOCIAL_MARK_GEOMETRY[provider];
  const body = paths
    .map((p) => `<path fill="${p.fill === 'currentColor' ? (fill ?? '#000000') : p.fill}" d="${p.d}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
}
