import type { FrameId, SavedFrame } from '@/constants/harucut-data';
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
    }
  | {
      autoPlay?: boolean;
      key?: string;
      loop?: boolean;
      type: 'VIDEO';
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
  zIndex: number;
};

type RemoteFrame = {
  background?: RemoteFrameBackground;
  components?: RemoteFrameComponent[];
  description?: string;
  frameId: number;
  frameType: RemoteFrameType;
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
  accentColor: string;
  backgroundColor: string;
  caption: string;
  description: string;
  frameId: FrameId;
  previewKey: string;
  stickers: string[];
  title: string;
};

const FRAME_CANVAS: Record<FrameId, { height: number; width: number }> = {
  'classic-4': { height: 1920, width: 1080 },
  'grid-4': { height: 1600, width: 1440 },
  'polaroid-4': { height: 1760, width: 1440 },
  'wide-4': { height: 1640, width: 1440 },
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

function toCreateFrameRequest(draft: ThemeFrameDraft): FrameCreateRequest {
  const canvas = FRAME_CANVAS[draft.frameId];
  const caption = draft.caption.trim();
  const stickers = draft.stickers.filter((item) => item.trim());
  const components: RemoteFrameComponent[] = [
    ...(caption
      ? [
          {
            height: 120,
            source: caption,
            styleJson: {
              accentColor: draft.accentColor,
              color: draft.accentColor,
              role: 'caption',
            },
            rotation: 0,
            scale: 1,
            type: 'TEXT' as const,
            width: canvas.width * 0.8,
            x: canvas.width * 0.1,
            y: canvas.height * 0.86,
            zIndex: 1,
          },
        ]
      : []),
    ...stickers.map((sticker, index) => ({
      height: 96,
      source: sticker,
      styleJson: {
        accentColor: draft.accentColor,
        color: draft.accentColor,
        role: 'sticker',
      },
      rotation: 0,
      scale: 1,
      type: 'TEXT' as const,
      width: 96,
      x: 120 + index * 112,
      y: 120,
      zIndex: index + 2,
    })),
  ];

  return {
    background: {
      type: 'COLOR',
      value: normalizeHexColor(draft.backgroundColor),
    },
    canvasHeight: canvas.height,
    canvasWidth: canvas.width,
    components,
    description: draft.description,
    frameType: frameTypeFromFrameId(draft.frameId),
    previewKey: draft.previewKey,
    title: draft.title,
  };
}

function toSavedFrame(frame: RemoteFrame): SavedFrame {
  const components = frame.components ?? [];
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
    '#2563EB';

  return {
    accentColor,
    backgroundColor,
    caption: captionComponent?.source ?? '',
    description: frame.description ?? '',
    frameId: frameIdFromFrameType(frame.frameType),
    id: `remote-frame-${frame.frameId}`,
    previewKey: frame.source,
    remoteFrameId: frame.frameId,
    stickers: stickerComponents.map((component) => component.source).filter(Boolean),
    title: frame.title,
    updatedAt: new Date().toISOString(),
  };
}

export async function listRemoteFrames() {
  const frames = await apiEnvelopeData<RemoteFrame[]>(
    {
      direct: '/api/auth/user/frame',
      proxy: '/api/client/user/frame',
    },
    {
      cache: 'no-store',
    },
  );

  return Array.isArray(frames) ? frames.map(toSavedFrame) : [];
}

export async function createRemoteFrame(draft: ThemeFrameDraft) {
  await apiRequest(
    {
      direct: '/api/auth/user/frame',
      proxy: '/api/client/user/frame',
    },
    {
      body: toCreateFrameRequest(draft),
      method: 'POST',
    },
  );
}

export async function updateRemoteFrame(frameId: number, draft: ThemeFrameDraft) {
  await apiRequest(
    {
      direct: `/api/auth/user/frame/${frameId}`,
      proxy: `/api/client/user/frame/${frameId}`,
    },
    {
      body: toCreateFrameRequest(draft),
      method: 'PUT',
    },
  );
}

export async function deleteRemoteFrame(frameId: number) {
  await apiRequest(
    {
      direct: `/api/auth/user/frame/${frameId}`,
      proxy: `/api/client/user/frame/${frameId}`,
    },
    {
      method: 'DELETE',
    },
  );
}
