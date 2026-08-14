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
  // 확인 다이얼로그처럼 액션에 임의 동작을 붙일 때 사용. 지정되면 노티스를 닫은 뒤 실행한다.
  onPress?: () => void;
};

export type NoticeState = {
  actions: NoticeAction[];
  eyebrow?: string;
  icon?: string;
  message: string;
  title: string;
};

export const defaultBorderColor = FRAME_BORDER_OPTIONS[0].value;

// 웹(apps/web/constants/frames.ts)과 반드시 같은 문자열을 쓴다 —
// 같은 프레임이 앱/웹에서 다른 이름으로 보이면 저장한 기록을 못 알아본다.
const frameNames: Record<FrameId, string> = {
  'classic-4': '세로 4컷',
  'grid-4': '네모 4컷',
  'polaroid-4': '즉석사진 4컷',
  'wide-4': '가로 4컷',
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
  // 사용자가 탭한 순서(selectedIds)를 그대로 보존해야 미리보기와 저장 결과가 일치한다.
  // 원본 items 순서로 filter하면 탭 순서가 사라지므로 selectedIds 기준으로 매핑한다.
  const selected = selectedIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is MediaAsset => item !== undefined);
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

// 명시적 세션 이탈(로그아웃·탈퇴·게스트 전환) 시 작업 공간 스토어들을 초기화하기 위한 레지스트리.
// 세션 스토어가 작업 공간 스토어를 직접 import하면 순환 참조가 생기므로,
// 각 스토어 모듈이 로드될 때 자신의 hardReset을 등록한다(촬영·업로드·꾸미기 + 라이브러리 캐시).
// 401 하드 만료는 사용자의 의사가 아니므로 이 경로를 쓰지 않는다 —
// use-session-store의 endExpiredSession이 라이브러리만 비우고 작업 공간은 보존한다.
const workspaceResets = new Set<() => void>();

export function registerWorkspaceReset(reset: () => void) {
  workspaceResets.add(reset);
}

export function resetAllWorkspaces() {
  for (const reset of workspaceResets) {
    reset();
  }
}
