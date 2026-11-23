"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isEventSurfacePath } from "@/lib/eventSurface";

/**
 * 개인 서비스 화면에서만 자식을 그린다. 행사 화면(`lib/eventSurface.ts`)에서는 아무것도 그리지 않는다.
 *
 * 루트 레이아웃은 모든 경로를 감싸므로, 행사 경로 아래에 레이아웃을 하나 더 두는 것만으로는
 * 루트의 회원 브리지를 끌 수 없다. 그래서 루트에서 직접 가른다.
 */
export function ServiceSurfaceOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isEventSurfacePath(pathname)) return null;
  return <>{children}</>;
}
