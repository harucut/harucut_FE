import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { Share } from 'react-native';

/**
 * 웹(WebView) 이 네이티브에 부탁하는 일들.
 *
 * 웹 쪽 짝은 apps/web/lib/nativeBridge.ts 다. 프로토콜을 바꾸면 양쪽을 같이 고쳐야 한다.
 *
 * 여기서 처리하는 것은 웹이 **할 수 없는** 것만이다:
 *  - 사진첩 저장: 웹 표준에 사진첩 쓰기 API 가 없다. WebView 에서는 `<a download>` 도 안 먹는다.
 *  - 공유 시트: 안드로이드 WebView 에 navigator.share 가 없다.
 *  - 햅틱: 웹 navigator.vibrate 는 iOS 에서 동작하지 않는다.
 */

export type BridgeMessage =
  | { type: 'save-url'; id: string; url: string; filename: string }
  | { type: 'save-begin'; id: string; filename: string; mime: string; total: number }
  | { type: 'save-chunk'; id: string; index: number; data: string }
  | { type: 'save-end'; id: string }
  | { type: 'share'; id: string; title?: string; message?: string; url: string }
  | { type: 'haptic'; style?: 'light' | 'medium' | 'heavy' };

export type BridgeResult = { ok: boolean; reason?: string };

/** 웹이 base64 로 쪼개 보내는 저장 요청을 모은다. */
const transfers = new Map<string, { filename: string; total: number; chunks: string[] }>();

function safeFilename(name: string) {
  // 사용자 표시 이름이 그대로 파일명이 된다 — 경로 구분자와 금지 문자를 걷어낸다.
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : `harucut-${Date.now()}.png`;
}

/**
 * 사진첩 쓰기 권한. 저장만 할 것이므로 writeOnly 로 요청한다 —
 * 전체 사진 접근을 요구하면 사용자가 거절하기 쉽고 스토어 심사에서도 과한 요청이 된다.
 */
async function ensurePermission(): Promise<BridgeResult> {
  const current = await MediaLibrary.getPermissionsAsync(true);
  if (current.granted) return { ok: true };

  if (!current.canAskAgain) {
    return { ok: false, reason: '설정에서 사진 접근을 허용해 주세요.' };
  }

  const asked = await MediaLibrary.requestPermissionsAsync(true);
  return asked.granted
    ? { ok: true }
    : { ok: false, reason: '사진첩 저장 권한이 필요해요.' };
}

async function saveLocalFile(uri: string): Promise<BridgeResult> {
  const permission = await ensurePermission();
  if (!permission.ok) return permission;

  try {
    await MediaLibrary.saveToLibraryAsync(uri);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : '저장에 실패했어요.' };
  } finally {
    // 캐시에 남겨 두면 앱 용량이 계속 늘어난다. 실패해도 지운다.
    void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}

/** 원격 이미지를 내려받아 사진첩에 넣는다. 서버 합성 결과처럼 https 주소가 있을 때 쓴다. */
export async function saveRemoteImage(url: string, filename: string): Promise<BridgeResult> {
  const target = `${FileSystem.cacheDirectory}${safeFilename(filename)}`;

  try {
    const downloaded = await FileSystem.downloadAsync(url, target);
    if (downloaded.status !== 200) {
      return { ok: false, reason: `이미지를 받지 못했어요 (${downloaded.status})` };
    }
    return await saveLocalFile(downloaded.uri);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : '이미지를 받지 못했어요.' };
  }
}

/** 웹이 만든 결과물(base64 조각)을 이어 붙여 사진첩에 넣는다. */
export async function saveBase64Chunks(
  id: string,
  filename: string,
): Promise<BridgeResult> {
  const transfer = transfers.get(id);
  transfers.delete(id);

  if (!transfer) return { ok: false, reason: '저장할 데이터를 받지 못했어요.' };
  if (transfer.chunks.filter(Boolean).length !== transfer.total) {
    return { ok: false, reason: '이미지 조각이 일부 사라졌어요. 다시 시도해 주세요.' };
  }

  const target = `${FileSystem.cacheDirectory}${safeFilename(filename)}`;

  try {
    await FileSystem.writeAsStringAsync(target, transfer.chunks.join(''), {
      encoding: FileSystem.EncodingType.Base64,
    });
    return await saveLocalFile(target);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : '저장에 실패했어요.' };
  }
}

export function beginTransfer(id: string, filename: string, total: number) {
  transfers.set(id, { filename, total, chunks: new Array<string>(total) });
}

export function pushChunk(id: string, index: number, data: string) {
  const transfer = transfers.get(id);
  if (!transfer) return;
  transfer.chunks[index] = data;
}

export function transferFilename(id: string) {
  return transfers.get(id)?.filename ?? `harucut-${Date.now()}.png`;
}

export async function shareLink(args: {
  title?: string;
  message?: string;
  url: string;
}): Promise<BridgeResult> {
  try {
    const result = await Share.share({
      // 안드로이드는 url 필드를 무시하는 앱이 많아 본문에 같이 싣는다.
      message: args.message ? `${args.message}\n${args.url}` : args.url,
      title: args.title,
      url: args.url,
    });
    return { ok: result.action === Share.sharedAction };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : '공유에 실패했어요.' };
  }
}

export function haptic(style: 'light' | 'medium' | 'heavy' = 'medium') {
  const map = {
    light: Haptics.ImpactFeedbackStyle.Light,
    medium: Haptics.ImpactFeedbackStyle.Medium,
    heavy: Haptics.ImpactFeedbackStyle.Heavy,
  } as const;
  void Haptics.impactAsync(map[style]).catch(() => undefined);
}
