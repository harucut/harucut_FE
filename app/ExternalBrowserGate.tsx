"use client";

import { useExternalBrowserRedirect } from "@/hooks/useExternalBrowserRedirect";

export function ExternalBrowserGate() {
  useExternalBrowserRedirect();
  return null;
}
