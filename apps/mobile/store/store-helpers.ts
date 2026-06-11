import {
  FRAME_BORDER_OPTIONS,
  THEME_FRAME_CANVAS,
  type FrameId,
  type HistoryItem,
  type MediaAsset,
  type ThemeEditorComponent,
} from '@/constants/harucut-data';
import type { ButtonVariant } from '@/constants/harucut-design';

export type AccessMode = 'anonymous' | 'guest' | 'member';
export type RemoteStatus = 'idle' | 'loading' | 'ready' | 'error';

export type NoticeActionId =
  | 'dismiss'
  | 'go-login'
  | 'go-shoot'
  | 'go-landing'
  | 'start-guest-trial';

export type NoticeAction = {
  id: NoticeActionId;
  label: string;
  variant?: ButtonVariant;
};

export type NoticeState = {
  actions: NoticeAction[];
  eyebrow?: string;
  icon?: string;
  message: string;
  title: string;
};

export const defaultBorderColor = FRAME_BORDER_OPTIONS[0].value;

const frameNames: Record<FrameId, string> = {
  'classic-4': '클래식 4컷',
  'grid-4': '2x2 그리드',
  'polaroid-4': '폴라로이드 4컷',
  'wide-4': '와이드 4컷',
};

export function frameName(frameId: FrameId) {
  return frameNames[frameId] ?? '하루컷 프레임';
}

export function remoteFrameIdFromSavedId(id: string) {
  const value = Number(id.replace('remote-frame-', ''));
  return Number.isFinite(value) ? value : null;
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeThemeColor(input: string) {
  const cleaned = input.trim().replace(/^#/, '');
  const hex = cleaned.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toLowerCase();

  if (hex.length === 3) {
    return `#${hex
      .split('')
      .map((char) => `${char}${char}`)
      .join('')}`;
  }

  return `#${hex.padEnd(6, '0') || '111827'}`;
}

export function normalizeThemeZ(components: ThemeEditorComponent[]) {
  return components.map((component, index) => ({ ...component, zIndex: index + 1 }));
}

export function getThemeCanvas(frameId: FrameId) {
  return THEME_FRAME_CANVAS[frameId];
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function uniqueMedia(items: MediaAsset[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

export function limitSelection(current: string[], id: string) {
  if (current.includes(id)) {
    return current.filter((item) => item !== id);
  }

  if (current.length >= 4) {
    return current;
  }

  return [...current, id];
}

export function selectedMedia(items: MediaAsset[], selectedIds: string[]) {
  const selected = items.filter((item) => selectedIds.includes(item.id));
  return selected.slice(0, 4);
}

export function upsertHistoryItem(
  items: HistoryItem[],
  nextItem: HistoryItem,
  existingId: string | null,
) {
  if (!existingId) {
    return [nextItem, ...items];
  }

  return items.map((item) => (item.id === existingId ? nextItem : item));
}

// 세션 모드 전환(enterAnonymousMode 등) 시 작업 공간 스토어들을 초기화하기 위한 레지스트리.
// 세션 스토어가 작업 공간 스토어를 직접 import하면 순환 참조가 생기므로,
// 각 스토어 모듈이 로드될 때 자신의 hardReset을 등록한다.
const workspaceResets = new Set<() => void>();

export function registerWorkspaceReset(reset: () => void) {
  workspaceResets.add(reset);
}

export function resetAllWorkspaces() {
  for (const reset of workspaceResets) {
    reset();
  }
}
