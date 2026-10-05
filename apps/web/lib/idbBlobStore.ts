const OPEN_TIMEOUT_MS = 5_000;

/** 저장소를 연다. 못 쓰는 환경이면 예외 대신 null — 호출부가 닫힌 실패로 처리한다. */
export function openBlobDatabase(databaseName: string, storeName: string): Promise<IDBDatabase | null> {
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
      request = factory.open(databaseName, 1);
    } catch {
      settle(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
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
export function runBlobTransaction<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    let request: IDBRequest<T>;
    try {
      transaction = db.transaction(storeName, mode);
      request = run(transaction.objectStore(storeName));
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

