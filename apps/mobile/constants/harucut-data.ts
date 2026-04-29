export type FrameId = 'classic-4' | 'grid-4' | 'polaroid-4' | 'wide-4';
export type MediaKind = 'image' | 'video';
export type OutputTone = '기본' | '선명한 블루' | '소프트';

export type MediaAsset = {
  id: string;
  kind: MediaKind;
  label: string;
  uri: string;
};

export type SavedFrame = {
  id: string;
  accentColor: string;
  backgroundColor: string;
  caption: string;
  description: string;
  frameId: FrameId;
  stickers: string[];
  title: string;
  updatedAt: string;
};

export type HistoryItem = {
  createdAt: string;
  frameId: FrameId;
  id: string;
  kind: 'photo' | 'video';
  previewMedia: MediaAsset[];
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

export const HERO_IMAGE_URL =
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80';

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
    href: '/history',
    icon: 'time-outline',
    iconActive: 'time',
    key: 'history',
    label: '기록',
  },
  {
    href: '/mypage',
    icon: 'person-outline',
    iconActive: 'person',
    key: 'mypage',
    label: '내정보',
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

export const OUTPUT_TONE_OPTIONS: OutputTone[] = ['기본', '선명한 블루', '소프트'];

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
  email: 'hello@harucut.com',
  loginPlatform: 'HARUCUT',
  monthlyPrice: null,
  planTier: 'BASIC',
  profileUrl:
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
  username: '하루컷 유저',
};

const SAMPLE_MEDIA: MediaAsset[] = [
  {
    id: 'media-a',
    kind: 'image',
    label: '오늘의 산책',
    uri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'media-b',
    kind: 'image',
    label: '푸른 오후',
    uri: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'media-c',
    kind: 'image',
    label: '전시 기록',
    uri: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'media-d',
    kind: 'image',
    label: '카페 무드',
    uri: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'media-e',
    kind: 'image',
    label: '주말 데이트',
    uri: 'https://images.unsplash.com/photo-1511988617509-a57c8a288659?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'media-f',
    kind: 'image',
    label: '블루 스냅',
    uri: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80',
  },
];

export const INITIAL_HISTORY_ITEMS: HistoryItem[] = [
  {
    createdAt: '2026-04-20T10:40:00.000Z',
    frameId: 'classic-4',
    id: 'history-1',
    kind: 'photo',
    previewMedia: SAMPLE_MEDIA.slice(0, 4),
    source: 'shoot',
    title: '클래식 4컷 촬영 결과',
  },
  {
    createdAt: '2026-04-19T17:10:00.000Z',
    frameId: 'polaroid-4',
    id: 'history-2',
    kind: 'video',
    previewMedia: [SAMPLE_MEDIA[4], SAMPLE_MEDIA[2], SAMPLE_MEDIA[3], SAMPLE_MEDIA[5]],
    source: 'upload',
    title: '폴라로이드 4컷 업로드 결과',
  },
];

export const INITIAL_SAVED_FRAMES: SavedFrame[] = [
  {
    accentColor: '#2563EB',
    backgroundColor: '#EEF5FF',
    caption: 'today archive',
    description: '저장한 프레임을 이어서 수정하거나 같은 타입으로 바로 사용할 수 있어요.',
    frameId: 'polaroid-4',
    id: 'saved-frame-1',
    stickers: ['✦', '♡'],
    title: '블루 아카이브 프레임',
    updatedAt: '2026-04-18T13:20:00.000Z',
  },
  {
    accentColor: '#1D4ED8',
    backgroundColor: '#FFFFFF',
    caption: 'record your day',
    description: '촬영 시작 화면에서 바로 이어서 선택할 수 있는 저장 프레임이에요.',
    frameId: 'classic-4',
    id: 'saved-frame-2',
    stickers: ['★'],
    title: '클래식 블루 라인',
    updatedAt: '2026-04-17T09:15:00.000Z',
  },
];
