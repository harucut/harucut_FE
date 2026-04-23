export type HarucutColorScheme = 'light' | 'dark';
export type HarucutThemePreference = HarucutColorScheme | 'system';

export type HarucutColors = {
  accent: string;
  background: string;
  backgroundCanvas: string;
  backgroundGradientEnd: string;
  backgroundGradientStart: string;
  backgroundOrbRight: string;
  backgroundOrbTop: string;
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

export const HARUCUT_THEME_COLORS: Record<HarucutColorScheme, HarucutColors> = {
  dark: {
    accent: '#93C5FD',
    background: '#09090B',
    backgroundCanvas: '#0F172A',
    backgroundGradientEnd: '#111827',
    backgroundGradientStart: '#09090B',
    backgroundOrbRight: 'rgba(96, 165, 250, 0.11)',
    backgroundOrbTop: 'rgba(59, 130, 246, 0.18)',
    backgroundTint: '#172033',
    border: 'rgba(255, 255, 255, 0.10)',
    card: 'rgba(17, 24, 39, 0.84)',
    cardMuted: 'rgba(30, 41, 59, 0.88)',
    cardStrong: 'rgba(15, 23, 42, 0.94)',
    danger: '#F87171',
    dangerSoft: 'rgba(127, 29, 29, 0.35)',
    muted: '#94A3B8',
    overlay: 'rgba(2, 6, 23, 0.64)',
    overlayStrong: 'rgba(15, 23, 42, 0.78)',
    primary: '#3B82F6',
    primarySoft: 'rgba(59, 130, 246, 0.16)',
    primaryStrong: '#BFDBFE',
    shadow: 'rgba(37, 99, 235, 0.26)',
    text: '#F8FAFC',
    textSoft: '#CBD5E1',
  },
  light: {
    accent: '#74A9FF',
    background: '#FCFDFF',
    backgroundCanvas: '#F8FBFF',
    backgroundGradientEnd: '#EEF5FF',
    backgroundGradientStart: '#FCFDFF',
    backgroundOrbRight: 'rgba(37, 99, 235, 0.10)',
    backgroundOrbTop: 'rgba(116, 169, 255, 0.18)',
    backgroundTint: '#EEF5FF',
    border: 'rgba(148, 163, 184, 0.28)',
    card: 'rgba(255, 255, 255, 0.84)',
    cardMuted: 'rgba(227, 238, 252, 0.72)',
    cardStrong: 'rgba(255, 255, 255, 0.96)',
    danger: '#D14343',
    dangerSoft: '#FDECEC',
    muted: '#59708F',
    overlay: 'rgba(10, 24, 45, 0.36)',
    overlayStrong: 'rgba(16, 40, 72, 0.72)',
    primary: '#2563EB',
    primarySoft: '#DCEAFE',
    primaryStrong: '#1D4ED8',
    shadow: 'rgba(37, 99, 235, 0.14)',
    text: '#102848',
    textSoft: '#21406A',
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
