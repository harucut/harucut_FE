"use client";

import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { isFreshSavedAt } from "@/lib/pendingStorageTtl";
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

/**
 * 트랜잭션 한 번의 결말. **「저장소를 못 열었다」와 「열었는데 값이 없다」를 섞지 않는다.**
 *
 * 예전에는 `T | null` 이었다. 못 연 것도 null 이고, 열어서 조회했는데 그 자리에 아무것도
 * 없는 것도 (`store.get` 이 주는 `undefined` 와 함께) 거짓값이라, 읽기 쪽의 `if (!record)`
 * 하나가 둘을 같은 갈래로 흘려보냈다 — 못 연 것이 「확실히 없다」가 됐고, 그 결론은
 * 조건부 삭제(`clearHandoffIfUnchanged`)에서 **삭제 허가**로 쓰였다. 열기 실패는 예외가
 * 아니라서 `readPendingGuestSave` 의 `catch` 가 잡아 주지도 못했다.
 *
 * 그래서 `null` 을 없애고 타입으로 갈라 둔다. 호출부는 둘 중 무엇인지 **고를 수밖에 없다.**
 */
type StoreResult<T> = { opened: true; value: T } | { opened: false };

/** 연 것은 반드시 닫는다 — 열어 둔 채로 두면 다음 버전 올리기가 막힌다. */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<StoreResult<T>> {
  const db = await openDatabase();
  if (!db) return { opened: false };
  try {
    return { opened: true, value: await runTransaction(db, mode, run) };
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
  // 기한 판정의 소유자는 `lib/pendingStorageTtl.ts` 다 — 약관 동의 보관물과 같이 쓴다.
  // 성한 숫자가 아니거나 한참 미래면 보관물째 버린다(그 이유는 그 파일에 있다).
  if (!isFreshSavedAt(parsed.savedAt, now, PENDING_GUEST_SAVE_TTL_MS)) return null;

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
 * 보관물 읽기의 **세 가지 결말**.
 *
 * `null` 하나로 뭉치면 안 되는 자리가 있다. 조건부 삭제(`clearHandoffIfUnchanged`)가 그
 * 자리다 — 저장소를 못 연 것을 「이미 없다」로 읽으면, 확인한 적 없는 새 한 벌을 그대로
 * 지운다. 원본 4장은 거기에만 있어서 되돌릴 수 없다.
 */
export type PendingGuestSaveRead =
  | {
      status: "found";
      entry: PendingGuestSave;
      /**
       * 이 답이 **IndexedDB 를 실제로 열어 확인한** 결과인가.
       *
       * false 면 저장소를 못 연 채 예전 localStorage 한 벌만 읽은 것이다. 인계에는 그대로
       * 쓴다 — 그 한 벌이 사용자에게 남은 마지막 인계일 수 있다. 다만 IndexedDB 에 무엇이
       * 있는지는 **확인한 적이 없다.** 「지워도 되는가」에 이 답을 쓰면 못 연 사이 다른 탭이
       * 갈아 끼운 한 벌을 확인 없이 지운다. 그 질문은 `readPendingGuestSaveForClear` 로 묻는다.
       */
      opened: boolean;
    }
  /** 확실히 없다 — 기한이 지났거나 애초에 없었다. */
  | { status: "empty" }
  /** 있는지 없는지 **알 수 없다** — 저장소를 못 열었거나 읽다 깨졌다. */
  | { status: "unreadable" };

/**
 * **인계를 꺼내는 읽기.** 쓸 수 있는 한 벌이면 무엇이든 준다.
 *
 * 쓸 수 없는 보관물(모양이 깨졌거나, 기한이 지났거나, 모르는 프레임)은 그 자리에서 지우고
 * `empty` 를 준다 — 남겨 두면 로그인할 때마다 같은 실패를 반복한다. 읽기 자체가 실패한
 * 자리는 아무것도 지우지 않는다(아래 `catch` 를 본다).
 *
 * 서버 렌더 중(`window` 없음)은 저장소 자체가 없는 환경이라 `unreadable` 이다 —
 * 「없다」로 답하면 그 판단으로 무언가를 지우게 된다.
 *
 * **이 답을 삭제 근거로 쓰지 않는다.** 저장소를 못 열어도 예전 localStorage 한 벌을 읽어
 * `found` 로 답하기 때문이다(`opened: false`). 지워도 되는지는 `readPendingGuestSaveForClear`
 * 에 묻는다.
 */
export async function readPendingGuestSave(
  now: number = Date.now(),
): Promise<PendingGuestSaveRead> {
  if (typeof window === "undefined") return { status: "unreadable" };
  try {
    const read = await withStore<StoredRecord | undefined>(
      "readonly",
      (store) => store.get(RECORD_KEY),
    );

    // IndexedDB 에 없으면 아직 못 옮긴 예전 보관물을 본다.
    //
    // **저장소를 못 연 자리에서도 본다.** 그 한 벌은 localStorage 에 있어서 IndexedDB 와
    // 상관없이 읽히고, 여기서 곧바로 손을 떼면 읽을 수 있는 인계를 버리는 것이 된다.
    if (!read.opened || !read.value) {
      const legacy = readLegacyEntry(now);
      // `opened` 를 그대로 실어 보낸다. 못 연 채 읽은 한 벌은 인계에는 쓰지만 삭제 근거로는
      // 못 쓴다 — 그 구분을 여기서 잃으면 호출부가 되찾을 방법이 없다.
      if (legacy) return { status: "found", entry: legacy, opened: read.opened };
      // **여기가 갈리는 자리다.** 열려서 「비었다」를 본 것만 `empty` 다. 못 연 것은
      // 있는지 없는지 확인한 적이 없으므로 `unreadable` — 조건부 삭제가 이 답을 보고
      // 손을 떼야, 다른 탭이 방금 갈아 끼운 한 벌이 살아남는다.
      return read.opened ? { status: "empty" } : { status: "unreadable" };
    }

    const record = read.value;
    const meta = normalizeMeta(record, now);
    if (!meta || !hasFourSources(record.sources, isUsableBlob)) {
      await clearPendingGuestSave();
      return { status: "empty" };
    }

    return {
      status: "found",
      entry: { ...meta, sources: await Promise.all(record.sources.map(blobToDataUrl)) },
      // 여기까지 왔다는 것은 저장소를 열고 그 자리를 직접 본 것이다.
      opened: true,
    };
  } catch {
    /*
      **아무것도 지우지 않는다.**

      읽기가 깨졌다는 것은 레코드가 망가졌다는 증거가 아니다. 트랜잭션이 잠깐 중단되거나
      Blob 변환이 실패해도 여기로 온다 — 그때 지우면 사용자가 계정으로 옮기려던 원본 4장의
      **유일한 보관본**이 사라진다. 다음 열기가 성공해도 되살릴 방법이 없고,
      `clearHandoffIfUnchanged` 가 지켜 볼 기회조차 없다.

      정말로 못 쓰는 레코드(메타가 깨졌거나 원본이 4장이 아닌 것)는 위에서 이미 확인하고
      지운다. 그쪽은 읽기가 **성공한** 뒤의 판단이라 근거가 있다.
    */
    return { status: "unreadable" };
  }
}

/**
 * **「지워도 되는가」를 묻는 읽기.** 확인한 것만 근거로 삼는다.
 *
 * 인계를 꺼내는 읽기와 목적이 다르다. 그쪽은 저장소를 못 열어도 예전 localStorage 한 벌을
 * 읽어 `found` 로 답한다 — 읽을 수 있는 인계를 우리 사정으로 버리지 않기 위해서다. 그런데
 * 조건부 삭제(components/guest/GuestTrialBridge.tsx 의 `clearHandoffIfUnchanged`)는
 * `found` + 지문 일치를 **삭제 허가**로 쓴다. 그 답을 그대로 넘기면 IndexedDB 를 한 번도 못
 * 읽은 자리에서 삭제가 진행돼, 그 사이 다른 탭이 갈아 끼운 — 확인한 적 없는 — 한 벌이
 * 사라진다. 원본 4장은 거기에만 있다.
 *
 * 그래서 여기서는 **못 연 것을 전부 `unreadable` 로 접는다.** 모르면 손을 떼는 쪽이 답이다.
 * 두 읽기를 갈라 둔 이유가 이것이라, 삭제를 물을 때는 반드시 이쪽을 부른다.
 *
 * **남는 한계다.** IndexedDB 를 영영 못 여는 자리(사생활 보호 모드)에서는 예전 localStorage
 * 한 벌을 읽어 인계는 되지만 지우지는 못한다. 사용자가 「버리기」를 골라도 남고, 호출부의
 * 안내문("다른 네컷으로 바뀌었어요")은 이 자리에서는 사실과 다르다 — 바뀐 것이 아니라
 * 확인을 못 한 것이다. 영원히 남지는 않는다: 기한(24시간)이 지나면 `readLegacyEntry` 가
 * 읽는 김에 걷어낸다. 안 지워진 것이 남는 쪽과 확인 안 한 원본 4장이 사라지는 쪽 중,
 * 되돌릴 수 있는 쪽을 골랐다.
 */
export async function readPendingGuestSaveForClear(
  now: number = Date.now(),
): Promise<PendingGuestSaveRead> {
  const read = await readPendingGuestSave(now);
  if (read.status === "found" && !read.opened) return { status: "unreadable" };
  return read;
}

export async function getPendingGuestSave(
  now: number = Date.now(),
): Promise<PendingGuestSave | null> {
  const read = await readPendingGuestSave(now);
  return read.status === "found" ? read.entry : null;
}

function isUsableBlob(source: unknown) {
  return source instanceof Blob && source.size > 0;
}

/** 멱등키와 **그 키가 살아남는지**, 그리고 **어느 한 벌에 붙었는지**. */
export type PendingGuestSaveComposeKey = {
  /** 이번 인계에 실어 보낼 멱등키. */
  key: string;
  /**
   * 보관물에 남았는가. false 면 이 페이지에서만 사는 키다 — 새로고침 재시도는 보관물에서
   * 키를 못 찾아 새 키로 접수한다.
   */
  persisted: boolean;
  /**
   * **이 키가 붙은 그 보관물.** 올려 보낼 원본도 여기서 꺼내야 한다.
   *
   * 호출부가 따로 읽어 둔 항목을 쓰면 안 된다. 이 함수는 저장소를 스스로 한 번 읽는데,
   * 그 사이 다른 탭이 새로 찍어 보관물을 갈아 끼웠으면 키는 **새 한 벌**에 붙는다. 그때
   * 호출부가 예전 항목의 원본을 이 키로 올리면, 나중에 새 한 벌을 인계할 때 같은 키가
   * 다시 나와 서버가 예전 작업을 재생한다 — 새로 찍은 네컷 대신 예전 것이 저장된다.
   */
  entry: PendingGuestSave;
};

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
 * 원본 4장까지 통째로 잃는다 — 키 한 줄 못 남기는 것보다 훨씬 나쁘다.
 *
 * **못 남겼으면 못 남겼다고 말한다.** 키 자체는 그대로 돌려준다 — 이번 합성은 키가 없어도
 * 돌고, 여기서 거절하면 될 저장까지 막는다. 대신 `persisted: false` 로 넘긴다. 저장소를
 * 못 열거나(`writeRecord` 가 false) 트랜잭션이 중단되면(예외) 그 키는 새로고침을 못 넘기고,
 * 첫 합성이 이미 서버에 접수된 뒤였다면 재시도가 **다른 키로 같은 네컷을 한 벌 더** 만든다.
 * 그 사실을 삼키면 호출부는 성공한 줄 알고 "새로고침하면 다시 시도해요"라고 안내하면서
 * 중복을 예약하게 된다.
 */
export async function ensurePendingGuestSaveComposeKey(
  now: number = Date.now(),
): Promise<PendingGuestSaveComposeKey | null> {
  const entry = await getPendingGuestSave(now);
  if (!entry) return null;
  // 보관물에서 읽어 온 키다 — 그 자리에 남아 있다는 것이 이미 확인된 셈이다.
  if (entry.composeIdempotencyKey)
    return { key: entry.composeIdempotencyKey, persisted: true, entry };

  const key = newIdempotencyKey();
  // 키를 붙인 그 한 벌을 그대로 돌려준다. 호출부가 「검증한 항목」과 대조할 대상도,
  // 실제로 올릴 원본도 이것이어야 한다 — 위 `entry` 주석을 본다.
  const keyed = { ...entry, composeIdempotencyKey: key };
  try {
    const persisted = await writeRecord(keyed);
    return { key, persisted, entry: keyed };
  } catch {
    // 트랜잭션 중단은 예외로 온다. 못 남은 것은 위 false 와 같으므로 한 갈래로 모은다.
    return { key, persisted: false, entry: keyed };
  }
}

export async function clearPendingGuestSave(): Promise<void> {
  if (typeof window === "undefined") return;
  clearLegacyEntries();
  await clearStoredRecord();
}

/**
 * IndexedDB 의 한 벌만 지운다. 예전 localStorage 보관물은 건드리지 않는다.
 *
 * 지우기 쪽은 `opened` 를 보지 않는다 — 못 열었든 트랜잭션이 중단됐든 결과는 「못 지웠다」
 * 하나이고, 이 함수의 호출부(`clearPendingGuestSave`)는 애초에 성공 여부를 묻지 않는다.
 *
 * **남는 한계다.** 못 지운 것을 지웠다고 답하는 셈이라, 호출부는 「버렸어요」라고 안내한 뒤
 * 다음 로그인에서 같은 보관물을 다시 만난다. 읽기 쪽과 방향이 반대라 위험이 다르다 —
 * 여기서 틀리면 안 지워진 것이 남을 뿐이고, 읽기 쪽에서 틀리면 원본 4장이 사라진다.
 * 삭제 성공을 위로 올리려면 `clearPendingGuestSave` 의 반환형과 그 호출부를 같이 바꿔야
 * 해서, 이 수정에서는 손대지 않았다.
 */
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
