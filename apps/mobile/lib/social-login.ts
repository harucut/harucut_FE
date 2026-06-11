import { getAuthStatus, reactivateAccount } from '@/lib/auth-api';
import { useSessionStore } from '@/store/use-session-store';

// 소셜 로그인 복귀 후 세션 확정 절차(상태 확인 → 필요 시 재활성화 → 멤버 세션 부트스트랩).
// openAuthSessionAsync 성공 경로와 harucut://oauth2/callback 딥링크 경로가
// 같은 로그인에 대해 동시에 도달할 수 있어 단일 in-flight 프라미스로 중복 실행을 막는다.
let inFlight: Promise<void> | null = null;

export function completeSocialLoginSession(): Promise<void> {
  if (!inFlight) {
    inFlight = (async () => {
      const status = await getAuthStatus();

      if (status?.userStatus === 'DELETED_REQUESTED') {
        await reactivateAccount();
      }

      await useSessionStore.getState().bootstrapMemberSession();
    })().finally(() => {
      inFlight = null;
    });
  }

  return inFlight;
}
