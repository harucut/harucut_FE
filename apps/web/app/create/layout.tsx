import type { ReactNode } from "react";
import { ShootSessionBoundary } from "@/components/shoot/ShootSessionBoundary";

export default function ShootLayout({ children }: { children: ReactNode }) {
  return <ShootSessionBoundary>{children}</ShootSessionBoundary>;
}
