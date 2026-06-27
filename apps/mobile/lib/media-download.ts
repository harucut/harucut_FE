import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Share } from 'react-native';

// 웹의 다운로드(원격 download-url → 파일 저장)와 공유(링크 공유)를 모바일로 옮긴 유틸.
// - 다운로드: 원격 URL을 캐시에 받은 뒤 기기 사진 보관함에 저장
// - 공유: 시스템 공유 시트로 링크 전달

export type MediaDownloadResult =
  | { ok: true }
  | { ok: false; reason: 'failed' | 'no-url' | 'permission-denied' };

function inferExtension(url: string, _kind: 'image' | 'photo') {
  const match = /\.([a-zA-Z0-9]{2,4})(?:[?#]|$)/.exec(url);
  if (match) {
    return match[1].toLowerCase();
  }

  return 'jpg';
}

function sanitizeFilename(value: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || '하루컷';
}

export async function saveRemoteMediaToLibrary(
  url: string | undefined,
  title: string,
  kind: 'image' | 'photo' = 'photo',
): Promise<MediaDownloadResult> {
  if (!url) {
    return { ok: false, reason: 'no-url' };
  }

  const permission = await MediaLibrary.requestPermissionsAsync();

  if (!permission.granted) {
    return { ok: false, reason: 'permission-denied' };
  }

  try {
    const extension = inferExtension(url, kind);
    const target = `${FileSystem.cacheDirectory ?? ''}${sanitizeFilename(title)}.${extension}`;
    const { uri } = await FileSystem.downloadAsync(url, target);
    await MediaLibrary.saveToLibraryAsync(uri);

    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function shareMediaLink(title: string, url: string | undefined) {
  if (!url) {
    return;
  }

  await Share.share({ message: `${title}\n${url}`, url });
}
