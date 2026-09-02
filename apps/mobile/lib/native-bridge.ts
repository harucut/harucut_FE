import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { PermissionsAndroid, Platform, Share } from 'react-native';

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
  | { type: 'camera-permission'; id: string }
  | { type: 'notify-local'; id: string; title: string; body?: string; secondsFromNow?: number }
  | { type: 'theme'; scheme: 'light' | 'dark' }
  | { type: 'save-begin'; id: string; filename: string; mime: string; total: number }
  | { type: 'save-chunk'; id: string; index: number; data: string }
  | { type: 'save-end'; id: string }
  | { type: 'share'; id: string; title?: string; message?: string; url: string }
  | { type: 'haptic'; style?: 'light' | 'medium' | 'heavy' };

/**
 * 실패 사유 중 **사용자에게 그대로 보여도 되는** 것에만 붙는 표식.
 *
 * `reason` 에는 두 가지가 섞여 들어온다 — 우리가 한국어로 쓴 안내와, catch 로 주워 온 네이티브
 * 원문(영문·기기별 문구)이다. 웹은 둘을 가릴 값이 없어 저장 실패를 전부 일반 `Error` 로 바꾸고
 * (apps/web/lib/canvas/composeFrame.ts), `getUserFacingApiErrorMessage()` 는 일반 Error 의
 * message 를 일부러 버린다(apps/web/lib/apiError.ts 의 getServerMessage). 그래서 **재시도로는
 * 절대 풀리지 않는** 권한 거절에도 `잠시 후 다시 시도해 주세요.` 만 뜬다.
 *
 * 코드가 붙은 실패만 웹이 믿고 `reason` 을 그대로 띄운다. 코드가 없으면 지금처럼 폴백 문구다.
 * 짝은 apps/web/lib/nativeBridge.ts — 프로토콜이므로 같이 고친다.
 */
export type BridgeFailureCode =
  /** 설정에서 켜야 한다. 다시 물어도 대화상자가 뜨지 않으므로 재시도 안내는 거짓말이 된다. */
  | 'photo-permission-blocked'
  /** 이번에 거절했다. 다음에 다시 물을 수 있다. */
  | 'photo-permission-denied';

export type BridgeResult = {
  ok: boolean;
  reason?: string;
  code?: BridgeFailureCode;
  value?: string;
};

/** 조각을 모으는 중인 저장 요청 하나. */
type Transfer = {
  filename: string;
  total: number;
  chunks: string[];
  receivedChars: number;
  startedAt: number;
  /** 상한을 넘겨 더 받지 않기로 한 전송. save-end 가 이 문구를 그대로 돌려준다. */
  rejectedReason?: string;
};

/**
 * 웹이 base64 로 쪼개 보내는 저장 요청을 모은다.
 *
 * `save-begin` 뒤에 `save-end` 가 **오지 않는 경우가 있다** — WebView 가 이동·새로고침되거나
 * 콘텐츠 프로세스가 죽으면 웹 쪽 약속은 사라지지만, 이 맵은 모듈 수준이라 셸이 WebView 만
 * 다시 띄우는 동안에도 그대로 살아남는다. 그러면 저장을 다시 시도할 때마다 이미지 한 장이
 * 통째로 새 id 로 쌓여 앱 메모리가 계속 늘어난다.
 *
 * 그래서 셋을 둔다 — 시간이 지난 것 걷어내기(TRANSFER_TTL_MS), 셸의 명시적 취소
 * (cancelTransfers), 받는 양의 상한(MAX_TRANSFER_BYTES).
 */
const transfers = new Map<string, Transfer>();

/**
 * 미완료 전송을 버리는 기준 시간.
 *
 * 웹은 조각을 다 보낸 뒤 120초까지만 답을 기다린다(apps/web/lib/nativeBridge.ts 의
 * nativeSaveImageBlob). 그보다 오래 남은 전송은 이어 붙여도 받을 사람이 없다.
 */
const TRANSFER_TTL_MS = 120_000;

/**
 * 한 번에 받을 수 있는 크기.
 *
 * 웹은 522240 바이트(510KB)씩 잘라 base64 로 싣는다(apps/web/lib/nativeBridge.ts 의
 * CHUNK_SIZE). 4컷 결과 PNG 는 수 MB 라 24MB 면 넉넉하고, 그보다 큰 요청은 정상 흐름이
 * 아니다 — 조각을 계속 받아 두면 그대로 앱 메모리가 된다.
 * base64 는 3바이트를 4글자로 늘리므로 문자 수로 견줄 때는 같은 비율로 올려 잡는다.
 */
const CHUNK_BYTES = 510 * 1024;
const MAX_TRANSFER_BYTES = 24 * 1024 * 1024;
const MAX_TRANSFER_CHUNKS = Math.ceil(MAX_TRANSFER_BYTES / CHUNK_BYTES);
const MAX_TRANSFER_CHARS = Math.ceil(MAX_TRANSFER_BYTES / 3) * 4;

const NO_DATA_REASON = '저장할 데이터를 받지 못했어요.';
const TOO_LARGE_REASON = '이미지가 너무 커서 저장할 수 없어요.';

/**
 * 시간이 지난 전송을 걷어낸다.
 *
 * 타이머를 걸지 않는다 — 모듈 수준 타이머는 앱이 사는 내내 남는다. 맵이 자라는 자리
 * (beginTransfer)와 비우는 자리(saveBase64Chunks)에서만 훑으면 충분하다.
 */
function sweepExpiredTransfers() {
  const now = Date.now();
  transfers.forEach((transfer, id) => {
    if (now - transfer.startedAt > TRANSFER_TTL_MS) transfers.delete(id);
  });
}

/**
 * 진행 중인 전송을 전부 버린다.
 *
 * 셸이 **문서가 실제로 사라질 때만** 부른다(components/harucut-web-shell.tsx). 다섯 자리다 —
 * 새 문서 로드(onLoadStart), 콘텐츠 프로세스 종료, 로드 실패(onError·5xx), 렌더 프로세스
 * 사망과 `다시 시도`(둘 다 remountWebView). 그 시점의 조각은 보낸 문서가 이미 사라져 이어
 * 붙일 수도, 답을 돌려줄 수도 없다.
 *
 * 같은 문서 안의 기록 갱신(pushState·replaceState)에서는 부르지 않는다. 안드로이드가 그때도
 * onLoadStart 를 쏘지만 웹의 약속은 아직 살아 있어, 끊으면 정상 저장이 실패한다.
 */
export function cancelTransfers() {
  transfers.clear();
  // 셸이 이걸 부르는 시점이 곧 진행 중이던 저장이 답을 돌려줄 수 없게 된 시점이다.
  void sweepStaleTempDirs();
}

function safeFilename(name: string) {
  // 사용자 표시 이름이 그대로 파일명이 된다 — 경로 구분자와 금지 문자를 걷어낸다.
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : `harucut-${Date.now()}.png`;
}

/**
 * 권한 거절 하나를 사용자가 읽을 수 있는 실패로 바꾼다.
 *
 * 가르는 값은 `canAskAgain` 하나다 — 다시 물을 수 있으면 재시도 안내, 아니면 설정 안내.
 * 두 문구가 갈라지지 않게 한 자리에 둔다.
 */
function photoPermissionFailure(canAskAgain: boolean): BridgeResult {
  return canAskAgain
    ? { ok: false, reason: '사진첩 저장 권한이 필요해요.', code: 'photo-permission-denied' }
    : { ok: false, reason: '설정에서 사진 접근을 허용해 주세요.', code: 'photo-permission-blocked' };
}

/**
 * 사진첩 쓰기 권한. 저장만 할 것이므로 writeOnly 로 요청한다 —
 * 전체 사진 접근을 요구하면 사용자가 거절하기 쉽고 스토어 심사에서도 과한 요청이 된다.
 *
 * 두 실패에 code 를 단다(BridgeFailureCode). 여기서만 나오는 문구가 사용자가 **무엇을 해야
 * 하는지** 아는 유일한 자리라, 웹까지 그대로 가야 한다.
 *
 * 거절 뒤의 갈림은 **요청 결과의** canAskAgain 으로 판정한다. 묻기 전 값은 이 자리에서 늘
 * true 다(위에서 걸러진다) — 그것으로 가르면 방금 거절한 사람이 전부 denied 로 떨어진다.
 * iOS 는 첫 거절에서 곧바로, 안드로이드는 `다시 묻지 않음`을 고른 순간 이 값이 false 로
 * 뒤집히고 그때부터 대화상자가 다시 뜨지 않는다. 그 사용자에게 `사진첩 저장 권한이 필요해요.`
 * 만 보내면 **설정으로 가야 한다는 유일한 안내가 다음 저장 시도까지 사라진다.**
 */
async function ensurePermission(): Promise<BridgeResult> {
  const current = await MediaLibrary.getPermissionsAsync(true);
  if (current.granted) return { ok: true };
  // 묻기 전에 이미 막혀 있다. 요청해 봐야 대화상자가 뜨지 않으므로 묻지 않는다.
  if (!current.canAskAgain) return photoPermissionFailure(false);

  const asked = await MediaLibrary.requestPermissionsAsync(true);
  return asked.granted ? { ok: true } : photoPermissionFailure(asked.canAskAgain);
}

/**
 * 저장 한 번에 쓰는 임시 폴더. 요청마다 다르다.
 *
 * 캐시 바로 밑에 두면 경로가 표시 이름 하나로 정해진다. 기록 화면은 **누른 카드의 버튼만**
 * 잠그고(apps/web/app/history/page.tsx 의 downloadingId) 같은 이름의 기록도 허용하므로
 * (lib/fourcutOutput.ts 의 buildDownloadFilename 은 표시 이름만 쓴다), 이름이 같은 두 저장이
 * 겹치면 downloadAsync 가 서로의 파일을 덮어쓰고 먼저 끝난 쪽의 finally 가 아직 저장 중인
 * 파일을 지운다 — 한쪽이 실패하거나 **남의 사진이 사진첩에 들어간다.**
 *
 * 사진첩에 남는 이름은 표시 이름 그대로여야 하므로(safeFilename) 파일명이 아니라 폴더를 가른다.
 * 웹이 준 요청 id 를 쓰지 않는 이유는 그것도 경로가 되기 때문이다 — 표시 이름과 똑같이
 * 씻어야 한다. 앱은 한 프로세스라 여기서 만든 값이면 충돌하지 않는다.
 */
let tempDirSeq = 0;
const TEMP_ROOT = `${FileSystem.cacheDirectory}harucut-save/`;

function newTempDir() {
  tempDirSeq += 1;
  return `${TEMP_ROOT}${Date.now()}-${tempDirSeq}/`;
}

/**
 * 지난 실행이 남긴 임시 폴더를 걷는다.
 *
 * 저장 함수는 `finally` 에서 자기 폴더를 지우지만, 저장이 **중간에 끊기면**(문서 교체·콘텐츠
 * 프로세스 사망·앱 종료) 그 promise 가 영영 끝나지 않아 `finally` 가 돌지 않는다. 그러면 잎
 * 폴더가 그대로 남고, 시도할 때마다 하나씩 쌓인다.
 *
 * 나이는 폴더 이름 앞의 `Date.now()` 로 잰다 — 새 상태값이 필요 없다. TTL 은 전송 만료와 같은
 * 값을 쓴다(디스크와 메모리의 기준이 갈리지 않게).
 *
 * **폴더째 지우지 않는다.** 다른 요청이 지금 그 아래에 내려받는 중일 수 있어, 통째로 지우면
 * 멀쩡히 되던 저장이 실패로 바뀐다. 나이 필터가 그것을 막는다.
 *
 * 모듈 수준 타이머는 두지 않는다(앱이 사는 내내 남는다). 저장이 시작되는 순간이 곧 지난
 * 찌꺼기를 되찾을 수 있는 순간이라, 그때 훑는다.
 */
async function sweepStaleTempDirs() {
  try {
    const names = await FileSystem.readDirectoryAsync(TEMP_ROOT);
    const now = Date.now();
    await Promise.all(
      names.map(async (name) => {
        const startedAt = Number(name.split("-")[0]);
        if (!Number.isFinite(startedAt)) return;
        if (now - startedAt <= TRANSFER_TTL_MS) return;
        await FileSystem.deleteAsync(`${TEMP_ROOT}${name}`, { idempotent: true });
      }),
    );
  } catch {
    // 폴더가 아직 없거나 읽지 못하는 것은 정상이다 — 쓸기가 저장을 막지 않는다.
  }
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
  void sweepStaleTempDirs();
  const dir = newTempDir();
  const target = `${dir}${safeFilename(filename)}`;

  try {
    // downloadAsync 는 폴더를 만들어 주지 않는다.
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const downloaded = await FileSystem.downloadAsync(url, target);
    if (downloaded.status !== 200) {
      return { ok: false, reason: `이미지를 받지 못했어요 (${downloaded.status})` };
    }
    return await saveLocalFile(downloaded.uri);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : '이미지를 받지 못했어요.' };
  } finally {
    /*
      내려받은 파일은 성공 여부와 무관하게 폴더째 지운다.

      downloadAsync 는 상태 코드를 보지 않고 응답 본문을 그대로 target 에 쓴다. 사진 URL 이
      만료돼 403 이 오면 그 오류 본문이 캐시 파일로 남는데, 위에서 조기 반환하면
      saveLocalFile 의 finally 를 거치지 않아 지울 곳이 없다 — 재시도할 때마다 쌓인다.
      성공 경로는 saveLocalFile 이 안의 파일을 이미 지운 뒤라 빈 폴더만 사라진다.
      요청마다 다른 폴더이므로 같이 도는 다른 저장을 건드리지 않는다.
    */
    void FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => undefined);
  }
}

/** 웹이 만든 결과물(base64 조각)을 이어 붙여 사진첩에 넣는다. */
export async function saveBase64Chunks(
  id: string,
  filename: string,
): Promise<BridgeResult> {
  // 웹이 이미 포기한(120초) 요청을 뒤늦게 저장하면, 실패했다고 들은 사진이 한참 뒤에
  // 사진첩에 나타난다. 여기서도 한 번 걷어낸다.
  sweepExpiredTransfers();
  void sweepStaleTempDirs();

  const transfer = transfers.get(id);
  transfers.delete(id);

  if (!transfer) return { ok: false, reason: NO_DATA_REASON };
  if (transfer.rejectedReason) return { ok: false, reason: transfer.rejectedReason };
  if (transfer.chunks.filter(Boolean).length !== transfer.total) {
    return { ok: false, reason: '이미지 조각이 일부 사라졌어요. 다시 시도해 주세요.' };
  }

  // 여기도 요청마다 다른 폴더를 쓴다 — 표시 이름이 같은 두 저장이 겹칠 수 있다(newTempDir).
  const dir = newTempDir();
  const target = `${dir}${safeFilename(filename)}`;

  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.writeAsStringAsync(target, transfer.chunks.join(''), {
      encoding: FileSystem.EncodingType.Base64,
    });
    return await saveLocalFile(target);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : '저장에 실패했어요.' };
  } finally {
    // 이어 붙이다 실패하면 saveLocalFile 까지 가지 못해 지울 곳이 없었다. 폴더째 지운다.
    void FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => undefined);
  }
}

/** 받기 전에 거절할 요청인가. 거절 사유가 없으면 undefined. */
function rejectionFor(total: number) {
  // total 이 정수가 아니거나 0 이하면 new Array(total) 이 던진다 — 그 예외는 셸의 onMessage
  // 밖으로 빠져나가 save-end 가 답을 못 받고, 웹 버튼이 타임아웃까지 묶인다.
  if (!Number.isInteger(total) || total <= 0) return NO_DATA_REASON;
  if (total > MAX_TRANSFER_CHUNKS) return TOO_LARGE_REASON;
  return undefined;
}

export function beginTransfer(id: string, filename: string, total: number) {
  // 맵이 자라는 유일한 자리다. 새 전송을 받는 김에 지난 것을 정리한다.
  sweepExpiredTransfers();
  void sweepStaleTempDirs();

  const rejectedReason = rejectionFor(total);

  transfers.set(id, {
    filename,
    total,
    // 거절한 전송은 자리를 잡아 두지 않는다 — save-end 가 이유만 돌려주고 지운다.
    chunks: rejectedReason ? [] : new Array<string>(total),
    receivedChars: 0,
    startedAt: Date.now(),
    rejectedReason,
  });
}

export function pushChunk(id: string, index: number, data: string) {
  const transfer = transfers.get(id);
  if (!transfer || transfer.rejectedReason) return;
  if (!Number.isInteger(index) || index < 0 || index >= transfer.total) return;
  // 같은 조각이 두 번 오면 크기를 두 번 세지 않는다.
  if (transfer.chunks[index] !== undefined) return;

  const received = transfer.receivedChars + data.length;
  if (received > MAX_TRANSFER_CHARS) {
    // total 은 작게 알려 놓고 조각만 크게 보내는 경우까지 막는다. 이미 받은 것도 버려야
    // 상한이 실제 메모리 상한이 된다.
    transfer.chunks = [];
    transfer.receivedChars = 0;
    transfer.rejectedReason = TOO_LARGE_REASON;
    return;
  }

  transfer.chunks[index] = data;
  transfer.receivedChars = received;
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
 * 카메라 **런타임 권한**. 웹이 파일 선택기를 열기 전에 부른다.
 *
 * 왜 웹이 못 하나: 이건 웹 권한이 아니라 **안드로이드 앱 권한**이다. 우리는 `app.json` 에
 * `android.permission.CAMERA` 를 선언해 두었는데(촬영 화면의 `getUserMedia` 가 그걸
 * 요구한다), react-native-webview 는 「매니페스트에 선언돼 있는데 아직 안 받았다」이면
 * 파일 선택기에서 **카메라 항목을 통째로 뺀다**
 * (`RNCWebViewModuleImpl.java:216` 의 `if (!needsCameraPermission())`).
 *
 * 그래서 촬영 화면을 한 번도 안 쓴 사용자는 「사진 올리기」에서 갤러리만 보게 된다 —
 * 「사진 찍기」가 아예 없다. 권한을 미리 받아 두면 그 항목이 돌아온다.
 *
 * iOS 는 이 개념이 없다(선택기가 시스템 것이고 카메라는 그때 따로 묻는다). 그래서
 * 안드로이드가 아니면 **아무것도 안 하고 성공으로 답한다** — 웹이 플랫폼을 몰라도 되게.
 *
 * 거절해도 실패로 보지 않는다. 갤러리는 그대로 열리므로 사용자는 하려던 일을 계속할 수
 * 있다. 여기서 실패를 돌려주면 호출부가 선택기를 아예 안 여는 쪽으로 흐르기 쉽다.
 */
export async function ensureCameraPermission(): Promise<BridgeResult> {
  if (Platform.OS !== 'android') return { ok: true };

  try {
    const already = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.CAMERA,
    );
    if (already) return { ok: true };

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: '카메라 권한',
        message: '사진을 고를 때 그 자리에서 찍을 수 있게 해요.',
        buttonPositive: '확인',
        buttonNegative: '나중에',
      },
    );

    return { ok: result === PermissionsAndroid.RESULTS.GRANTED };
  } catch {
    return { ok: false };
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
