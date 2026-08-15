import {
  THEME_FRAME_CANVAS,
  type FrameId,
  type SavedFrame,
  type ThemeBackground,
  type ThemeEditorComponent,
} from '@/constants/harucut-data';
import { apiEnvelopeData, apiRequest } from '@/lib/api-client';

export type RemoteFrameType = 'CLASSIC' | 'GRID' | 'POLAROID' | 'WIDE';

type RemoteFrameBackground =
  | {
      type: 'COLOR';
      value: string;
    }
  | {
      key?: string;
      opacity?: number;
      type: 'IMAGE';
    };

type RemoteFrameComponent = {
  height: number;
  id?: number | string;
  key?: string;
  rotation?: number;
  scale?: number;
  source: string;
  style?: Record<string, unknown>;
  styleJson?: Record<string, unknown>;
  type: 'PHOTO' | 'STICKER' | 'TEXT';
  width: number;
  x: number;
  y: number;
  // 스웨거 ComponentRequest/Response는 zIndex(카멜) 하나만 쓴다(둘 다 required).
  // 소문자 zindex는 서버가 하위호환으로 받아줄 뿐 스펙에 없어 보내지 않는다.
  // 응답 누락에 대비해 파싱용으로만 optional로 둔다.
  zIndex?: number;
};

type RemoteFrame = {
  background?: RemoteFrameBackground;
  canvasHeight?: number;
  canvasWidth?: number;
  components?: RemoteFrameComponent[];
  description?: string;
  frameId: number;
  frameType: RemoteFrameType;
  // 관리자가 등록한 기본 제공 프레임. 목록에 섞여 오지만 수정/삭제는 403이라 읽기 전용이다.
  isSystem?: boolean;
  source?: string;
  title: string;
};

type FrameCreateRequest = {
  background: RemoteFrameBackground;
  canvasHeight: number;
  canvasWidth: number;
  components: RemoteFrameComponent[];
  description: string;
  frameType: RemoteFrameType;
  previewKey: string;
  title: string;
};

type ThemeFrameDraft = {
  background?: ThemeBackground;
  backgroundColor: string;
  components?: ThemeEditorComponent[];
  description: string;
  frameId: FrameId;
  previewKey: string;
  title: string;
};

function frameTypeFromFrameId(frameId: FrameId): RemoteFrameType {
  if (frameId.startsWith('wide')) return 'WIDE';
  if (frameId.startsWith('grid')) return 'GRID';
  if (frameId.startsWith('polaroid')) return 'POLAROID';
  return 'CLASSIC';
}

function frameIdFromFrameType(frameType: RemoteFrameType): FrameId {
  switch (frameType) {
    case 'GRID':
      return 'grid-4';
    case 'POLAROID':
      return 'polaroid-4';
    case 'WIDE':
      return 'wide-4';
    case 'CLASSIC':
    default:
      return 'classic-4';
  }
}

function normalizeHexColor(input: string) {
  const cleaned = input.trim().replace(/^#/, '');
  const hex = cleaned.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toLowerCase();

  if (hex.length === 3) {
    return hex
      .split('')
      .map((char) => `${char}${char}`)
      .join('');
  }

  return hex.padEnd(6, '0') || 'ffffff';
}

function withHashColor(value: string | undefined, fallback: string) {
  const normalized = normalizeHexColor(value ?? fallback);
  return `#${normalized}`;
}

function componentStyle(component: RemoteFrameComponent) {
  return (component.styleJson ?? component.style ?? {}) as Record<string, unknown>;
}

function stringStyleValue(style: Record<string, unknown>, key: string) {
  const value = style[key];
  return typeof value === 'string' ? value : null;
}

function toRequestBackground(draft: ThemeFrameDraft): RemoteFrameBackground {
  const background = draft.background;

  if (!background || background.type === 'COLOR') {
    return {
      type: 'COLOR',
      value: normalizeHexColor(background?.value ?? draft.backgroundColor),
    };
  }

  // 스웨거 ImageBackgroundAttributes 는 key/opacity/type 이 전부 required 다.
  // 에디터에 불투명도 UI가 없어 opacity 가 비어 있으므로 기본값 1을 채워 보낸다.
  return {
    key: background.key,
    opacity: background.opacity ?? 1,
    type: 'IMAGE',
  };
}

function toSavedBackground(background?: RemoteFrameBackground): ThemeBackground | undefined {
  if (!background) return undefined;

  if (background.type === 'COLOR') {
    return {
      type: 'COLOR',
      value: normalizeHexColor(background.value),
    };
  }

  return {
    key: background.key,
    opacity: background.opacity ?? 1,
    type: 'IMAGE',
  };
}

function toRequestComponent(component: ThemeEditorComponent): RemoteFrameComponent {
  return {
    height: component.height,
    id: component.id,
    rotation: component.rotation ?? 0,
    scale: component.scale ?? 1,
    source: component.source,
    styleJson: component.styleJson ?? {},
    type: component.type,
    width: component.width,
    x: component.x,
    y: component.y,
    zIndex: component.zIndex,
  };
}

function toSavedComponent(component: RemoteFrameComponent, index: number): ThemeEditorComponent {
  return {
    height: component.height,
    hidden: false,
    id: String(component.id ?? `${component.type}-${index}`),
    locked: false,
    rotation: component.rotation ?? 0,
    scale: component.scale ?? 1,
    source: component.source || component.key || '',
    styleJson: componentStyle(component),
    type: component.type,
    width: component.width,
    x: component.x,
    y: component.y,
    zIndex: component.zIndex ?? index + 1,
  };
}

function toCreateFrameRequest(draft: ThemeFrameDraft): FrameCreateRequest {
  const canvas = THEME_FRAME_CANVAS[draft.frameId];

  return {
    background: toRequestBackground(draft),
    canvasHeight: canvas.height,
    canvasWidth: canvas.width,
    // 사용자가 실제로 배치한 컴포넌트만 보낸다. 예전에는 컴포넌트가 하나도 없으면
    // 하드코딩 기본 캡션('today archive')과 기본 스티커를 TEXT 컴포넌트로 만들어 저장했는데,
    // 앱에 캡션/스티커 편집 UI가 없어 사용자가 만들지 않은 텍스트가 서버 프레임에 섞였다.
    components: (draft.components ?? []).map(toRequestComponent),
    description: draft.description,
    frameType: frameTypeFromFrameId(draft.frameId),
    previewKey: draft.previewKey,
    title: draft.title,
  };
}

function toSavedFrame(frame: RemoteFrame): SavedFrame {
  const components = frame.components ?? [];
  const savedComponents = components.map(toSavedComponent);
  // role: 'caption' / 'sticker' 컴포넌트는 더 이상 앱이 만들지 않는다(자동 생성 폐지).
  // 그 규약으로 이미 저장된 기존 프레임을 읽기 위한 하위호환 역매핑이다 —
  // SavedFrame.caption(프리뷰 접근성 라벨)과 accentColor(촬영·업로드 테두리색)가 이 값을 쓴다.
  const captionComponent = components.find(
    (component) => component.type === 'TEXT' && componentStyle(component).role === 'caption',
  );
  const stickerComponents = components.filter(
    (component) => component.type === 'TEXT' && componentStyle(component).role === 'sticker',
  );
  const captionStyle = captionComponent ? componentStyle(captionComponent) : {};
  const backgroundColor =
    frame.background?.type === 'COLOR'
      ? withHashColor(frame.background.value, 'EEF5FF')
      : '#EEF5FF';
  const accentColor =
    stringStyleValue(captionStyle, 'accentColor') ??
    stringStyleValue(captionStyle, 'color') ??
    '#1ED760';

  return {
    accentColor,
    background: toSavedBackground(frame.background),
    backgroundColor,
    caption: captionComponent?.source ?? '',
    components: savedComponents,
    description: frame.description ?? '',
    frameId: frameIdFromFrameType(frame.frameType),
    id: `remote-frame-${frame.frameId}`,
    previewKey: frame.source,
    remoteFrameId: frame.frameId,
    stickers: stickerComponents.map((component) => component.source).filter(Boolean),
    title: frame.title,
  };
}

export async function listRemoteFrames() {
  const frames = await apiEnvelopeData<RemoteFrame[]>(
    '/api/auth/user/frame',
    {
      cache: 'no-store',
    },
  );

  // 서버는 내 프레임 뒤에 기본 제공(시스템) 프레임을 붙여 내려준다. 내 소유가 아니라
  // 수정/삭제가 403이므로 '저장한 프레임'에서는 제외한다(꾸미고 저장하는 순간 작업분이 날아간다).
  return Array.isArray(frames)
    ? frames.filter((frame) => !frame.isSystem).map(toSavedFrame)
    : [];
}

export async function createRemoteFrame(draft: ThemeFrameDraft) {
  await apiRequest(
    '/api/auth/user/frame',
    {
      body: toCreateFrameRequest(draft),
      method: 'POST',
    },
  );
}

export async function updateRemoteFrame(frameId: number, draft: ThemeFrameDraft) {
  await apiRequest(
    `/api/auth/user/frame/${frameId}`,
    {
      body: toCreateFrameRequest(draft),
      method: 'PUT',
    },
  );
}

export async function deleteRemoteFrame(frameId: number) {
  await apiRequest(
    `/api/auth/user/frame/${frameId}`,
    {
      method: 'DELETE',
    },
  );
}
