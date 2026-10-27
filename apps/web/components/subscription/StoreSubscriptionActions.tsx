"use client";

import { useEffect, useState, type ReactNode } from "react";
import { STORE_PRODUCT_IDS, STORE_PURCHASES_ENABLED } from "@harucut/shared";
import type { Subscription } from "@/lib/api-types";
import { isNativeShell, nativeStoreProducts, supportsStorePurchase } from "@/lib/nativeBridge";
import { buyPlusInApp, restoreInApp, type StoreFlowResult } from "@/lib/storePurchase";

/** 앱 안에서 스토어 결제를 열 수 있는 상태인가. 서버 렌더와 어긋나지 않게 마운트 뒤에 읽는다. */
type Shell = "browser" | "outdated" | "ready";

function useShell(): Shell | null {
  const [shell, setShell] = useState<Shell | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 셸 표식은 브라우저에서만 읽는다
    setShell(!isNativeShell() ? "browser" : supportsStorePurchase() ? "ready" : "outdated");
  }, []);
  return shell;
}

const OUTDATED = "앱을 업데이트하면 앱에서 구독하고 복원할 수 있어요.";

function useStoreAction(run: () => Promise<StoreFlowResult>, done: string, onDone?: (s: Subscription) => void) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const start = async () => {
    setBusy(true);
    setNotice(null);
    const result = await run();
    setBusy(false);
    if (result.kind === "done") {
      setNotice({
        kind: "ok",
        // 서버엔 반영됐지만 스토어 거래를 아직 마치지 못했다 — 앱을 다시 열면 이어서 마친다(resumeUnfinishedPurchases).
        text: result.finishPending ? `${done} 스토어 마무리가 아직 끝나지 않아 앱을 다시 열면 이어서 마칠게요.` : done,
      });
      onDone?.(result.subscription);
    } else if (result.kind === "error") {
      setNotice({ kind: "error", text: result.message });
    } else if (result.kind === "unsupported") {
      setNotice({ kind: "error", text: OUTDATED });
    }
  };
  return { busy, notice, start };
}

function Notice({ notice }: { notice: { kind: "ok" | "error"; text: string } | null }) {
  if (!notice) return null;
  return (
    <p
      role={notice.kind === "error" ? "alert" : "status"}
      className={`text-[12px] leading-[1.6] ${notice.kind === "error" ? "font-medium text-(--hc-danger)" : "text-(--hc-muted)"}`}
    >
      {notice.text}
    </p>
  );
}

/**
 * 앱에서 플러스 구독(P4-B). 앱 결제를 열지 않았거나(STORE_PURCHASES_ENABLED) 브라우저면 그리지 않는다 —
 * 웹 결제로 우회하지 않는다(R5 12절). 구버전 셸이면 업데이트를 안내한다.
 */
export function StoreBuyButton({
  onDone,
  fallback = null,
}: {
  onDone?: (subscription: Subscription) => void;
  /** 브라우저이거나 앱 결제를 열지 않았을 때 그릴 것. */
  fallback?: ReactNode;
}) {
  const shell = useShell();
  const [price, setPrice] = useState<string | null>(null);
  const { busy, notice, start } = useStoreAction(buyPlusInApp, "플러스를 시작했어요.", onDone);

  useEffect(() => {
    if (shell !== "ready" || !STORE_PURCHASES_ENABLED) return;
    let cancelled = false;
    void nativeStoreProducts([STORE_PRODUCT_IDS.plus]).then((result) => {
      if (!cancelled && result?.ok) setPrice(result.value.find((p) => p.productId === STORE_PRODUCT_IDS.plus)?.displayPrice ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [shell]);

  if (!STORE_PURCHASES_ENABLED || shell === null || shell === "browser") return <>{fallback}</>;
  if (shell === "outdated") return <p className="mt-5 text-center text-[13px] text-(--hc-muted)">{OUTDATED}</p>;
  return (
    <div className="mt-5 flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className="hc-button-primary flex h-12.5 w-full items-center justify-center rounded-full text-[15px] font-extrabold disabled:opacity-60"
      >
        {busy ? "결제 창을 여는 중…" : price ? `앱에서 구독하기 · ${price}` : "앱에서 구독하기"}
      </button>
      <Notice notice={notice} />
    </div>
  );
}

/** 이 기기 스토어 계정의 구독을 다시 잇는다. 스토어로 파는 동안에는 반드시 있어야 한다(스토어 심사 기준). */
export function StoreRestoreButton({ onDone }: { onDone?: (subscription: Subscription) => void }) {
  const shell = useShell();
  // 사용자가 누른 복원이라 스토어와 먼저 동기화한다(iOS AppStore.sync()).
  const { busy, notice, start } = useStoreAction(() => restoreInApp({ sync: true }), "구독을 복원했어요.", onDone);
  if (!STORE_PURCHASES_ENABLED || shell === null || shell === "browser") return null;
  if (shell === "outdated") return <p className="text-[12px] text-(--hc-muted)">{OUTDATED}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className="hc-button-secondary h-11 self-start rounded-full border px-4 text-[13px] font-semibold disabled:opacity-60"
      >
        {busy ? "복원하는 중…" : "구매 복원"}
      </button>
      <Notice notice={notice} />
    </div>
  );
}
