import { FOURCUT_FILTER_DEFINITIONS, type FourcutFilterId } from '@harucut/shared';

export type FrameId = 'classic-4' | 'grid-4' | 'polaroid-4' | 'wide-4';
export type MediaKind = 'image';
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
  kind: 'photo';
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

// 핸드오프 TabBar(홈·기록·촬영·프레임·MY) 정본 순서. 촬영은 중앙 FAB로 돌출 렌더.
// 업로드는 독립 탭에서 제거(홈의 '사진 불러오기' / 촬영 진입으로 흡수, 라우트는 유지).
export const BOTTOM_NAV_ITEMS = [
  { href: '/home', icon: 'home-outline', iconActive: 'home', key: 'home', label: '홈' },
  {
    href: '/history',
    icon: 'grid-outline',
    iconActive: 'grid',
    key: 'history',
    label: '기록',
  },
  {
    center: true,
    href: '/shoot',
    icon: 'camera',
    iconActive: 'camera',
    key: 'shoot',
    label: '',
  },
  {
    href: '/theme',
    icon: 'film-outline',
    iconActive: 'film',
    key: 'theme',
    label: '프레임',
  },
  {
    href: '/mypage',
    icon: 'person-outline',
    iconActive: 'person',
    key: 'mypage',
    label: 'MY',
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
  { label: '블랙', value: '#000000' },
  { label: '그린', value: '#1ED760' },
  { label: '아이보리', value: '#FAFAF7' },
  { label: '차콜', value: '#232325' },
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
  { label: '크림', value: '#FAF7F0' },
  { label: '민트', value: '#E4F7EC' },
  { label: '그린', value: '#1ED760' },
] as const;

// 핸드오프 app-decorate "프레임색" 스와치(스트립 색)
export const FRAME_COLOR_SWATCHES = [
  '#000000',
  '#FFFFFF',
  '#1ED760',
  '#15151E',
  '#E14B2A',
  '#3A5A8C',
  '#C8A24A',
  '#9C6FB0',
] as const;

// 핸드오프 app-decorate "선택" 탭 글자색 스와치
export const THEME_TEXT_COLOR_SWATCHES = [
  '#FFFFFF',
  '#0B0B0C',
  '#1ED760',
  '#FF5A8A',
  '#FFD15C',
  '#5AA9FF',
] as const;

// 핸드오프 decorate ED_STICKERS 정본(이모지 16종)
export const THEME_STICKERS = [
  { id: 'star', label: '별', symbol: '⭐️' },
  { id: 'heart-pink', label: '핑크하트', symbol: '💖' },
  { id: 'sparkles', label: '반짝', symbol: '✨' },
  { id: 'blossom', label: '벚꽃', symbol: '🌸' },
  { id: 'ribbon', label: '리본', symbol: '🎀' },
  { id: 'cloud', label: '구름', symbol: '☁️' },
  { id: 'fire', label: '불꽃', symbol: '🔥' },
  { id: 'cool', label: '선글라스', symbol: '😎' },
  { id: 'dog', label: '강아지', symbol: '🐶' },
  { id: 'strawberry', label: '딸기', symbol: '🍓' },
  { id: 'rainbow', label: '무지개', symbol: '🌈' },
  { id: 'heart-red', label: '하트', symbol: '❤️' },
  { id: 'crown', label: '왕관', symbol: '👑' },
  { id: 'butterfly', label: '나비', symbol: '🦋' },
  { id: 'clover', label: '클로버', symbol: '🍀' },
  { id: 'camera', label: '카메라', symbol: '📷' },
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
