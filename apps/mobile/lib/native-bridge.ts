import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { Platform, Share } from 'react-native';

/**
 * 웹(WebView) 이 네이티브에 부탁하는 일들.
 *
 * 웹 쪽 짝은 apps/web/lib/nativeBridge.ts 다. 프로토콜을 바꾸면 양쪽을 같이 고쳐야 한다.
 *
 * 여기서 처리하는 것은 웹이 **할 수 없는** 것만이다:
 *  - 사진첩 저장: 웹 표준에 사진첩 쓰기 API 가 없다. WebView 에서는 `<a download>` 도 안 먹는다.
 *  - 공유 시트: 안드로이드 WebView 에 navigator.share 가 없다.
 *  - 햅틱: 웹 navigator.vibrate 는 iOS 에서 동작하지 않는다.
 *  - 알림: 웹 Notification API 는 WebView 안에서 아예 없다. iOS WKWebView 는 지원하지 않고
 *    안드로이드 WebView 도 권한 UI 가 없어 조용히 거절된다. 앱을 벗어난 뒤(백그라운드)
 *    알릴 방법은 네이티브뿐이다.
 */

export type BridgeMessage =
  | { type: 'save-url'; id: string; url: string; filename: string }
  | { type: 'notify-permission'; id: string }
  | { type: 'notify-local'; id: string; title: string; body?: string; secondsFromNow?: number }
  | { type: 'theme'; scheme: 'light' | 'dark' }
  | { type: 'save-begin'; id: string; filename: string; mime: string; total: number }
  | { type: 'save-chunk'; id: string; index: number; data: string }
  | { type: 'save-end'; id: string }
  | { type: 'share'; id: string; title?: string; message?: string; url: string }
  | { type: 'haptic'; style?: 'light' | 'medium' | 'heavy' };

export type BridgeResult = { ok: boolean; reason?: string; value?: string };

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
  /*
    권한 확인도 try 안에서 한다.

    밖에 두고 조기 반환하면 아래 finally 를 건너뛴다. 이 함수가 불릴 때는 호출부가 이미
    결과 파일을 캐시에 내려받았거나(saveRemoteImage) 조각을 이어 붙여 써 둔
    뒤(saveBase64Chunks)라, 권한을 거절한 사용자가 저장을 다시 시도할 때마다 캐시 파일이
    쌓인다. 지우는 책임은 성공 여부와 무관하다.
  */
  try {
    const permission = await ensurePermission();
    if (!permission.ok) return permission;

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
  } finally {
    /*
      내려받은 파일은 성공 여부와 무관하게 지운다.

      downloadAsync 는 상태 코드를 보지 않고 응답 본문을 그대로 target 에 쓴다. 사진 URL 이
      만료돼 403 이 오면 그 오류 본문이 캐시 파일로 남는데, 위에서 조기 반환하면
      saveLocalFile 의 finally 를 거치지 않아 지울 곳이 없다 — 재시도할 때마다 쌓인다.
      성공 경로는 saveLocalFile 이 같은 파일을 이미 지운 뒤라 idempotent 로 무동작이다.
    */
    void FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
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

/* ──────────────────────────────────────────────────────────────────────────
   알림

   웹이 못 하는 일이라 네이티브가 맡는다. 지금 쓰는 것은 **로컬 알림**이다 —
   합성(최대 90초)처럼 기다려야 하는 일에서 사용자가 앱을 벗어나도 끝났다고 알린다.
   서버가 보내는 원격 푸시는 백엔드에 토큰을 받을 엔드포인트가 아직 없다
   (docs/mobile-shell.md 의 "백엔드에 필요한 것" 참고). 토큰을 꺼내는 길만 열어 둔다.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * 앱이 떠 있는 동안 도착한 알림도 배너로 띄운다.
 *
 * 기본값은 "앱이 켜져 있으면 표시하지 않음"이다. 우리 알림은 대부분 "합성이 끝났다"처럼
 * 지금 보여 줘야 하는 것이라, 앱 안에 있다고 삼키면 알림을 만든 의미가 없다.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * 알림 권한.
 *
 * 안드로이드 13+ 는 런타임 권한(POST_NOTIFICATIONS)이 필요하고, 그 이전 버전은 항상 허용이다.
 * iOS 는 항상 물어봐야 한다. 이미 거절한 사람에게 다시 묻지 않는다 — 시스템이 두 번째부터는
 * 대화상자를 띄우지 않아서, 물어본 척만 하고 아무 일도 일어나지 않는다.
 *
 * 예외도 결과로 바꿔 돌려준다. 여기서 던지면 셸의 onMessage 밖으로 빠져나가 reply() 가
 * 불리지 않고, 마이페이지의 `알림 켜기` 버튼이 웹 브리지 타임아웃 120초 동안 `여는 중`에
 * 묶인다. reason 은 사용자 화면에 그대로 나가므로(NativeNotificationSetting) 네이티브
 * 영문 메시지를 흘리지 않는다.
 */
export async function ensureNotificationPermission(): Promise<BridgeResult> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return { ok: true };

    if (!current.canAskAgain) {
      return { ok: false, reason: '설정에서 알림을 허용해 주세요.' };
    }

    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted ? { ok: true } : { ok: false, reason: '알림 권한이 필요해요.' };
  } catch {
    return { ok: false, reason: '알림 권한을 확인하지 못했어요.' };
  }
}

/**
 * 로컬 알림. `secondsFromNow` 를 주지 않으면 바로 띄운다.
 *
 * 권한이 없으면 **묻지 않고 실패로 돌려준다.** 알림을 띄우려는 순간에 권한 대화상자를
 * 올리면 사용자는 무엇에 동의하는지 모른 채 거절한다. 묻는 것은 웹이 맥락을 아는
 * 자리에서 `notify-permission` 으로 따로 한다.
 */
export async function showLocalNotification(args: {
  title: string;
  body?: string;
  secondsFromNow?: number;
}): Promise<BridgeResult> {
  // 권한 조회도 try 안에서 한다. 밖에 두면 알림 모듈이 실패했을 때 예외가 셸까지 올라가
  // reply() 가 불리지 않고, notify-local 응답이 웹 타임아웃까지 끊긴다.
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return { ok: false, reason: '알림 권한이 없어요.' };

    await Notifications.scheduleNotificationAsync({
      content: { title: args.title, body: args.body },
      trigger:
        args.secondsFromNow && args.secondsFromNow > 0
          ? {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: args.secondsFromNow,
            }
          : null,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : '알림을 띄우지 못했어요.' };
  }
}

/**
 * 안드로이드 알림 채널.
 *
 * 채널이 없으면 안드로이드 8+ 에서 알림이 **조용히 버려진다**. 앱이 뜰 때 한 번 만든다.
 */
export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: '기본',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#1ED760',
  }).catch(() => undefined);
}
