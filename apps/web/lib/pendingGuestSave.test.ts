/**
 * 비회원 결과 보관소. 여기서 조용히 틀리면 사용자는 "로그인하면 기록에 저장된다"는
 * 안내를 받고 로그인했는데 기록에 아무것도 없는 상태를 만난다 — 실제로 그랬다.
 *
 * **jsdom 에는 IndexedDB 가 없다.** 그래서 저장소 쪽은 아래 스텁으로 흉내 낸다(이 모듈이
 * 실제로 쓰는 것만). 스텁으로는 진짜 저장소의 버릇을 증명하지 못하므로, 실제 엔진 확인은
 * 따로 했다 — Chromium·WebKit 영속 프로필에서 슬롯 크기 사진 4장(data URL 7.79MB/10.70MB,
 * Blob 5.84MB/8.02MB)을 넣어 보면 **localStorage 는 QuotaExceededError, IndexedDB 는 성공**
 * 이고 4장이 바이트 그대로 돌아온다.
 *
 * **한도는 jsdom 도 갖고 있다.** jsdom 의 localStorage 는 5,000,000자에서
 * `QuotaExceededError` 를 던진다(실측). 실제 브라우저에서 잰 4.75MB(=4,980,736)와 0.4% 차이라,
 * 아래 "실측 크기 4장" 테스트는 **예전 구현이라면 여기서 그대로 터진다.**
 */
import {
  clearPendingGuestSave,
  ensurePendingGuestSaveComposeKey,
  getPendingGuestSave,
  PENDING_GUEST_SAVE_TTL_MS,
  readPendingGuestSave,
  clearPendingGuestSaveIfUnchanged,
  setPendingGuestSave,
} from "@/lib/pendingGuestSave";

const NOW = 1_700_000_000_000;

async function ensureReadableComposeKey(now: number) {
  const result = await ensurePendingGuestSaveComposeKey(now);
  if (result === "unreadable") throw new Error("보관물을 읽지 못했다");
  return result;
}

/** 모듈이 쓰는 저장 위치. 저장된 모양을 직접 들여다볼 때만 쓴다. */
const STORE_NAME = "entry";
const RECORD_KEY = "current";
const LEGACY_KEY_V2 = "harucut:pending-guest-save:v2";

/** 작지만 진짜인 JPEG data URL 4장. 왕복이 문자열 그대로인지 보려면 진짜여야 한다. */
const SOURCES = [1, 2, 3, 4].map(
  (n) => `data:image/jpeg;base64,${"ABCD".repeat(8 * n)}`,
);

/**
 * 실측 크기의 원본 한 장.
 *
 * 슬롯 크기(1700×2400) q=0.92 사진 JPEG 을 data URL 로 만들면 1.50~2.31MB 였다(엔진별).
 * 네 장이면 5.85~9.02MB 로 localStorage 한도(4.75MB, 두 엔진 동일)를 넘겨
 * `QuotaExceededError` 가 났다 — 이 파일이 막으려는 실패 그 자체다.
 */
const BIG_SOURCE = `data:image/jpeg;base64,${"A".repeat(2_000_000)}`;

/** 실측 localStorage 한도. 위 4장은 이 값을 확실히 넘는다. */
const MEASURED_LOCAL_STORAGE_LIMIT = 4.75 * 1024 * 1024;

const ENTRY = {
  sources: SOURCES,
  frameId: "classic-4" as const,
  remoteFrameId: null,
  outputFilter: "NONE" as const,
  displayName: "harucut_20260821_101500",
};

/* ------------------------------------------------------------------------- *
 * jsdom 용 IndexedDB 스텁 — 이 모듈이 실제로 쓰는 것만 흉내 낸다.
 * ------------------------------------------------------------------------- */

type FakeRequest = { result: unknown; onsuccess?: (() => void) | null };

type FakeObjectStore = {
  put: (value: unknown, key: string) => FakeRequest;
  get: (key: string) => FakeRequest;
  count: (key: string) => FakeRequest;
  delete: (key: string) => FakeRequest;
};

type FakeTransaction = {
  error: Error | null;
  oncomplete: (() => void) | null;
  onabort: (() => void) | null;
  onerror: (() => void) | null;
  objectStore: (name: string) => FakeObjectStore;
};

type FakeOpenRequest = {
  result: unknown;
  onupgradeneeded: (() => void) | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onblocked: (() => void) | null;
};

const store = {
  data: new Map<string, unknown>(),
  hasObjectStore: false,
  /** 열기 자체가 실패한다(사생활 보호 모드 등). 켜 두는 동안 **모든** 열기가 실패한다. */
  openFails: false,
  /**
   * 앞에서부터 이 횟수만큼의 열기만 실패시킨다. `openFails` 로는 못 만드는 자리다.
   *
   * 사고의 조건이 「첫 열기만 실패」이기 때문이다 — 확인 읽기는 저장소를 못 열고, 그 답을
   * 삭제 허가로 쓴 **뒤이은 삭제는 열려서 실제로 지운다.** 통째로 끄고 켜는 플래그로는
   * 그 순간을 흉내 낼 수 없어, 위험한 회귀가 초록불로 지나갔다.
   */
  failNextOpens: 0,
  /** 트랜잭션이 중단된다 — 용량 초과가 드러나는 자리. */
  rejectWrites: false,
  /** 읽기 트랜잭션이 중단된다 — 못 **쓰는** 것이 아니라 못 **읽는** 자리. */
  rejectReads: false,
  /**
   * 중단을 알리면서 `transaction.error` 를 주지 않는다.
   *
   * 지어낸 경우가 아니다. 저장소 디렉터리가 없는 WebKit 컨텍스트(사파리 사생활 보호
   * 모드와 같은 자리)에 Blob 을 넣어 보면 error 이벤트만 오고 `error` 는 null 이었다
   * (2026-09 실측). 그 자리에서 던질 것을 못 만들면 약속이 영영 안 끝난다.
   */
  nullTransactionError: false,
  /** 요청은 받아 놓고 아무것도 안 남긴다 — 되읽어 확인이 없으면 못 잡는 실패. */
  swallowWrites: false,
  /**
   * **읽은 직후 다른 탭이 끼어드는 순간.**
   *
   * `get` 이 결과를 집은 **뒤** 한 번 불린다. 진짜 브라우저에서 다른 탭의 쓰기가 끼어드는
   * 자리가 여기다 — 읽기 트랜잭션이 끝나고 다음 트랜잭션이 열리기 전. 플래그로는 그
   * 순간을 못 만든다.
   */
  afterRead: null as (() => void) | null,
  openCount: 0,
  closeCount: 0,
  /**
   * 다른 탭이 옛 버전을 붙잡고 있어 `onblocked` 이 먼저 오고, 그쪽이 손을 놓으면서
   * **그 뒤에** `onsuccess` 가 오는 모양. Safari 에서 타임아웃 뒤 늦게 열리는 것과 같다.
   */
  openBlocksThenSucceeds: false,
};

function resetStore() {
  store.data = new Map();
  store.hasObjectStore = false;
  store.openFails = false;
  store.failNextOpens = 0;
  store.rejectWrites = false;
  store.rejectReads = false;
  store.nullTransactionError = false;
  store.swallowWrites = false;
  store.openCount = 0;
  store.closeCount = 0;
  store.openBlocksThenSucceeds = false;
  store.afterRead = null;
}

/**
 * 트랜잭션 하나가 만든 요청들. **`onsuccess` 를 실제로 쏘기 위해 모은다.**
 *
 * 진짜 IndexedDB 는 요청마다 `onsuccess` 를 부르고, 그 안에서 같은 트랜잭션에 다음 요청을
 * 이어 붙일 수 있다 — 대조하고 나서 지우는 조건부 삭제가 그 모양이다
 * (`deleteRecordIfMatches`). 예전 스텁은 `result` 만 채우고 `onsuccess` 를 안 불러서,
 * 그 자리에 이어 붙는 코드를 흉내 내지 못했다.
 */
function makeObjectStore(
  mode: IDBTransactionMode,
  requests: FakeRequest[],
): FakeObjectStore {
  const writable = mode === "readwrite" && !store.rejectWrites && !store.swallowWrites;
  const track = <T>(request: FakeRequest & { result: T }) => {
    requests.push(request);
    return request;
  };

  return {
    put: (value, key) => {
      if (writable) store.data.set(key, value);
      return track({ result: undefined });
    },
    get: (key) => {
      const request = track({ result: store.data.get(key) });
      // 결과를 집은 뒤에 부른다 — 이미 읽은 값은 그대로 두고, 저장소만 갈아 끼우게 한다.
      store.afterRead?.();
      return request;
    },
    count: (key) => track({ result: store.data.has(key) ? 1 : 0 }),
    delete: (key) => {
      if (mode === "readwrite" && !store.rejectWrites) store.data.delete(key);
      return track({ result: undefined });
    },
  };
}

function makeTransaction(mode: IDBTransactionMode): FakeTransaction {
  const requests: FakeRequest[] = [];
  const transaction: FakeTransaction = {
    error: null,
    oncomplete: null,
    onabort: null,
    onerror: null,
    objectStore: () => makeObjectStore(mode, requests),
  };
  // 핸들러는 이 함수가 끝난 뒤에 붙는다 — 실제 IndexedDB 처럼 다음 틱에 알린다.
  queueMicrotask(() => {
    if (mode === "readonly" && store.rejectReads) {
      transaction.error = new Error("indexeddb read failed");
      transaction.onabort?.();
      return;
    }
    if (mode === "readwrite" && store.rejectWrites) {
      if (store.nullTransactionError) {
        // WebKit 실측 모양 — error 이벤트만 오고 error 는 null 이다.
        transaction.onerror?.();
        return;
      }
      transaction.error = new Error("QuotaExceededError");
      transaction.onabort?.();
      return;
    }
    /*
      완료를 알리기 **전에** 요청마다 `onsuccess` 를 쏜다. 그 안에서 같은 트랜잭션에 새
      요청이 붙을 수 있으므로(조건부 삭제가 그렇다) 목록을 자라는 대로 훑는다.
    */
    for (let i = 0; i < requests.length; i += 1) {
      requests[i].onsuccess?.();
    }
    transaction.oncomplete?.();
  });
  return transaction;
}

function installFakeIndexedDB() {
  const database = {
    objectStoreNames: { contains: (name: string) => name === STORE_NAME && store.hasObjectStore },
    createObjectStore: () => {
      store.hasObjectStore = true;
    },
    transaction: (_name: string, mode: IDBTransactionMode) => makeTransaction(mode),
    close: () => {
      store.closeCount += 1;
    },
  };

  const factory = {
    open: (): FakeOpenRequest => {
      store.openCount += 1;
      // 몇 번째 열기인지는 부를 때 정해진다 — 마이크로태스크로 미루면 여러 열기가 겹칠 때
      // 어느 쪽이 실패하는지가 흔들린다.
      const failsThisTime = store.openFails || store.failNextOpens > 0;
      if (store.failNextOpens > 0) store.failNextOpens -= 1;
      const request: FakeOpenRequest = {
        result: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        if (failsThisTime) {
          request.onerror?.();
          return;
        }
        if (store.openBlocksThenSucceeds) {
          request.onblocked?.();
          request.result = database;
          // 막혔다고 알린 **뒤에** 열린다. 이미 끝난 약속에 붙은 연결이라 아무도 안 닫는다.
          queueMicrotask(() => request.onsuccess?.());
          return;
        }
        request.result = database;
        if (!store.hasObjectStore) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };

  Object.defineProperty(window, "indexedDB", {
    configurable: true,
    value: factory as unknown as IDBFactory,
  });
}

function removeIndexedDB() {
  Object.defineProperty(window, "indexedDB", {
    configurable: true,
    value: undefined,
  });
}

/** 저장소에 실제로 들어간 한 벌. 없으면 null. */
/**
 * **고른 Blob 만 못 읽게 한다.**
 *
 * 트랜잭션이 커밋된 **뒤**에 원본 되돌리기가 실패하는 자리를 만들려면, 어느 한 벌을 읽을
 * 때 실패할지 고를 수 있어야 한다. 통째로 끄면 그보다 앞선 읽기부터 무너져 다른 이유로
 * 초록불이 된다.
 */
async function withUnreadableBlobs<T>(
  doomed: Blob[],
  run: () => Promise<T>,
): Promise<T> {
  const Real = window.FileReader;
  class Patched extends Real {
    readAsDataURL(blob: Blob) {
      if (doomed.includes(blob)) {
        queueMicrotask(() => this.dispatchEvent(new ProgressEvent("error")));
        return;
      }
      super.readAsDataURL(blob);
    }
  }
  window.FileReader = Patched as unknown as typeof FileReader;
  try {
    return await run();
  } finally {
    window.FileReader = Real;
  }
}

/** 스텁이 담아 둔 Blob 을 모듈이 돌려주는 모양(data URL)으로 되돌린다. */
function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("blob read failed"));
    reader.readAsDataURL(blob);
  });
}

function storedRecord() {
  return (store.data.get(RECORD_KEY) as
    | { sources: Blob[]; frameId: string; composeIdempotencyKey?: string; recordId?: string }
    | undefined) ?? null;
}

/**
 * 호출부(components/guest/GuestTrialBridge.tsx 의 `clearHandoffIfUnchanged`)의 판단 규칙을
 * 그대로 옮긴 것. 그 파일은 이 테스트의 소유가 아니라 **규칙만 베꼈다** — 여기서 지키려는
 * 것은 「읽기가 그 규칙에 무엇을 먹이는가」다.
 *
 * 지문 대조는 `savedAt` 하나로 줄였다. 실제 `isSameHandoff` 는 표시 이름·프레임까지 보지만,
 * 이 자리에서 갈리는 것은 「사용자에게 물어본 그 한 벌인가」 하나다.
 */
async function clearIfUnchangedLikeBridge(
  promptedSavedAt: number,
  now: number,
): Promise<boolean> {
  const result = await clearPendingGuestSaveIfUnchanged(
    (entry) => entry.savedAt === promptedSavedAt,
    now,
  );
  return result === "cleared";
}

beforeEach(() => {
  window.localStorage.clear();
  jest.restoreAllMocks();
  resetStore();
  installFakeIndexedDB();
});

describe("pendingGuestSave", () => {
  it("같은 밀리초에 같은 메타로 저장해도 쓰기마다 다른 ID를 붙인다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const first = await getPendingGuestSave(NOW);
    await setPendingGuestSave({
      ...ENTRY,
      sources: SOURCES.map((source) => source + "ABCD"),
    }, NOW);
    const second = await getPendingGuestSave(NOW);

    expect(first?.recordId).toEqual(expect.any(String));
    expect(second?.recordId).toEqual(expect.any(String));
    expect(second?.recordId).not.toBe(first?.recordId);
    expect(second?.savedAt).toBe(first?.savedAt);
    expect(second?.displayName).toBe(first?.displayName);
    expect(await clearPendingGuestSaveIfUnchanged(
      (entry) => entry.recordId === first?.recordId,
      NOW,
    )).toBe("changed");
    expect((await getPendingGuestSave(NOW))?.recordId).toBe(second?.recordId);
  });

  it("기존 보관물의 ID는 두 탭이 동시에 읽어도 하나이며 멱등키와 기한은 보존한다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const record = storedRecord();
    if (record) {
      delete record.recordId;
      record.composeIdempotencyKey = "web-existing-compose-key";
    }

    const [left, right] = await Promise.all([
      getPendingGuestSave(NOW),
      getPendingGuestSave(NOW),
    ]);
    expect(left?.recordId).toEqual(expect.any(String));
    expect(right?.recordId).toBe(left?.recordId);
    expect(storedRecord()?.recordId).toBe(left?.recordId);
    expect(left?.composeIdempotencyKey).toBe("web-existing-compose-key");
    expect(right?.savedAt).toBe(NOW);
    expect((await getPendingGuestSave(NOW))?.recordId).toBe(left?.recordId);
  });

  it("기존 보관물에 ID를 붙이는 사이 교체되면 새 보관물의 ID와 원본을 반환한다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const previous = storedRecord();
    if (previous) delete previous.recordId;
    const swapped = [1, 2, 3, 4].map((n) => new Blob([String(n)]));
    store.afterRead = () => {
      store.afterRead = null;
      store.data.set(RECORD_KEY, {
        ...(previous as object),
        recordId: "replacement-record",
        sources: swapped,
      });
    };

    const read = await getPendingGuestSave(NOW);
    expect(read?.recordId).toBe("replacement-record");
    expect(read?.sources).toEqual(await Promise.all(swapped.map(readBlobAsDataUrl)));
    expect(storedRecord()?.recordId).toBe("replacement-record");
  });

  it("기존 보관물의 ID 쓰기가 실패하면 삭제 근거를 반환하지 않는다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const record = storedRecord();
    if (record) delete record.recordId;
    store.rejectWrites = true;

    expect(await readPendingGuestSave(NOW)).toEqual({ status: "unreadable" });
    expect(storedRecord()).not.toBeNull();
    expect(storedRecord()?.recordId).toBeUndefined();

    store.rejectWrites = false;
    expect((await getPendingGuestSave(NOW))?.recordId).toEqual(expect.any(String));
  });

  it("기존 보관물의 원본 변환이 실패해도 확정된 ID로만 조건부 삭제한다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const record = storedRecord();
    if (record) delete record.recordId;
    const blobs = record?.sources ?? [];

    await withUnreadableBlobs(blobs, async () => {
      const read = await readPendingGuestSave(NOW);
      expect(read).toMatchObject({
        status: "unreadable",
        reason: "sources",
        meta: { recordId: expect.any(String) },
      });
      if (read.status !== "unreadable") throw new Error("변환 실패가 재현되지 않았다");
      expect(await clearPendingGuestSaveIfUnchanged(
        (entry) => entry.recordId === read.meta?.recordId,
        NOW,
      )).toBe("cleared");
      expect(storedRecord()).toBeNull();
    });
  });

  it("보관했다가 그대로 돌려준다", async () => {
    expect(await setPendingGuestSave(ENTRY, NOW)).toBe(true);
    expect(await getPendingGuestSave(NOW)).toMatchObject({
      ...ENTRY,
      savedAt: NOW,
    });
  });

  /*
    이 저장소를 바꾼 이유 그 자체.

    원본을 data URL 문자열로 담으면 base64 가 33% 를 더 붙여, 실측 4장이 5.85MB(Chromium)~
    9.02MB(WebKit) 였다 — 한도 4.75MB 를 넘겨 매번 QuotaExceededError 였다. Blob 으로 담으면
    그 33% 가 사라지고, IndexedDB 에는 그 벽도 없다.

    (크기 자체가 통과하는지는 아래 "실측 크기 4장" 테스트가 본다. 여기서는 **담기는 모양**을
     본다 — Blob 인지, 그 크기가 문자열보다 작은지, localStorage 로는 안 나가는지.)
  */
  it("원본을 base64 문자열이 아니라 Blob 으로 담는다", async () => {
    await setPendingGuestSave(ENTRY, NOW);

    const record = storedRecord();
    const sources = record?.sources ?? [];
    expect(sources).toHaveLength(4);
    expect(sources.every((blob) => blob instanceof Blob)).toBe(true);

    const storedBytes = sources.reduce((sum, blob) => sum + blob.size, 0);
    const dataUrlBytes = SOURCES.reduce((sum, src) => sum + src.length, 0);
    expect(storedBytes).toBeLessThan(dataUrlBytes * 0.8);

    // localStorage 로는 한 글자도 나가지 않는다 — 거기 담는 것이 실패의 원인이었다.
    expect(window.localStorage.length).toBe(0);
  });

  /*
    회귀 — 실제로 찍은 네컷 크기가 그대로 통과해야 한다.

    예전처럼 data URL 을 localStorage 에 담으면 이 4장은 jsdom 에서도 실제 브라우저에서도
    `QuotaExceededError` 다(jsdom 한도 5,000,000자 ≈ 실측 4.75MB). 그때 예전 코드는 예외를
    삼키고 false 만 돌려줘, 사용자는 로그인 뒤 기록이 비어 있는 것만 보게 됐다.
  */
  it("localStorage 한도를 넘는 실측 크기 4장도 온전히 왕복한다", async () => {
    const big = [BIG_SOURCE, BIG_SOURCE, BIG_SOURCE, BIG_SOURCE];
    // 전제 확인 — 이 4장은 실측 한도(4.75MB)를 확실히 넘는다.
    expect(big.reduce((sum, src) => sum + src.length, 0)).toBeGreaterThan(
      MEASURED_LOCAL_STORAGE_LIMIT,
    );
    // 그리고 jsdom 의 localStorage 도 실제로 이 크기를 거부한다.
    expect(() =>
      window.localStorage.setItem("harucut:probe", JSON.stringify(big)),
    ).toThrow();

    expect(await setPendingGuestSave({ ...ENTRY, sources: big }, NOW)).toBe(true);
    expect((await getPendingGuestSave(NOW))?.sources).toEqual(big);
  }, 30_000);

  /*
    저장소를 못 쓰는 자리(사생활 보호 모드, 저장소 차단)에서는 닫힌 실패로 끝낸다.
    없애려는 것은 실패가 아니라 **조용한 실패** — 못 담았으면 못 담았다고 말해야
    호출부가 "먼저 내려받으라"고 안내한다.
  */
  it("IndexedDB 가 없으면 던지지 않고 실패로 답한다", async () => {
    removeIndexedDB();

    expect(await setPendingGuestSave(ENTRY, NOW)).toBe(false);
    expect(await getPendingGuestSave(NOW)).toBeNull();
    expect(await ensurePendingGuestSaveComposeKey(NOW)).toBe("unreadable");
    await expect(clearPendingGuestSave()).resolves.toBeUndefined();
  });

  it("저장소를 열지 못해도 실패로 답한다", async () => {
    store.openFails = true;
    expect(await setPendingGuestSave(ENTRY, NOW)).toBe(false);
    expect(await getPendingGuestSave(NOW)).toBeNull();
  });

  /*
    열기는 **끝났다고 답한 뒤에도** 성공할 수 있다 — 다른 탭이 손을 놓거나(`onblocked`),
    Safari 에서 타임아웃보다 늦게 열리는 경우다. 그때 받은 연결을 안 닫으면 아무도 못 닫는
    연결이 남아, 다음 버전 올림과 삭제를 계속 막는다.
  */
  it("실패로 답한 뒤에 열린 연결도 닫는다", async () => {
    store.openBlocksThenSucceeds = true;

    expect(await setPendingGuestSave(ENTRY, NOW)).toBe(false);
    // 늦은 onsuccess 는 다음 마이크로태스크에 온다.
    await Promise.resolve();
    await Promise.resolve();

    expect(store.closeCount).toBeGreaterThan(0);
  });

  // 용량 초과는 요청이 아니라 **트랜잭션이 끝날 때** 드러난다. 요청만 보고 성공이라 하면
  // 예전 localStorage 때와 똑같이 "저장했다"고 말해 놓고 아무것도 안 남는다.
  it("트랜잭션이 중단되면 실패로 본다", async () => {
    store.rejectWrites = true;
    expect(await setPendingGuestSave(ENTRY, NOW)).toBe(false);
  });

  // 던질 것이 없다고 약속을 그냥 놔 버리면 "로그인하고 저장하기" 버튼이 영영 돈다.
  it("에러 객체 없이 중단돼도 멈추지 않고 실패로 답한다", async () => {
    store.rejectWrites = true;
    store.nullTransactionError = true;
    expect(await setPendingGuestSave(ENTRY, NOW)).toBe(false);
  });

  it("쓰기가 실제로 남지 않으면 실패로 본다", async () => {
    store.swallowWrites = true;
    expect(await setPendingGuestSave(ENTRY, NOW)).toBe(false);
  });

  it("연 저장소는 반드시 닫는다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    await getPendingGuestSave(NOW);
    expect(store.closeCount).toBe(store.openCount);
  });

  it("기한이 지난 보관물은 없는 것으로 보고 지운다", async () => {
    await setPendingGuestSave(ENTRY, NOW);

    const justInside = NOW + PENDING_GUEST_SAVE_TTL_MS - 1;
    expect(await getPendingGuestSave(justInside)).not.toBeNull();

    const expired = NOW + PENDING_GUEST_SAVE_TTL_MS + 1;
    expect(await getPendingGuestSave(expired)).toBeNull();
    // 지웠으므로 시계를 되돌려도 살아나지 않는다.
    expect(await getPendingGuestSave(NOW)).toBeNull();
  });

  // 레이아웃 카탈로그에 없는 프레임이면 합성 직전에 layout undefined 로 터진다.
  it("모르는 프레임이면 버린다", async () => {
    await setPendingGuestSave({ ...ENTRY, frameId: "not-a-frame" as never }, NOW);
    expect(await getPendingGuestSave(NOW)).toBeNull();
  });

  it("원본이 4장이 아니면 버린다", async () => {
    await setPendingGuestSave({ ...ENTRY, sources: SOURCES.slice(0, 2) }, NOW);
    expect(await getPendingGuestSave(NOW)).toBeNull();
  });

  /*
    비회원이 고른 배경색이 곧 저장본의 색이다. 인계에서 빠지면 로그인 후 서버 합성이
    색 없이 나가고, 서버는 프레임에 저장된 배경으로 그린다 — 방금 내려받아 본 그림과
    기록에 남는 그림의 배경색이 갈린다.
  */
  it("고른 배경색을 그대로 돌려준다", async () => {
    await setPendingGuestSave({ ...ENTRY, backgroundColor: "#ffffff" }, NOW);
    expect((await getPendingGuestSave(NOW))?.backgroundColor).toBe("#ffffff");
  });

  // 색이 없던 시절의 보관물도 그대로 살린다. 필수 필드로 만들면 이미 보관된 인계물이
  // 통째로 버려진다.
  it("색이 없는 옛 보관물은 색만 빠진 채 살린다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const stored = await getPendingGuestSave(NOW);
    expect(stored?.backgroundColor).toBeUndefined();
    expect(stored?.sources).toHaveLength(4);
  });

  // 형식이 어긋난 색을 그대로 실어 보내면 합성 요청이 400 으로 떨어져 보관물 전체를 잃는다.
  it("깨진 색은 없는 것으로 본다", async () => {
    await setPendingGuestSave({ ...ENTRY, backgroundColor: "red" }, NOW);
    expect((await getPendingGuestSave(NOW))?.backgroundColor).toBeUndefined();
  });

  /*
    인계는 한 번에 끝나지 않을 수 있다. 서버 합성이 이미 성공했어도 폴링이 시간 초과되거나
    뒤따르는 조회가 실패하면 다시 해 볼 만한 실패로 보고 보관물을 남긴다. 그때 멱등키까지
    새로 만들면 재시도가 예전 작업을 재생하지 못하고 **같은 네컷을 기록에 한 벌 더** 만든다.
  */
  it("한 번 심은 멱등키는 보관물이 살아 있는 동안 그대로 쓴다", async () => {
    await setPendingGuestSave(ENTRY, NOW);

    const first = await ensureReadableComposeKey(NOW);
    expect(typeof first?.key).toBe("string");
    expect(first?.persisted).toBe(true);
    // 보관물에 남았으므로 새로고침 뒤(= 다시 읽어도) 같은 값이다.
    expect((await getPendingGuestSave(NOW))?.composeIdempotencyKey).toBe(first?.key);
    expect(await ensurePendingGuestSaveComposeKey(NOW)).toEqual(first);
  });

  /*
    회귀 — **두 탭이 거의 동시에 확정해도 키는 하나다.**

    나눠서 읽고 쓰면 그 사이가 열린다. 양쪽 모두 「키 없음」을 읽고 서로 다른 키를 만든 뒤
    각자 쓰면, 레코드에는 뒤에 쓴 것만 남지만 **두 탭은 이미 각자의 키로 합성을 접수한**
    뒤다 — 멱등키가 있으나 마나 같은 네컷이 기록에 두 벌 남는다.
  */
  it("두 탭이 동시에 물어도 같은 멱등키를 준다", async () => {
    await setPendingGuestSave(ENTRY, NOW);

    const [left, right] = await Promise.all([
      ensureReadableComposeKey(NOW),
      ensureReadableComposeKey(NOW),
    ]);

    expect(typeof left?.key).toBe("string");
    expect(right?.key).toBe(left?.key);
    // 보관물에 남은 것도 그 하나여야 한다 — 늦게 온 쪽이 덮으면 앞 탭이 접수한 키와 갈라진다.
    expect(storedRecord()?.composeIdempotencyKey).toBe(left?.key);
  });

  /*
    회귀 — **키는 「그 자리에 있는 한 벌」에 붙고, 돌려주는 원본도 그 한 벌이다.**

    키를 붙이는 사이 다른 탭이 새로 찍어 갈아 끼웠으면 키는 새 한 벌에 붙는다. 그때 예전
    항목의 원본을 이 키로 올리면, 나중에 새 한 벌을 인계할 때 같은 키가 다시 나와 서버가
    예전 작업을 재생한다 — 새로 찍은 네컷 대신 예전 것이 기록에 남는다.
  */
  it("붙이는 사이 갈아 끼워졌으면 그 새 한 벌의 원본을 돌려준다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const old = storedRecord();
    const swappedBlobs = [new Blob(["EFGH"]), new Blob(["IJKL"]), new Blob(["MNOP"]), new Blob(["QRST"])];

    // 키를 붙이러 가기 **직전**에 다른 탭이 새로 찍어 갈아 끼운다.
    store.afterRead = () => {
      store.afterRead = null;
      store.data.set(RECORD_KEY, { ...(old as object), sources: swappedBlobs, savedAt: NOW + 1 });
    };

    const settled = await ensureReadableComposeKey(NOW);

    // 키는 새 한 벌에 붙었다 — 돌려주는 원본도 그쪽이어야 한다.
    expect(settled?.key).toBe(storedRecord()?.composeIdempotencyKey);
    expect(settled?.entry.sources).toEqual(
      await Promise.all(swappedBlobs.map(readBlobAsDataUrl)),
    );
    expect(settled?.entry.savedAt).toBe(NOW + 1);
  });

  /*
    회귀 — **키를 붙인 뒤 원본을 못 되돌려도 예전 항목으로 물러서지 않는다.**

    트랜잭션은 이미 커밋됐다. 거기서 「못 남겼다」로 물러서면 두 가지를 한꺼번에 틀린다 —
    남은 키를 안 남았다고 말하고, 읽어 둔 **예전 원본**을 그 키에 실어 보낸다. 키는 그
    사이 갈아 끼워진 새 한 벌에 붙었을 수 있어, 나중에 그 한 벌을 인계할 때 같은 키가 다시
    나와 서버가 예전 작업을 재생한다.
  */
  it("키를 붙인 뒤 원본을 못 되돌리면 예전 항목으로 물러서지 않는다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const old = storedRecord();
    const swapped = [
      new Blob(["EFGH"]),
      new Blob(["IJKL"]),
      new Blob(["MNOP"]),
      new Blob(["QRST"]),
    ];

    // 첫 읽기 직후 다른 탭이 갈아 끼운다. 키는 이 새 한 벌에 붙는다.
    store.afterRead = () => {
      store.afterRead = null;
      store.data.set(RECORD_KEY, {
        ...(old as object),
        sources: swapped,
        savedAt: NOW + 1,
      });
    };

    // 커밋 뒤, 그 새 한 벌의 원본을 되돌리다 실패한다.
    const settled = await withUnreadableBlobs(swapped, () =>
      ensurePendingGuestSaveComposeKey(NOW),
    );

    // 이번 회차는 접는다 — 예전 원본을 이 키에 실어 보내지 않는다.
    expect(settled).toBe("unreadable");
    // 키는 보관물에 남았다. 다음 회차가 같은 키로 이어 간다.
    expect(typeof storedRecord()?.composeIdempotencyKey).toBe("string");
    const savedKey = storedRecord()?.composeIdempotencyKey;
    // 같은 실패가 재시도 첫 읽기에서 나도 부재로 바뀌지 않는다.
    expect(
      await withUnreadableBlobs(swapped, () => ensurePendingGuestSaveComposeKey(NOW)),
    ).toBe("unreadable");
    const retried = await ensureReadableComposeKey(NOW);
    expect(retried?.key).toBe(savedKey);
    expect(retried?.entry.sources).toEqual(
      await Promise.all(swapped.map(readBlobAsDataUrl)),
    );
  });

  it("키를 심어도 나머지 보관 내용은 그대로다", async () => {
    await setPendingGuestSave({ ...ENTRY, backgroundColor: "#ffffff" }, NOW);
    await ensurePendingGuestSaveComposeKey(NOW);

    expect(await getPendingGuestSave(NOW)).toMatchObject({
      ...ENTRY,
      backgroundColor: "#ffffff",
      savedAt: NOW,
    });
  });

  /*
    새로 찍은 네컷이 옛 키를 물려받으면 서버가 앞 작업을 재생해, 방금 찍은 사진 대신
    예전 그림이 기록에 남는다. 보관물을 통째로 갈아 끼우므로 키도 같이 사라져야 한다.
  */
  it("새로 보관하면 옛 멱등키를 물려받지 않는다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const old = await ensureReadableComposeKey(NOW);

    await setPendingGuestSave(
      { ...ENTRY, sources: SOURCES.map((src) => `${src}ABCD`) },
      NOW,
    );

    expect((await getPendingGuestSave(NOW))?.composeIdempotencyKey).toBeUndefined();
    expect((await ensureReadableComposeKey(NOW))?.key).not.toBe(old?.key);
  });

  /*
    키와 **그 키가 붙은 한 벌**을 같이 준다.

    이 함수는 저장소를 스스로 한 번 읽는다. 호출부가 그 전에 따로 읽어 둔 항목을 올리면,
    두 읽기 사이에 보관물이 갈아 끼워졌을 때 키는 새 한 벌에 붙고 요청에는 예전 한 벌이
    실린다 — 나중에 새 한 벌을 인계할 때 같은 키가 다시 나와 서버가 예전 작업을 재생한다.
    그래서 「무엇에 붙였는지」를 돌려주고, 올릴 원본도 거기서 꺼내게 한다.
  */
  it("키를 붙인 그 보관물을 함께 돌려준다", async () => {
    await setPendingGuestSave(ENTRY, NOW);

    const minted = await ensureReadableComposeKey(NOW);

    expect(minted?.entry.composeIdempotencyKey).toBe(minted?.key);
    expect(minted?.entry).toMatchObject({ ...ENTRY, savedAt: NOW });
    // 되읽어도 같은 한 벌이다 — 돌려준 것이 실제로 디스크에 있는 그것이다.
    expect(minted?.entry.savedAt).toBe((await getPendingGuestSave(NOW))?.savedAt);
  });

  // 못 남긴 길에서도 「무엇에 붙였는지」는 알려 준다. 그 한 벌이 이번에 올릴 것이다.
  it("보관에 실패해도 키를 붙인 한 벌은 같이 돌려준다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    store.rejectWrites = true;

    const minted = await ensureReadableComposeKey(NOW);

    expect(minted?.persisted).toBe(false);
    expect(minted?.entry.composeIdempotencyKey).toBe(minted?.key);
    expect(minted?.entry.sources).toHaveLength(4);
    store.rejectWrites = false;
  });

  it("보관물이 없으면 키를 만들지 않는다", async () => {
    expect(await ensurePendingGuestSaveComposeKey(NOW)).toBeNull();
  });

  // 길이 상한(64자)을 넘긴 값을 그대로 실어 보내면 합성 요청이 400 이다.
  it("깨진 멱등키는 없는 것으로 보고 새로 심는다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const record = storedRecord();
    if (record) record.composeIdempotencyKey = "x".repeat(65);

    expect((await getPendingGuestSave(NOW))?.composeIdempotencyKey).toBeUndefined();

    const fresh = (await ensureReadableComposeKey(NOW))?.key ?? "";
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.length).toBeLessThanOrEqual(64);
  });

  /*
    되쓰기가 막혀도 이번 시도는 키를 들고 간다 — 여기서 거절하면 될 저장까지 막는다.
    다만 **못 남겼다는 사실을 같이 준다.** 성공처럼 답하면 호출부는 "새로고침하면 다시
    시도해요"라고 안내하면서, 그 재시도가 다른 키로 접수돼 같은 네컷을 한 벌 더 만드는
    것을 모른다. 트랜잭션 중단은 `writeRecord` 가 **던지는** 쪽이다.
  */
  it("트랜잭션이 중단되면 키는 주되 못 남겼다고 답한다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    store.rejectWrites = true;

    const result = await ensureReadableComposeKey(NOW);
    expect(typeof result?.key).toBe("string");
    expect(result?.persisted).toBe(false);

    store.rejectWrites = false;
    // 원본 4장은 그대로 있다 — 키 한 줄 때문에 인계를 통째로 잃지 않는다.
    expect((await getPendingGuestSave(NOW))?.sources).toHaveLength(4);
    // 그리고 실제로 안 남았다 — 다음 시도는 다른 키로 간다. 이것이 `persisted: false` 다.
    expect((await ensureReadableComposeKey(NOW))?.key).not.toBe(result?.key);
  });

  /*
    예전 localStorage 보관물을 읽은 사람은 **IndexedDB 를 못 여는 자리**에 있을 수 있다.
    그 길에서 `writeRecord` 는 던지지 않고 조용히 false 로 끝난다 — 던지는 쪽만 보고 있으면
    이 경로가 그대로 "성공"이 된다.
  */
  it("저장소를 열지 못하면 키는 주되 못 남겼다고 답한다", async () => {
    window.localStorage.setItem(
      LEGACY_KEY_V2,
      JSON.stringify({ ...ENTRY, savedAt: NOW }),
    );
    store.openFails = true;

    const result = await ensureReadableComposeKey(NOW);
    expect(typeof result?.key).toBe("string");
    expect(result?.persisted).toBe(false);
  });

  /*
    배포되는 순간 이미 예전 localStorage 보관물을 들고 로그인하러 간 사람이 있다.
    저장소를 옮겼다는 우리 사정으로 그 인계를 버리지 않는다 — 한 번 더 읽어 준다.
  */
  it("아직 못 옮긴 예전 localStorage 보관물도 읽어 준다", async () => {
    window.localStorage.setItem(
      LEGACY_KEY_V2,
      JSON.stringify({ ...ENTRY, backgroundColor: "#ffffff", savedAt: NOW }),
    );

    const legacy = await getPendingGuestSave(NOW);
    expect(legacy?.sources).toEqual(SOURCES);
    expect(legacy?.backgroundColor).toBe("#ffffff");

    // 기한은 예전 보관물에도 그대로 적용된다.
    expect(await getPendingGuestSave(NOW + PENDING_GUEST_SAVE_TTL_MS + 1)).toBeNull();
  });

  /*
    읽어 주는 것과 **치우는 것**은 한 쌍이다. 못 쓰는 예전 보관물을 그대로 두면 새로 쓰는
    곳이 IndexedDB 하나뿐이라 그 한 벌이 localStorage 에 영영 남는다 — 로그인할 때마다 같은
    실패를 되풀이하고 자리만 차지한다. 예전 localStorage 구현은 이 자리에서 지웠다.
  */
  it.each([
    [
      "기한이 지난",
      JSON.stringify({ ...ENTRY, savedAt: NOW - PENDING_GUEST_SAVE_TTL_MS - 1 }),
    ],
    ["JSON 이 깨진", '{"sources": ['],
    [
      "모르는 프레임인",
      JSON.stringify({ ...ENTRY, frameId: "not-a-frame", savedAt: NOW }),
    ],
    /*
      `savedAt` 이 성한 숫자가 아니면 기한을 셀 수 없다. 숫자일 때만 검사하면 이 값들이
      기한 검사를 통째로 건너뛰고 정상으로 돌아온다 — 하루 TTL 이 하려던 「공용 기기에서
      앞사람 사진을 넘겨주지 않는다」가 그 자리에서 무력해진다.
    */
    ["savedAt 이 없는", JSON.stringify({ ...ENTRY })],
    ["savedAt 이 NaN 인", JSON.stringify({ ...ENTRY, savedAt: Number.NaN })],
    ["savedAt 이 문자열인", JSON.stringify({ ...ENTRY, savedAt: String(NOW) })],
    // 미래 시각은 `now - savedAt` 이 늘 음수라 그대로 두면 영원히 안 지워진다.
    [
      "savedAt 이 한참 미래인",
      JSON.stringify({ ...ENTRY, savedAt: NOW + 60 * 60 * 1000 }),
    ],
  ])("%s 예전 보관물은 읽는 김에 걷어낸다", async (_case, raw) => {
    window.localStorage.setItem("harucut:pending-guest-save:v1", "old");
    window.localStorage.setItem(LEGACY_KEY_V2, raw);

    expect(await getPendingGuestSave(NOW)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  /*
    다만 **못 읽은 것**은 못 쓰는 것과 다르다. IndexedDB 조회가 중간에 깨졌을 때 예전
    보관물까지 같이 지우면, 열어 보지도 않은 인계를 버리는 것이다 — 그 한 벌이 사용자에게
    남은 마지막 인계일 수 있고, 다음 시도에는 읽힐 수도 있다.
  */
  it("읽기가 실패하면 예전 localStorage 보관물은 남긴다", async () => {
    window.localStorage.setItem(
      LEGACY_KEY_V2,
      JSON.stringify({ ...ENTRY, savedAt: NOW }),
    );
    store.rejectReads = true;

    expect(await getPendingGuestSave(NOW)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_KEY_V2)).not.toBeNull();

    // 읽기가 돌아오면 그 한 벌이 그대로 인계된다.
    store.rejectReads = false;
    expect((await getPendingGuestSave(NOW))?.sources).toEqual(SOURCES);
  });

  /*
    회귀 — 읽기가 실패해도 **IndexedDB 의 한 벌을 지우지 않는다.**

    읽기가 깨졌다는 것은 레코드가 망가졌다는 증거가 아니다. 트랜잭션이 잠깐 중단되거나
    Blob 변환이 실패해도 그 자리로 온다. 거기서 지우면 사용자가 계정으로 옮기려던 원본
    4장의 **유일한 보관본**이 사라지고, 다음 열기가 성공해도 되살릴 수 없다 —
    조건부 삭제(`clearHandoffIfUnchanged`)가 지켜 볼 기회조차 없다.
  */
  it.each(["open", "transaction"])("손상된 보관물 정리에 실패하면 부재로 답하지 않는다 (%s)", async (failure) => {
    await setPendingGuestSave(ENTRY, NOW);
    const record = storedRecord();
    if (record) record.frameId = "not-a-frame";
    if (failure === "open") {
      store.afterRead = () => {
        store.afterRead = null;
        store.openFails = true;
      };
    } else {
      store.rejectWrites = true;
    }

    expect(await readPendingGuestSave(NOW)).toEqual({ status: "unreadable" });
    expect(storedRecord()).not.toBeNull();

    store.openFails = false;
    store.rejectWrites = false;
    expect(await readPendingGuestSave(NOW)).toEqual({ status: "empty" });
    expect(storedRecord()).toBeNull();
  });

  it("원본 변환 실패 시 메타를 남기고, 확인한 보관물은 변환 없이 버릴 수 있다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const blobs = storedRecord()?.sources ?? [];

    await withUnreadableBlobs(blobs, async () => {
      const read = await readPendingGuestSave(NOW);
      expect(read).toMatchObject({
        status: "unreadable",
        reason: "sources",
        meta: { savedAt: NOW, displayName: ENTRY.displayName },
      });
      expect(storedRecord()).not.toBeNull();
      expect(await clearIfUnchangedLikeBridge(NOW, NOW)).toBe(true);
      expect(storedRecord()).toBeNull();
    });
  });

  it("읽기가 실패해도 보관물을 지우지 않는다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    store.rejectReads = true;

    // 「없다」가 아니라 「모르겠다」로 답한다.
    expect(await readPendingGuestSave(NOW)).toEqual({ status: "unreadable" });
    // 고치기 전에는 여기서 이미 사라졌다.
    expect(storedRecord()).not.toBeNull();

    // 읽기가 돌아오면 그 한 벌이 그대로 있다.
    store.rejectReads = false;
    expect((await getPendingGuestSave(NOW))?.sources).toEqual(SOURCES);
  });

  /*
    회귀 — **저장소를 못 연 것**도 「모르겠다」다.

    앞 라운드에서 막은 것은 읽다가 깨진 길(`catch`)이었다. 그런데 열기 실패는 그 `catch` 를
    거치지 않는다 — `withStore()` 가 예외 대신 조용히 null 을 주고, 그 null 이 「그 자리에
    아무것도 없다」와 한 갈래로 흘러 `empty` 가 됐다.

    `empty` 는 그냥 답이 아니라 **삭제 허가**다(components/guest/GuestTrialBridge.tsx 의
    `clearHandoffIfUnchanged`). 즉 사생활 보호 모드나 다른 탭의 버전 잠금으로 한 번 못 연
    것이, 확인한 적 없는 현재 한 벌을 지워도 된다는 결론이 됐다. 원본 4장은 거기에만 있다.
  */
  it("저장소를 열지 못하면 「없다」가 아니라 「모르겠다」로 답한다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    store.openFails = true;

    expect(await readPendingGuestSave(NOW)).toEqual({ status: "unreadable" });

    // 열기가 돌아오면 그 한 벌이 그대로 있다 — 못 연 사이에 잃은 것이 없다.
    store.openFails = false;
    expect((await getPendingGuestSave(NOW))?.sources).toEqual(SOURCES);
  });

  /*
    같은 지적을 **사고 모양 그대로** 박아 둔다.

    리뷰가 짚은 것은 "두 번째 DB 열기만 성공하면"이다 — 확인 읽기는 저장소를 못 열고,
    뒤이은 삭제는 열려서 실제로 지운다. `openFails` 는 통째로 켜고 끄는 플래그라 그 순간을
    못 만들어서, 첫 열기만 실패시키는 `failNextOpens` 로 흉내 낸다.

    분기 없이 호출부 규칙을 **끝까지 돌린다.** 앞 회차의 이 테스트는 `if (read.status !==
    "unreadable")` 안쪽이 한 번도 실행되지 않는 죽은 분기였다 — 남은 단언은 방금 쓴 레코드라
    무엇을 고쳐도 참이었다.
  */
  it("열기 실패를 삭제 허가로 넘기지 않는다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    // 확인 읽기만 못 연다. 뒤이은 삭제 열기는 성공한다 — 이것이 사고의 조건이다.
    store.failNextOpens = 1;

    expect(await clearIfUnchangedLikeBridge(NOW, NOW)).toBe(false);

    expect(storedRecord()).not.toBeNull();
    expect((await getPendingGuestSave(NOW))?.sources).toEqual(SOURCES);
  });

  /*
    같은 사고의 **다른 입구** — 그리고 그 입구를 막는 방식.

    저장소를 못 연 자리에서도 예전 localStorage 한 벌은 읽히고, 그때 읽기는 `found` 로
    답한다(그래야 읽을 수 있는 인계를 안 버린다). 그 답을 그대로 삭제 허가로 쓰면
    IndexedDB 를 한 번도 못 읽은 채 삭제가 진행돼, 그 사이 다른 탭이 갈아 끼운 한 벌이
    사라진다.

    한때 이 갈래를 통째로 「모르겠다」로 접었는데 그러면 반대쪽이 깨졌다 — 사용자가
    「버리기」를 골라도 예전 한 벌이 남아 다음 화면 이동에서 같은 확인이 다시 뜨고,
    저장에 성공한 뒤에도 남아 다시 저장하면 같은 네컷이 서버에 한 벌 더 생긴다.

    그래서 **지울 것만 지운다** — 확인한 예전 키는 걷고, 못 읽은 IndexedDB 레코드는 그대로 둔다.
  */
  it("열기 실패 뒤에 읽은 예전 보관물은 그 키만 지운다", async () => {
    // 다른 탭이 방금 갈아 끼운 한 벌. 사용자는 이것을 본 적이 없다.
    await setPendingGuestSave(ENTRY, NOW + 1_000);
    // 사용자에게 물어본 것은 예전 localStorage 한 벌이었다 — 지문(savedAt)이 다르다.
    window.localStorage.setItem(
      LEGACY_KEY_V2,
      JSON.stringify({ ...ENTRY, savedAt: NOW }),
    );
    store.failNextOpens = 1;

    // 확인한 그 한 벌이므로 「지웠다」로 끝난다.
    expect(await clearIfUnchangedLikeBridge(NOW, NOW)).toBe(true);

    // 지운 것은 예전 키뿐이다.
    expect(window.localStorage.getItem(LEGACY_KEY_V2)).toBeNull();
    // 못 읽은 IndexedDB 레코드는 그대로다 — 여기 원본 4장이 들어 있다.
    expect(storedRecord()).not.toBeNull();
    expect((await getPendingGuestSave(NOW))?.savedAt).toBe(NOW + 1_000);
  });

  /*
    반대쪽 못 — 지문이 다르면 못 연 자리에서도 아무것도 지우지 않는다.
    「못 열었으면 예전 키를 걷는다」로 뭉개면 사용자가 확인한 적 없는 한 벌이 사라진다.
  */
  it("열기 실패 뒤에 읽은 예전 보관물도 지문이 다르면 지우지 않는다", async () => {
    window.localStorage.setItem(
      LEGACY_KEY_V2,
      JSON.stringify({ ...ENTRY, savedAt: NOW }),
    );
    store.failNextOpens = 1;

    // 물어본 것은 다른 시각의 한 벌이었다.
    expect(await clearIfUnchangedLikeBridge(NOW + 5_000, NOW)).toBe(false);
    expect(window.localStorage.getItem(LEGACY_KEY_V2)).not.toBeNull();
  });

  /*
    회귀 — **대조와 삭제 사이에 다른 탭이 끼어들지 못한다.**

    나눠서 하던 때는 읽기가 Blob 넷을 data URL 로 되돌리는 동안 창이 열려 있었고, 그 사이
    다른 탭이 새 네컷을 같은 자리에 저장하면 뒤이은 무조건 삭제가 **그 새 한 벌**을 지웠다 —
    사용자가 확인한 적 없는 것이고, 원본 4장은 거기에만 있다.

    지금은 한 `readwrite` 트랜잭션 안에서 대조하고 지운다. 그 사이에 쓰기가 들어오는 것을
    흉내 내려고, 트랜잭션이 대조하는 순간(`get` 의 `onsuccess`)에 레코드를 갈아 끼운다.
  */
  /*
    회귀 — **이미 사라진 보관물은 「지웠다」로 끝낸다.**

    두 탭이 같은 인계 안내를 받아 첫 탭이 먼저 지우면, 두 번째 탭은 열어서 「없다」를
    확인한다. 그것은 사용자가 원한 상태이므로 성공이다. 한때 「저장소를 못 열었다」와
    한 값으로 뭉쳐 `unreadable` 을 줬고, 호출부가 그것을 실패로 접어 "보관물이 다른
    네컷으로 바뀌어 그대로 뒀어요"라는 **사실과 다른 안내**를 띄웠다.
  */
  it("열어서 아무것도 없으면 이미 지운 것으로 끝낸다", async () => {
    // 저장소는 열리고, 레코드도 예전 키도 없다.
    const result = await clearPendingGuestSaveIfUnchanged(
      (entry) => entry.savedAt === NOW,
      NOW,
    );

    expect(result).toBe("cleared");
  });

  // 반대쪽 못 — **못 열었으면** 여전히 「모르겠다」다. 그 자리에서 성공이라고 답하면
  // 호출부가 안 지운 것을 지웠다고 안내한다.
  it("못 열었고 예전 보관물도 없으면 모르겠다로 답한다", async () => {
    store.openFails = true;

    const result = await clearPendingGuestSaveIfUnchanged(
      (entry) => entry.savedAt === NOW,
      NOW,
    );

    expect(result).toBe("unreadable");
  });

  it("대조와 삭제가 한 트랜잭션 안에서 끝난다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    store.openCount = 0;

    const result = await clearPendingGuestSaveIfUnchanged(
      (entry) => entry.savedAt === NOW,
      NOW,
    );

    expect(result).toBe("cleared");
    expect(storedRecord()).toBeNull();
    /*
      **한 번만 연다.** 나눠서 하던 때는 읽기가 한 번, 삭제가 한 번 열어 그 사이가 창이었다.
      실제 IndexedDB 는 같은 store 의 트랜잭션을 직렬화하므로, 한 트랜잭션 안에 들어오면
      그 창이 사라진다 — 여는 횟수가 그것을 재는 가장 곧은 자다.
    */
    expect(store.openCount).toBe(1);
  });

  /*
    반대쪽 못 — 「모르겠다」로 다 접으면 조건부 삭제를 통째로 꺼 버린 것과 같다.
    저장소를 열고 그 한 벌을 직접 본 뒤 지문이 맞으면 지워야 한다.
  */
  it("열어서 확인한 한 벌은 지문이 맞으면 지운다", async () => {
    await setPendingGuestSave(ENTRY, NOW);

    expect(await clearIfUnchangedLikeBridge(NOW, NOW)).toBe(true);
    expect(storedRecord()).toBeNull();
  });

  // 그리고 지문이 다르면 — 그 사이 새로 찍은 한 벌이면 — 열렸어도 손을 뗀다.
  it("열어서 확인했어도 지문이 다르면 지우지 않는다", async () => {
    await setPendingGuestSave(ENTRY, NOW);

    expect(await clearIfUnchangedLikeBridge(NOW - 1, NOW)).toBe(false);
    expect(storedRecord()).not.toBeNull();
  });

  /*
    회귀 — **못 연 김에 지우지 않는다.**

    「첫 열기만 실패」가 조건이다. 읽기가 못 연 자리에서 무엇이든 지우면, 뒤이은 열기는
    성공하므로 그 삭제가 실제로 먹는다 — 확인한 적 없는 한 벌이 사라진다.
    `openFails` 로는 이 순간을 못 만들어(삭제 쪽 열기도 같이 막힌다) 회귀가 그냥 통과했다.
  */
  it("첫 열기만 실패해도 보관물은 그대로 남는다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    store.failNextOpens = 1;

    expect(await readPendingGuestSave(NOW)).toEqual({ status: "unreadable" });

    expect(storedRecord()).not.toBeNull();
    expect((await getPendingGuestSave(NOW))?.sources).toEqual(SOURCES);
  });

  /*
    반대쪽 못 — 「모르겠다」로 다 뭉개면 이 수정은 조건부 삭제를 통째로 꺼 버린 것과 같다.
    정말로 열렸고 정말로 아무것도 없을 때는 `empty` 여야 한다.
  */
  it("열리고 아무것도 없으면 「없다」로 답한다", async () => {
    expect(await readPendingGuestSave(NOW)).toEqual({ status: "empty" });
  });

  /*
    같은 갈림의 나머지 두 자리 — **열어서 직접 보고 못 쓴다고 판단한 레코드**다.

    여기서 `unreadable` 로 답하면 조건부 삭제가 영영 손을 떼서, 못 쓰는 한 벌이 IndexedDB 에
    남아 로그인할 때마다 같은 실패를 되풀이한다. 열고 확인한 판단이라 근거가 있으므로
    「없다」가 맞다 — 그래서 그 자리에서 지운다.
  */
  it("열렸는데 메타가 깨진 레코드는 「없다」로 답하고 지운다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const record = storedRecord();
    expect(record?.sources).toHaveLength(4);
    if (record) record.frameId = "not-a-frame";

    expect(await readPendingGuestSave(NOW)).toEqual({ status: "empty" });
    expect(storedRecord()).toBeNull();
  });

  /*
    회귀 — **못 쓰는 한 벌을 걷다가 남의 새 한 벌을 지우지 않는다.**

    읽기는 `readonly` 로 끝나고, 걷어 내기까지의 사이가 열려 있다. 그 틈에 다른 탭이 새
    네컷을 같은 자리에 저장하면 무조건 삭제는 **그 새 한 벌**을 지운다 — 사용자가 확인한
    적 없는 것이고, 원본 4장은 거기에만 있다.
  */
  it("걷어 내는 사이 다른 탭이 새로 저장했으면 그것은 두고 온다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const broken = storedRecord();
    if (broken) broken.frameId = "not-a-frame";

    // 읽기가 못 쓰는 한 벌을 집은 **직후**, 다른 탭이 성한 새 한 벌로 갈아 끼운다.
    store.afterRead = () => {
      store.afterRead = null;
      store.data.set(RECORD_KEY, {
        ...(broken as object),
        frameId: ENTRY.frameId,
        savedAt: NOW + 1,
      });
    };

    // 내가 읽은 것은 이미 지난 소식이다 — 「없다」로 답하면 그 판단으로 무언가를 지운다.
    expect(await readPendingGuestSave(NOW)).toEqual({ status: "unreadable", reason: "changed" });
    // 새 한 벌은 그대로 남아 있어야 한다.
    expect(storedRecord()?.frameId).toBe(ENTRY.frameId);
  });

  /*
    회귀 — **같은 밀리초에 저장된 새 한 벌도 남의 것이다.**

    시각을 지문으로 쓰면 여기서 무너진다. `savedAt` 은 `Date.now()` 그대로라, 깨진 한 벌을
    읽은 직후 다른 탭의 저장이 같은 밀리초에 시작하면 두 레코드의 지문이 같아진다 —
    성한 새 한 벌을 내가 읽은 것으로 착각해 지운다.
  */
  it("같은 시각에 저장된 새 한 벌도 지우지 않는다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const broken = storedRecord();
    if (broken) broken.frameId = "not-a-frame";

    // 갈아 끼우되 **시각은 그대로** 둔다 — 같은 밀리초에 저장된 모양이다.
    store.afterRead = () => {
      store.afterRead = null;
      store.data.set(RECORD_KEY, {
        ...(broken as object),
        frameId: ENTRY.frameId,
        savedAt: NOW,
      });
    };

    expect(await readPendingGuestSave(NOW)).toEqual({ status: "unreadable", reason: "changed" });
    expect(storedRecord()?.frameId).toBe(ENTRY.frameId);
  });

  it("열렸는데 원본이 4장이 아닌 레코드도 「없다」로 답하고 지운다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    const record = storedRecord();
    expect(record?.sources).toHaveLength(4);
    if (record) record.sources = record.sources.slice(0, 3);

    expect(await readPendingGuestSave(NOW)).toEqual({ status: "empty" });
    expect(storedRecord()).toBeNull();
  });

  /*
    반대쪽 못 — 열기 실패에서 곧바로 손을 떼면 안 된다.

    IndexedDB 를 못 여는 자리에도 예전 localStorage 보관물을 들고 온 사람이 있다. 그 한 벌은
    저장소를 못 열어도 읽히므로, 「모르겠다」로 접으면 읽을 수 있는 인계를 버리는 것이다.
  */
  it("저장소를 열지 못해도 예전 localStorage 보관물은 읽어 준다", async () => {
    window.localStorage.setItem(
      LEGACY_KEY_V2,
      JSON.stringify({ ...ENTRY, savedAt: NOW }),
    );
    store.openFails = true;

    const read = await readPendingGuestSave(NOW);
    expect(read.status).toBe("found");
    expect(read.status === "found" && read.entry.sources).toEqual(SOURCES);

    // 다만 **확인한 답은 아니다.** IndexedDB 는 못 열었으므로 그 표시를 같이 싣는다.
    expect(read).toMatchObject({ status: "found", opened: false });
    /*
      그리고 지울 때는 **그 키만** 걷는다. 통째로 지우면 못 읽은 IndexedDB 레코드까지
      사라지고, 접어 버리면 사용자가 「버리기」를 골라도 이 한 벌이 남아 다음 화면
      이동에서 같은 확인이 다시 뜬다.
    */
    expect(await clearIfUnchangedLikeBridge(NOW, NOW)).toBe(true);
    expect(window.localStorage.getItem(LEGACY_KEY_V2)).toBeNull();
  });

  it("보관하면 예전 localStorage 키를 같이 걷어낸다", async () => {
    window.localStorage.setItem("harucut:pending-guest-save:v1", "old");
    window.localStorage.setItem(LEGACY_KEY_V2, "old");

    await setPendingGuestSave(ENTRY, NOW);
    expect(window.localStorage.length).toBe(0);

    await clearPendingGuestSave();
    expect(await getPendingGuestSave(NOW)).toBeNull();
  });
});
