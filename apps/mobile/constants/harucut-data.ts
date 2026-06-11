import { FOURCUT_FILTER_DEFINITIONS, type FourcutFilterId } from '@harucut/shared';

export type FrameId = 'classic-4' | 'grid-4' | 'polaroid-4' | 'wide-4';
export type MediaKind = 'image' | 'video';
export type OutputTone = FourcutFilterId;

export type MediaAsset = {
  id: string;
  kind: MediaKind;
  label: string;
  mimeType?: string | null;
  previewKind?: MediaKind;
  remoteMediaId?: number;
  s3Key?: string;
  uri: string;
};

export type ThemeComponentType = 'PHOTO' | 'STICKER' | 'TEXT';

export type ThemeTextAlign = 'center' | 'left' | 'right';

export type ThemeComponentStyle = {
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  opacity?: number;
  role?: string;
  textAlign?: ThemeTextAlign;
};

export type ThemeEditorComponent = {
  height: number;
  hidden?: boolean;
  id: string;
  locked?: boolean;
  rotation: number;
  scale: number;
  source: string;
  styleJson?: ThemeComponentStyle;
  type: ThemeComponentType;
  width: number;
  x: number;
  y: number;
  zIndex: number;
};

export type ThemeBackground =
  | {
      type: 'COLOR';
      value: string;
    }
  | {
      key?: string;
      opacity?: number;
      type: 'IMAGE';
    }
  | {
      autoPlay?: boolean;
      key?: string;
      loop?: boolean;
      type: 'VIDEO';
    };

export type ThemeAsset = {
  id: string;
  label: string;
  mimeType?: string | null;
  s3Key?: string;
  uri: string;
};

export type SavedFrame = {
  id: string;
  accentColor: string;
  background?: ThemeBackground;
  backgroundColor: string;
  caption: string;
  components?: ThemeEditorComponent[];
  description: string;
  frameId: FrameId;
  previewKey?: string;
  remoteFrameId?: number;
  stickers: string[];
  title: string;
  updatedAt: string;
};

export type HistoryItem = {
  createdAt: string;
  frameId: FrameId;
  id: string;
  kind: 'photo' | 'video';
  mediaId?: number;
  previewMedia: MediaAsset[];
  remoteS3Key?: string;
  source: 'shoot' | 'upload';
  title: string;
};

export type UserProfile = {
  email: string;
  loginPlatform: string;
  monthlyPrice: number | null;
  planTier: string;
  profileUrl: string | null;
  username: string;
};

export type FrameCatalogItem = {
  badge: string;
  category: string;
  description: string;
  frameId: FrameId;
  name: string;
  recommendedFor: string[];
  shortLabel: string;
};

export const THEME_FRAME_CANVAS: Record<FrameId, { height: number; width: number }> = {
  'classic-4': { height: 6000, width: 2000 },
  'grid-4': { height: 6000, width: 4000 },
  'polaroid-4': { height: 6000, width: 4000 },
  'wide-4': { height: 4000, width: 6000 },
};

export const HERO_IMAGE_SOURCE = require('../assets/images/hero-image.png');

export const QUICK_LINKS = [
  { href: '/shoot', icon: 'camera-outline', label: '촬영' },
  { href: '/upload', icon: 'cloud-upload-outline', label: '업로드' },
  { href: '/theme', icon: 'color-palette-outline', label: '꾸미기' },
  { href: '/history', icon: 'time-outline', label: '기록' },
] as const;

export const BOTTOM_NAV_ITEMS = [
  { href: '/home', icon: 'home-outline', iconActive: 'home', key: 'home', label: '홈' },
  {
    href: '/shoot',
    icon: 'camera-outline',
    iconActive: 'camera',
    key: 'shoot',
    label: '촬영',
  },
  {
    href: '/upload',
    icon: 'cloud-upload-outline',
    iconActive: 'cloud-upload',
    key: 'upload',
    label: '업로드',
  },
  {
    href: '/theme',
    icon: 'color-palette-outline',
    iconActive: 'color-palette',
    key: 'theme',
    label: '꾸미기',
  },
  {
    href: '/history',
    icon: 'time-outline',
    iconActive: 'time',
    key: 'history',
    label: '기록',
  },
] as const;

export const FRAME_CATALOG: FrameCatalogItem[] = [
  {
    badge: '정석 포토부스',
    category: 'CLASSIC',
    description:
      '가장 익숙한 인생네컷 비율로, 데이트와 일상 기록에 안정적으로 어울리는 레이아웃이에요.',
    frameId: 'classic-4',
    name: '클래식 4컷',
    recommendedFor: ['데이트', '우정컷', '일상 기록'],
    shortLabel: 'BEST',
  },
  {
    badge: '배경까지 담는 구성',
    category: 'WIDE',
    description: '공간감과 표정을 함께 남기고 싶을 때 좋아요. 여행, 카페, 전시 기록에 특히 잘 맞아요.',
    frameId: 'wide-4',
    name: '와이드 4컷',
    recommendedFor: ['여행', '공간 무드', '2인 이상'],
    shortLabel: 'MOOD',
  },
  {
    badge: '콘텐츠형 콜라주',
    category: 'GRID',
    description:
      '표정 변화나 소품 샷을 정리해서 보여주기 좋아 업로드형 제작에 강한 레이아웃이에요.',
    frameId: 'grid-4',
    name: '2x2 그리드',
    recommendedFor: ['업로드 제작', '표정 변주', '콘텐츠 컷'],
    shortLabel: 'EDIT',
  },
  {
    badge: '꾸미기 특화',
    category: 'POLAROID',
    description:
      '스티커와 텍스트, 배경을 올렸을 때 가장 감성적으로 완성되는 스크랩북 무드 레이아웃이에요.',
    frameId: 'polaroid-4',
    name: '폴라로이드 4컷',
    recommendedFor: ['기념일', '팬메이드', '테마 편집'],
    shortLabel: 'THEME',
  },
];

export const FRAME_BORDER_OPTIONS = [
  { label: '코발트', value: '#2563EB' },
  { label: '딥 네이비', value: '#1D4ED8' },
  { label: '스카이 틴트', value: '#74A9FF' },
  { label: '아이스 블루', value: '#C7DCFF' },
] as const;

export type OutputToneOption = {
  description: string;
  id: OutputTone;
  label: string;
};

// id/라벨/설명/순서는 웹과 공유하는 공통 패키지 정의를 그대로 사용한다.
export const OUTPUT_TONE_OPTIONS: OutputToneOption[] = FOURCUT_FILTER_DEFINITIONS.map(
  ({ description, id, label }) => ({ description, id, label }),
);

export const BACKGROUND_SWATCHES = [
  { label: '화이트', value: '#FFFFFF' },
  { label: '블루 틴트', value: '#EEF5FF' },
  { label: '미스트', value: '#E7F0FF' },
  { label: '코발트', value: '#2563EB' },
] as const;

export const THEME_STICKERS = [
  { id: 'spark', label: '반짝', symbol: '✦' },
  { id: 'heart', label: '하트', symbol: '♡' },
  { id: 'star', label: '별', symbol: '★' },
  { id: 'ribbon', label: '리본', symbol: '⌁' },
  { id: 'note', label: '메모', symbol: '✎' },
] as const;

export const LOGIN_FIELDS = [
  { key: 'email', label: '이메일', placeholder: 'example@harucut.com', secure: false },
  { key: 'password', label: '비밀번호', placeholder: '비밀번호를 입력해 주세요', secure: true },
] as const;

export const SIGNUP_FIELDS = [
  { key: 'password', label: '비밀번호', placeholder: '8자 이상 비밀번호를 입력해 주세요', secure: true },
  { key: 'confirmPassword', label: '비밀번호 확인', placeholder: '비밀번호를 한 번 더 입력해 주세요', secure: true },
  { key: 'username', label: '닉네임', placeholder: '표시할 닉네임을 입력해 주세요', secure: false },
] as const;

export const INITIAL_USER: UserProfile = {
  email: '',
  loginPlatform: 'HARUCUT',
  monthlyPrice: null,
  planTier: 'BASIC',
  profileUrl: null,
  username: '하루컷',
};

export const INITIAL_SAVED_FRAMES: SavedFrame[] = [];
