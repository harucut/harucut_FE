"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { initializeShootSession, useShootPersistence } from "@/lib/shootSessionPersistence";
import { useShootSession } from "@/lib/shootSessionStore";
import { Sentences } from "@/components/ui/Sentences";

/**
 * 끝난 촬영(완성본이 나온 촬영)으로는 돌아가지 않는 단계들(2026-11-15). 기기 뒤로가기·주소·예전 기록으로
 * 여기 오면 완성 화면으로 보낸다 — 「최종적으로 완성되었을땐 다시 고르기를 막아야해」(shootSessionStore 의 completed).
 */
const STEP_PATHS = new Set(["/shoot/capture", "/shoot/select"]);

export function ShootSessionBoundary({ children }: { children: ReactNode }) {
  const { ready, error } = useShootPersistence();
  const pathname = usePathname();
  const router = useRouter();
  const completed = useShootSession((state) => state.completed);
  const finishedStep = ready && completed && STEP_PATHS.has(pathname);
  useEffect(() => { void initializeShootSession(); }, []);
  useEffect(() => { if (finishedStep) router.replace("/shoot/result"); }, [finishedStep, router]);
  if (!ready) return <p role="status" className="p-6 text-center text-(--hc-muted)">촬영하던 사진을 확인하고 있어요…</p>;
  // 한 장면이라도 고르기 화면을 그리지 않는다 — 잠깐 보인 사진을 누르면 끝난 결과가 지워진다(toggleSelect).
  if (finishedStep) return null;
  return <>
    {error && <p role="status" className="bg-(--hc-surface) px-4 py-2 text-sm text-(--hc-text)"><Sentences text="이 기기에서 사진을 임시 보관하지 못했어요. 완성본을 저장할 때까지 새로고침하거나 창을 닫지 마세요." /></p>}
    {children}
  </>;
}
