import { clearShootSession } from "@/lib/shootSessionPersistence";
import { clearEditorDraft } from "@/lib/themeEditorDraft";
import { useThemeEditorStore } from "@/lib/themeEditorStore";
import { useThemeSession } from "@/lib/themeSessionStore";
import { clearPendingGuestSave } from "@/lib/pendingGuestSave";

/** 명시적 로그아웃·탈퇴 때 공용 기기에 사진과 편집 초안을 남기지 않는다. */
export async function clearLocalUserData() {
  useThemeEditorStore.getState().reset();
  useThemeSession.getState().reset();
  clearEditorDraft();
  await Promise.all([clearShootSession(), clearPendingGuestSave()]);
}
