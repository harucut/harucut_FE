export type HarucutColorScheme = 'light' | 'dark';
export type HarucutThemePreference = HarucutColorScheme | 'system';

export type HarucutColors = {
  accent: string;
  background: string;
  backgroundCanvas: string;
  backgroundTint: string;
  border: string;
  card: string;
  cardMuted: string;
  cardStrong: string;
  danger: string;
  dangerSoft: string;
  muted: string;
  overlay: string;
  overlayStrong: string;
  primary: string;
  primarySoft: string;
  primaryStrong: string;
  shadow: string;
  text: string;
  textSoft: string;
};

// STUDIO 디자인: 딥다크 무대 + 단일 그린 액센트(다크 #1ED760 / 라이트 #16B454).
// 사진(4컷)이 색을 담당하고 UI는 조용한 다크/뉴트럴. 라이트는 사용자 제공 토큰 기준.
// AA 주의: muted 그레이는 본문 미달(대형/캡션 전용), 라이트에서 그린은 텍스트로 쓰지 말고
// 채움/보더로만(그 위 글자는 어둡게). primaryStrong은 본문 대비 통과 그린으로 둔다.
export const HARUCUT_THEME_COLORS: Record<HarucutColorScheme, HarucutColors> = {
  dark: {
    accent: '#7BEAA6',
    background: '#0B0B0C',
    backgroundCanvas: '#000000',
    backgroundTint: '#161617',
    border: 'rgba(255, 255, 255, 0.10)',
    card: '#18181A',
    cardMuted: '#232325',
    cardStrong: '#202022',
    danger: '#F87171',
    dangerSoft: 'rgba(127, 29, 29, 0.35)',
    muted: '#6F6F73',
    overlay: 'rgba(0, 0, 0, 0.60)',
    overlayStrong: 'rgba(0, 0, 0, 0.78)',
    primary: '#1ED760',
    primarySoft: 'rgba(30, 215, 96, 0.16)',
    primaryStrong: '#56DD86',
    shadow: 'rgba(0, 0, 0, 0.70)',
    text: '#FFFFFF',
    textSoft: '#B3B3B3',
  },
  light: {
    accent: '#0E7E39',
    background: '#FAFAF7',
    backgroundCanvas: '#0B0B0C',
    backgroundTint: '#F1F1EE',
    border: 'rgba(20, 20, 15, 0.10)',
    card: '#FFFFFF',
    cardMuted: '#E8E8E4',
    cardStrong: '#FFFFFF',
    danger: '#D14343',
    dangerSoft: '#FDECEC',
    muted: '#94948D',
    overlay: 'rgba(10, 10, 8, 0.45)',
    overlayStrong: 'rgba(20, 20, 15, 0.72)',
    primary: '#16B454',
    primarySoft: 'rgba(22, 180, 84, 0.14)',
    primaryStrong: '#0E7E39',
    shadow: 'rgba(20, 20, 15, 0.18)',
    text: '#14140F',
    textSoft: '#5C5C57',
  },
};

export const HARUCUT_COLORS = HARUCUT_THEME_COLORS.light;

export const HARUCUT_RADII = {
  card: 28,
  chip: 999,
  lg: 24,
  md: 18,
  sm: 14,
};

export const HARUCUT_SPACING = {
  card: 16,
  content: 20,
  screen: 16,
  section: 20,
};

export type ButtonVariant = 'danger' | 'ghost' | 'primary' | 'secondary';
