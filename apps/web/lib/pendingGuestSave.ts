"use client";

import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import type { FrameId } from "@/constants/frames";
import { newIdempotencyKey } from "@/lib/composeApi";
import type { FourcutFilterId } from "@/lib/frameFilters";

/**
 * 비회원이 만든 네컷을 로그인 뒤 기록으로 옮기기 위한 보관소.
 *
 * 담는 것은 **완성본이 아니라 원본 4장과 만드는 방법**이다. 이유는 둘이다.
 *  1. 완성본을 서버에 등록하는 API 가 없어졌다(405). 지금 결과물을 남기는 유일한 길은
 *     원본 4장을 올려 서버가 그리게 하는 것이라, 보관해야 할 것도 그 재료다.
 *  2. 덤으로 결과가 좋아진다 — 로그인 후 서버가 전체 해상도로 다시 그리므로,
 *     비회원 때 브라우저가 iOS 캔버스 상한에 맞춰 줄여 그린 그림보다 크다.
 *
 * OAuth 는 전체 페이지 리다이렉트라 메모리로는 유실된다. 그래서 디스크에 남긴다.
 *
 * **어디에 남기나 — localStorage 가 아니라 IndexedDB 다.**
 *
 * 예전에는 data URL 문자열을 localStorage 에 담았다. 실제 브라우저에서 재 보니 그 길은
 * 이미 막혀 있었다(2026-09, Chromium·WebKit 실측).
 *  - localStorage 한도: **4.75MB** (두 엔진이 같다)
 *  - 슬롯 크기(1700×2400) q=0.92 사진 JPEG 한 장을 data URL 로: **1.50MB / 2.31MB**
 *  - 네 장이면 **5.85MB / 9.02MB** → 쓰는 순간 `QuotaExceededError`
 * 즉 정상적으로 찍은 네컷은 **거의 매번** 보관에 실패했고, 예전 코드는 그 예외를 삼키고
 * false 만 돌려줘 인계가 조용히 사라졌다.
 *
 * 더 줄이는 것은 답이 아니다. 촬영은 이미 슬롯 크기까지만 담고 있고
 * (app/shoot/capture/_hooks/useCaptureFlow.ts 의 `outputScale`), 그 아래로 줄이면 이 PR 이
 * 없애려던 서버 확대가 그대로 돌아온다. 그래서 **저장소를 바꾼다** — IndexedDB 는 base64
 * +33% 가 없는 Blob 을 그대로 담고, 5MB 벽도 없다.
 *
 * 바깥에서 보이는 모양은 그대로다. 들어오고 나가는 `sources` 는 화면이 들고 있는 data URL
 * 그대로이고(변환은 이 파일 안에서만 한다), 달라진 것은 **API 가 비동기라는 것 하나**다.
 * 호출부는 전부 effect·이벤트 핸들러 안이라 그대로 `await` 하면 된다
 * (components/guest/GuestTrialBridge.tsx, app/shoot/result/page.tsx).
 *
 * IndexedDB 를 못 쓰는 자리(사생활 보호 모드, 저장소 차단)에서는 **닫힌 실패**로 끝낸다 —
 * false·null 을 돌려주고, 호출부가 "먼저 내려받으라"고 안내한다. 없애려는 것은 실패가
 * 아니라 **조용한 실패**다.
 */
const DB_NAME = "harucut-pending-guest-save";
const DB_VERSION = 1;
const STORE_NAME = "entry";
/** 보관물은 항상 한 벌이다 — 새로 찍으면 통째로 갈아 끼운다. */
const RECORD_KEY = "current";

/**
 * 예전 localStorage 보관물. v1 은 완성본 PNG, v2 는 data URL 4장이다.
 *
 * 보관·삭제할 때 같이 걷어낸다. v2 는 **한 번 더 읽어 준다** — 이 변경이 배포되는 순간
 * 이미 보관물을 들고 로그인하러 간 사람이 있고, 그 사람의 인계를 우리 사정으로 버릴 이유가
 * 없다. 새로 쓰는 곳은 IndexedDB 하나뿐이다.
 */
const LEGACY_KEY_V1 = "harucut:pending-guest-save:v1";
const LEGACY_KEY_V2 = "harucut:pending-guest-save:v2";

/**
 * 보관물의 유효 기간. 넘으면 없는 것으로 본다.
 *
 * 없으면 몇 주 전 사진이 오늘 기록으로 저장된다 — 사용자는 방금 찍은 것을 기대하는데
 * 남의 얼굴이 튀어나올 수도 있다(공용 기기). 하루면 "찍고 로그인"을 마치기에 넉넉하다.
 */
export const PENDING_GUEST_SAVE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 기기 시계가 앞서 있어도 봐주는 폭. 이보다 더 미래면 값이 성하지 않은 것으로 본다.
 * 미래 시각을 그대로 두면 `now - savedAt` 이 늘 음수라 기한이 영영 안 온다.
 */
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export type PendingGuestSave = {
  /** 고른 순서 그대로의 원본 4장(data URL). 이 순서가 곧 슬롯 순서다. */
  sources: string[];
  frameId: FrameId;
  remoteFrameId: number | null;
  outputFilter: FourcutFilterId;
  displayName: string;
  /**
   * 비회원이 고른 배경색(`#RRGGBB`).
   *
   * 비회원 결과물은 브라우저가 이 색으로 그린다. 이 값을 빼고 인계하면 로그인 후
   * 서버 합성이 색 없이 나가고, 서버는 **프레임에 저장된 배경**으로 그린다 —
   * 방금 내려받아 본 그림과 기록에 남는 그림의 배경색이 갈린다.
   *
   * 선택 필드다. 이 필드가 없던 시절의 보관물은 `undefined` 로 읽히고, 그때는
   * 색을 안 보내던 예전 동작 그대로 간다.
   */
  backgroundColor?: string;
  /**
   * 이 보관물을 인계할 때 쓰는 서버 합성 멱등키.
   *
   * 인계는 **한 번에 끝나지 않을 수 있다.** 서버 합성이 이미 성공한 뒤에도 폴링이 시간
   * 초과되거나 뒤따르는 조회가 실패할 수 있고, 그때 호출부는 다시 해 볼 만한 실패로 보고
   * 보관물을 남긴다(components/guest/GuestTrialBridge.tsx). 키가 없으면 다음 시도가 새
   * 키로 접수돼 **같은 네컷이 보관함에 한 벌 더** 생긴다. 같은 키를 다시 보내면 서버가
   * 이미 만든 작업을 그대로 재생한다.
   *
   * 값은 `ensurePendingGuestSaveComposeKey` 가 인계 직전에 심는다. 보관물과 수명을 같이
   * 하므로 다른 네컷에 새는 일이 없다 — 인계가 끝나면 보관물째 지워지고, 새로 찍은 네컷은
   * `setPendingGuestSave` 가 보관물을 통째로 갈아 끼운다.
   *
   * 배경색과 같은 선택 필드다. 이 필드가 없던 시절의 보관물은 `undefined` 로 읽히고,
   * 그때 처음 인계하며 키를 심는다.
   */
  composeIdempotencyKey?: string;
  savedAt: number;
};

/** IndexedDB 에 실제로 들어가는 모양. 원본만 Blob 이고 나머지는 그대로다. */
type StoredRecord = Omit<PendingGuestSave, "sources"> & { sources: Blob[] };

/** 서버가 받는 배경색 형식. 어긋나면 400 이라 보내지 않는 편이 낫다. */
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** 서버가 받는 멱등키 길이 상한(lib/composeApi.ts). 넘으면 400 이라 없는 것으로 본다. */
const MAX_IDEMPOTENCY_KEY_LENGTH = 64;

/** `data:<mime>[;base64],` 머리. 그룹 1 이 MIME, 그룹 2 가 base64 여부다. */
const DATA_URL_PATTERN = /^data:([^;,]*)(;base64)?,/;

/**
 * 열기가 영영 안 끝날 때 끊는 시간.
 *
 * 사파리·사생활 보호 모드에서 `open` 이 성공도 실패도 하지 않고 멎는 사례가 있다. 그러면
 * 호출부의 `await` 가 영원히 걸려 "로그인하고 저장하기" 버튼이 돌기만 한다 — 조용한 실패
 * 중에서도 제일 나쁜 쪽이라, 못 쓰는 것으로 보고 닫는다.
 */
const OPEN_TIMEOUT_MS = 5_000;

/** 저장소를 연다. 못 쓰는 환경이면 예외 대신 null — 호출부가 닫힌 실패로 처리한다. */
function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  let factory: IDBFactory | null = null;
  try {
    factory = window.indexedDB ?? null;
  } catch {
    // 저장소를 막아 둔 브라우저는 속성을 읽는 것만으로 던진다.
    return Promise.resolve(null);
  }
  if (!factory) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const settle = (db: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(db);
    };
    const timer = window.setTimeout(() => settle(null), OPEN_TIMEOUT_MS);

    let request: IDBOpenDBRequest;
    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch {
      settle(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      // 타임아웃(또는 onblocked)으로 이미 끝난 뒤에 열리는 수가 있다 — Safari 에서 흔하다.
      // 그때 받은 연결은 아무도 안 닫아서, 다음 버전 올림이나 삭제를 계속 막는다.
      if (settled) {
        try {
          request.result.close();
        } catch {
          // 이미 닫혔거나 못 닫으면 더 할 일이 없다.
        }
        return;
      }
      settle(request.result);
    };
    request.onerror = () => settle(null);
    // 다른 탭이 옛 버전을 붙잡고 있으면 열리지 않는다. 기다리지 않고 닫힌 실패로 본다.
    request.onblocked = () => settle(null);
  });
}

/**
 * 트랜잭션 하나를 돌리고 요청 결과를 돌려준다.
 *
 * 요청의 `onsuccess` 가 아니라 **트랜잭션의 `oncomplete`** 를 기다린다. 용량 초과처럼
 * 실제로 못 쓴 경우는 요청이 아니라 트랜잭션이 끝날 때 드러나서, 요청만 보고 성공이라고
 * 하면 예전 localStorage 때와 똑같이 "썼다고 말하고 안 남는" 실패가 된다.
 */
function runTransaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    let request: IDBRequest<T>;
    try {
      transaction = db.transaction(STORE_NAME, mode);
      request = run(transaction.objectStore(STORE_NAME));
    } catch (error) {
      reject(error);
      return;
    }

    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("indexeddb transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("indexeddb transaction failed"));
  });
}

/** 연 것은 반드시 닫는다 — 열어 둔 채로 두면 다음 버전 올리기가 막힌다. */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDatabase();
  if (!db) return null;
  try {
    return await runTransaction(db, mode, run);
  } finally {
    db.close();
  }
}

/** data URL 을 Blob 으로. base64 를 벗기는 자리가 여기 하나뿐이라 +33% 가 사라진다. */
async function sourceToBlob(src: string): Promise<Blob> {
  const head = DATA_URL_PATTERN.exec(src);
  if (!head) {
    // data URL 이 아닌 원본(blob:·같은 출처 URL)은 브라우저에 맡긴다.
    const response = await fetch(src);
    return await response.blob();
  }

  const type = head[1] || "application/octet-stream";
  const payload = src.slice(head[0].length);
  if (!head[2]) return new Blob([decodeURIComponent(payload)], { type });

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Blob 을 다시 data URL 로. 합성 경로가 문자열 src 를 받으므로 꺼낼 때 되돌린다. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("blob read failed"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("blob read failed"));
    reader.readAsDataURL(blob);
  });
}

/**
 * 원본을 뺀 나머지 필드를 검사하고 선택 필드를 정리한다. 못 쓰는 보관물이면 null.
 *
 * 원본보다 **먼저** 본다. 기한이 지났거나 모르는 프레임이면 그 자리에서 버리면 되는데,
 * 그 판단 전에 Blob 4장을 문자열로 되돌리면 버릴 것을 굽는 데 수 MB 를 쓴다.
 */
function normalizeMeta(
  parsed: Omit<PendingGuestSave, "sources">,
  now: number,
): Omit<PendingGuestSave, "sources"> | null {
  // 모르는 프레임이면 레이아웃을 못 찾아 합성 직전에 TypeError 로 터진다.
  if (!parsed?.frameId || !FRAME_LAYOUTS[parsed.frameId]) return null;
  /*
    `savedAt` 이 성한 숫자가 아니면 **보관물째 버린다.**

    예전에는 숫자일 때만 기한을 봤다. 그러면 값이 없거나 `NaN`·문자열인 레코드가 기한
    검사를 통째로 건너뛰고 정상으로 돌아온다 — 하루 TTL 이 하려던 「공용 기기에서 앞사람
    사진을 넘겨주지 않는다」가 바로 무력해진다. 마이그레이션한 localStorage 값이나 깨진
    IndexedDB 레코드가 그렇게 될 수 있다.

    미래 시각도 버린다. 기기 시계가 크게 어긋났거나 값이 조작된 것이라, 그대로 두면
    영원히 안 지워진다(작은 오차는 허용한다 — 시계는 늘 조금씩 틀리다).
  */
  if (!Number.isFinite(parsed.savedAt)) return null;

  const age = now - parsed.savedAt;
  if (age > PENDING_GUEST_SAVE_TTL_MS) return null;
  if (age < -CLOCK_SKEW_TOLERANCE_MS) return null;

  // 색이 깨졌으면 없는 것으로 본다. 형식이 어긋난 값을 그대로 실어 보내면
  // 합성 요청이 400 으로 떨어져 보관물 전체를 잃는다.
  const backgroundColor =
    typeof parsed.backgroundColor === "string" &&
    HEX_COLOR_PATTERN.test(parsed.backgroundColor)
      ? parsed.backgroundColor
      : undefined;

  // 멱등키도 같은 이유로 검사한다. 빈 문자열이나 64자를 넘는 값을 실어 보내면 합성
  // 요청이 400 으로 떨어져 보관물 전체를 잃는다 — 그럴 바에는 새로 심는 편이 낫다.
  const composeIdempotencyKey =
    typeof parsed.composeIdempotencyKey === "string" &&
    parsed.composeIdempotencyKey.length > 0 &&
    parsed.composeIdempotencyKey.length <= MAX_IDEMPOTENCY_KEY_LENGTH
      ? parsed.composeIdempotencyKey
      : undefined;

  return { ...parsed, backgroundColor, composeIdempotencyKey };
}

/** 원본 4장이 온전할 때만 쓸모가 있다. 한 장이라도 비면 합성이 안 된다. */
function hasFourSources(sources: unknown, isValid: (src: unknown) => boolean) {
  return (
    Array.isArray(sources) && sources.length === 4 && sources.every(isValid)
  );
}

/**
 * 아직 IndexedDB 로 옮기지 못한 예전 보관물. 없으면 null.
 *
 * **있는데 못 쓰는 것은 읽는 김에 걷어낸다** — 기한이 지났거나, JSON 이 깨졌거나, 모양이
 * 어긋났거나, 모르는 프레임이면 다시 읽어도 결론이 같다. 새로 쓰는 곳은 IndexedDB 하나뿐이라
 * 여기서 안 지우면 그 한 벌이 localStorage 에 영영 남는다(예전 구현은 지웠다).
 */
function readLegacyEntry(now: number): PendingGuestSave | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY_V2);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PendingGuestSave;
    const meta = hasFourSources(
      parsed?.sources,
      (src) => typeof src === "string" && !!src,
    )
      ? normalizeMeta(parsed, now)
      : null;
    if (!meta) {
      clearLegacyEntries();
      return null;
    }
    return { ...meta, sources: parsed.sources };
  } catch {
    // JSON 이 깨진 경우가 여기로 온다. 저장소를 아예 못 읽는 자리라면 지우기도 조용히 끝난다.
    clearLegacyEntries();
    return null;
  }
}

/**
 * 보관한다. 못 담으면 false — 호출부가 "먼저 내려받으라"고 안내한다.
 * 예전 localStorage 보관물(v1 완성본·v2 data URL)이 남아 있으면 같이 걷어낸다.
 *
 * 쓰기가 실제로 남았는지 되읽어 확인한다. "요청이 성공했다"와 "디스크에 남았다"는 다르고,
 * 그 차이를 무시하면 "로그인하면 기록에 저장된다"고 약속해 놓고 아무것도 남지 않는다.
 *
 * **멱등키는 밖에서 받지 않는다.** 보관물을 통째로 갈아 끼우므로 새 네컷은 항상 키 없이
 * 시작하고, 옛 키를 물려받아 서버가 앞사람 그림을 재생하는 일이 생기지 않는다.
 */
export async function setPendingGuestSave(
  entry: Omit<PendingGuestSave, "savedAt" | "composeIdempotencyKey">,
  now: number,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    clearLegacyEntries();
    return await writeRecord({ ...entry, savedAt: now });
  } catch {
    return false;
  }
}

/** 보관물 한 벌을 통째로 쓴다. 되읽어 확인까지 하고 성공 여부를 돌려준다. */
async function writeRecord(entry: PendingGuestSave): Promise<boolean> {
  const sources = await Promise.all(entry.sources.map(sourceToBlob));

  const db = await openDatabase();
  if (!db) return false;
  try {
    await runTransaction(db, "readwrite", (store) =>
      store.put({ ...entry, sources } satisfies StoredRecord, RECORD_KEY),
    );
    // 원본까지 다시 읽을 필요는 없다 — 한 벌이 남았는지만 세어 본다.
    return (await runTransaction(db, "readonly", (store) =>
      store.count(RECORD_KEY),
    )) === 1;
  } finally {
    db.close();
  }
}

/**
 * 꺼낸다. 쓸 수 없는 보관물(모양이 깨졌거나, 기한이 지났거나, 모르는 프레임)은
 * 그 자리에서 지우고 null 을 준다 — 남겨 두면 로그인할 때마다 같은 실패를 반복한다.
 *
 * **읽기 자체가 실패한 경우는 다르다.** 그때는 IndexedDB 쪽만 비우고 예전 localStorage
 * 보관물은 남긴다 — 못 읽은 것과 못 쓰는 것은 다르고, 그 한 벌이 마지막 인계일 수 있다.
 */
export async function getPendingGuestSave(
  now: number = Date.now(),
): Promise<PendingGuestSave | null> {
  if (typeof window === "undefined") return null;
  try {
    const record = await withStore<StoredRecord | undefined>(
      "readonly",
      (store) => store.get(RECORD_KEY),
    );
    // IndexedDB 에 없으면 아직 못 옮긴 예전 보관물을 본다(그쪽도 없으면 null).
    if (!record) return readLegacyEntry(now);

    const meta = normalizeMeta(record, now);
    if (!meta || !hasFourSources(record.sources, isUsableBlob)) {
      await clearPendingGuestSave();
      return null;
    }

    return { ...meta, sources: await Promise.all(record.sources.map(blobToDataUrl)) };
  } catch {
    // 읽기가 깨진 것뿐이다. 여기서 예전 보관물까지 지우면 **읽어 보지도 않은** 인계를 버린다.
    await clearStoredRecord();
    return null;
  }
}

function isUsableBlob(source: unknown) {
  return source instanceof Blob && source.size > 0;
}

/**
 * 이 보관물의 합성 멱등키를 돌려준다. 아직 없으면 그 자리에서 만들어 함께 보관한다.
 * 보관물이 없으면 null — 인계할 것이 없다는 뜻이다.
 *
 * 인계가 끝날 때까지 **같은 키**를 준다. 서버 합성이 성공한 뒤 폴링 시간 초과나 뒤따르는
 * 조회 실패로 인계가 중간에 끊기면 보관물이 남는데, 그때 새 키로 다시 접수하면 같은 네컷이
 * 보관함에 두 벌 남는다. 회원 쪽에서 세션이 키를 들고 있는 것과 같은 이유다
 * (`lib/shootSessionStore.ts` 의 `ensureComposeIdempotencyKey`) — 다만 여기서는 인계가
 * 전체 페이지 리다이렉트와 새로고침을 건너뛰므로 메모리로는 부족해 보관물에 함께 심는다.
 *
 * 되쓰기는 `setPendingGuestSave` 와 달리 **먼저 지우지 않는다.** 지운 뒤 쓰기가 막히면
 * 원본 4장까지 통째로 잃는다 — 키 한 줄 못 남기는 것보다 훨씬 나쁘다. 못 남겼으면
 * 이번 시도에만 쓰고 끝난다(예전 동작 그대로).
 */
export async function ensurePendingGuestSaveComposeKey(
  now: number = Date.now(),
): Promise<string | null> {
  const entry = await getPendingGuestSave(now);
  if (!entry) return null;
  if (entry.composeIdempotencyKey) return entry.composeIdempotencyKey;

  const composeIdempotencyKey = newIdempotencyKey();
  try {
    await writeRecord({ ...entry, composeIdempotencyKey });
  } catch {}

  return composeIdempotencyKey;
}

export async function clearPendingGuestSave(): Promise<void> {
  if (typeof window === "undefined") return;
  clearLegacyEntries();
  await clearStoredRecord();
}

/** IndexedDB 의 한 벌만 지운다. 예전 localStorage 보관물은 건드리지 않는다. */
async function clearStoredRecord(): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(RECORD_KEY));
  } catch {}
}

function clearLegacyEntries(): void {
  try {
    window.localStorage.removeItem(LEGACY_KEY_V1);
    window.localStorage.removeItem(LEGACY_KEY_V2);
  } catch {}
}
