/*
  「인증됐다」와 「앱을 쓸 수 있다」는 다르다.

  백엔드의 `/api/auth/status` 는 탈퇴요청(DELETED_REQUESTED)·탈퇴(DELETED)·차단(BLOCKED)
  계정에도 **200 으로 통과한다** — 복구 안내로 갈 수 있게 서버가 일부러 열어 둔 예외다
  (docs/backend-contract.md 「탈퇴 요청 → 복구 생애주기」). 그런데 일반 API 는 전부
  403(GEN-021)이라, 200 을 곧 「회원」으로 읽으면 그 사람은 아무것도 못 하는 화면으로 간다.

  그 판정을 여기 하나에 둔다. 예전에는 `app/api/auth/session/route.ts` 안에만 있어서,
  `/api/auth/status` 를 직접 부르는 쪽은 이 예외를 모른 채 200 을 회원으로 읽었다.
*/

/** 인증은 됐지만 앱을 쓸 수 없는 상태들. */
const UNUSABLE_USER_STATUSES = new Set(["DELETED_REQUESTED", "DELETED", "BLOCKED"]);

/** `/api/auth/status` 응답 본문에서 `data.userStatus` 를 꺼낸다. 못 읽으면 null. */
export function readUserStatus(body: unknown): string | null {
  const parsed =
    typeof body === "string"
      ? (() => {
          try {
            return JSON.parse(body) as unknown;
          } catch {
            return null;
          }
        })()
      : body;

  const status = (parsed as { data?: { userStatus?: unknown } } | null)?.data
    ?.userStatus;
  return typeof status === "string" ? status : null;
}

/**
 * 이 상태로는 앱을 쓸 수 없는가.
 *
 * **못 읽은 상태(null)는 「쓸 수 있다」로 본다.** 여기서 기본값을 「못 쓴다」로 두면
 * 응답 형태가 조금만 바뀌어도 멀쩡한 사용자가 전부 로그인 화면으로 쫓겨난다.
 */
export function isUnusableUserStatus(userStatus: string | null): boolean {
  return userStatus !== null && UNUSABLE_USER_STATUSES.has(userStatus);
}
