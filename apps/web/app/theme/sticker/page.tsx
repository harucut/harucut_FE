"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { useThemeSession } from "@/lib/themeSessionStore";
import { ThemeEditorPage } from "@/components/theme/editor/ThemeEditorPage";

export default function StickerEditorPage() {
  const router = useRouter();
  const { frameId } = useThemeSession();

  useEffect(() => {
    if (!frameId) router.replace("/theme");
  }, [frameId, router]);

  if (!frameId) return null;

  return <ThemeEditorPage frameId={frameId as FrameId} />;
}
