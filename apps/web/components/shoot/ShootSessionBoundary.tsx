"use client";

import { useEffect, type ReactNode } from "react";
import { initializeShootSession, useShootPersistence } from "@/lib/shootSessionPersistence";

export function ShootSessionBoundary({ children }: { children: ReactNode }) {
  const { ready, error } = useShootPersistence();
  useEffect(() => { void initializeShootSession(); }, []);
  if (!ready) return <p role="status" className="p-6 text-center text-(--hc-muted)">촬영하던 사진을 확인하고 있어요…</p>;
  return <>
    {error && <p role="status" className="bg-(--hc-surface) px-4 py-2 text-sm text-(--hc-text)">이 기기에서 사진을 임시 보관하지 못했어요. 완성본을 저장할 때까지 새로고침하거나 창을 닫지 마세요.</p>}
    {children}
  </>;
}
