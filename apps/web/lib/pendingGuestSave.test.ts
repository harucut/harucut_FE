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
  setPendingGuestSave,
} from "@/lib/pendingGuestSave";

const NOW = 1_700_000_000_000;

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

type FakeRequest = { result: unknown };

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
  /** 열기 자체가 실패한다(사생활 보호 모드 등). */
  openFails: false,
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
  store.rejectWrites = false;
  store.rejectReads = false;
  store.nullTransactionError = false;
  store.swallowWrites = false;
  store.openCount = 0;
  store.closeCount = 0;
  store.openBlocksThenSucceeds = false;
}

function makeObjectStore(mode: IDBTransactionMode): FakeObjectStore {
  const writable = mode === "readwrite" && !store.rejectWrites && !store.swallowWrites;
  return {
    put: (value, key) => {
      if (writable) store.data.set(key, value);
      return { result: undefined };
    },
    get: (key) => ({ result: store.data.get(key) }),
    count: (key) => ({ result: store.data.has(key) ? 1 : 0 }),
    delete: (key) => {
      if (mode === "readwrite" && !store.rejectWrites) store.data.delete(key);
      return { result: undefined };
    },
  };
}

function makeTransaction(mode: IDBTransactionMode): FakeTransaction {
  const transaction: FakeTransaction = {
    error: null,
    oncomplete: null,
    onabort: null,
    onerror: null,
    objectStore: () => makeObjectStore(mode),
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
      const request: FakeOpenRequest = {
        result: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        if (store.openFails) {
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
function storedRecord() {
  return (store.data.get(RECORD_KEY) as
    | { sources: Blob[]; composeIdempotencyKey?: string }
    | undefined) ?? null;
}

beforeEach(() => {
  window.localStorage.clear();
  jest.restoreAllMocks();
  resetStore();
  installFakeIndexedDB();
});

describe("pendingGuestSave", () => {
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
    expect(await ensurePendingGuestSaveComposeKey(NOW)).toBeNull();
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

    const first = await ensurePendingGuestSaveComposeKey(NOW);
    expect(typeof first).toBe("string");
    // 보관물에 남았으므로 새로고침 뒤(= 다시 읽어도) 같은 값이다.
    expect((await getPendingGuestSave(NOW))?.composeIdempotencyKey).toBe(first);
    expect(await ensurePendingGuestSaveComposeKey(NOW)).toBe(first);
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
    const old = await ensurePendingGuestSaveComposeKey(NOW);

    await setPendingGuestSave(
      { ...ENTRY, sources: SOURCES.map((src) => `${src}ABCD`) },
      NOW,
    );

    expect((await getPendingGuestSave(NOW))?.composeIdempotencyKey).toBeUndefined();
    expect(await ensurePendingGuestSaveComposeKey(NOW)).not.toBe(old);
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

    const fresh = (await ensurePendingGuestSaveComposeKey(NOW)) ?? "";
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.length).toBeLessThanOrEqual(64);
  });

  // 되쓰기가 막혀도 이번 시도는 키를 들고 간다. 못 남기는 것과 못 쓰는 것은 다르다.
  it("키를 못 남겨도 보관물은 지키고 키는 돌려준다", async () => {
    await setPendingGuestSave(ENTRY, NOW);
    store.rejectWrites = true;

    expect(typeof (await ensurePendingGuestSaveComposeKey(NOW))).toBe("string");

    store.rejectWrites = false;
    // 원본 4장은 그대로 있다 — 키 한 줄 때문에 인계를 통째로 잃지 않는다.
    expect((await getPendingGuestSave(NOW))?.sources).toHaveLength(4);
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

  it("보관하면 예전 localStorage 키를 같이 걷어낸다", async () => {
    window.localStorage.setItem("harucut:pending-guest-save:v1", "old");
    window.localStorage.setItem(LEGACY_KEY_V2, "old");

    await setPendingGuestSave(ENTRY, NOW);
    expect(window.localStorage.length).toBe(0);

    await clearPendingGuestSave();
    expect(await getPendingGuestSave(NOW)).toBeNull();
  });
});
