"use client";

import {
  CLIENT_NETWORK_UNREACHABLE_CODE,
  CLIENT_REISSUE_UNAVAILABLE_CODE,
} from "@harucut/shared";
import { getApiErrorDetails } from "@/lib/apiError";
import { clientApi } from "@/lib/clientApi";
import { isUnusableUserStatus, readUserStatus } from "@/lib/authUserStatus";

/**
 * 회원 판정의 세 갈래.
 *
 * `unknown` 이 따로 있는 이유가 이 파일의 요점이다. 「지금 회원이 아니다」와 「지금은 알 수
 * 없다」는 **되돌릴 수 있는 정도가 다르다.** 앞엣것으로 오해해 7일짜리 게스트 쿠키를 심으면
 * 멀쩡한 회원이 그동안 기록과 저장 프레임을 잃는다. 서버가 잠깐 못 답했다는 이유로 그렇게
 * 되면 안 된다.
 */
export type Membership =
  /** 서버가 확인해 줬다. */
  | "member"
  /** 서버가 확인해 줬는데 앱을 쓸 수 없다 — 세션이 끊겼거나 탈퇴요청·차단 계정이다. */
  | "guest"
  /** 못 물어봤다 — 회선이 끊겼거나 서버가 5xx 이거나 재발급 서버가 잠깐 못 답했다. */
  | "unknown";

/**
 * 지금 이 브라우저가 **앱을 쓸 수 있는 회원**인가.
 *
 * 인증 쿠키(accessToken/refreshToken)는 httpOnly 라 클라이언트가 직접 읽지 못한다. 서버에
 * 물어보는 것이 유일한 길인데, 세 가지를 챙긴다.
 *
 * ① **만료된 액세스 토큰은 재발급한다.** 그래서 생 `fetch` 가 아니라 `clientApi` 로 부른다.
 * 액세스 JWT 만 만료되고 refresh 쿠키가 멀쩡한 회원은 흔한데(백엔드는 refresh 를 access 로
 * 받아 주지 않는다 — docs/backend-contract.md), 생 `fetch` 는 그 401 을 그대로 받아 「비회원」
 * 이 된다. `clientApi` 는 401 에서 한 번 재발급하고 원 요청을 다시 보낸다.
 *
 * ② **200 이라고 앱을 쓸 수 있는 것은 아니다.** `/api/auth/status` 는 탈퇴요청·탈퇴·차단
 * 계정에도 200 을 준다(복구 진입로를 열어 둔 예외다). 그래서 본문의 `userStatus` 를 함께
 * 본다. 판정의 소유자는 `lib/authUserStatus.ts` 이고 `/api/auth/session` 라우트도 같은 것을 쓴다.
 *
 * ③ **실패를 한 갈래로 뭉치지 않는다.** 한때 `catch` 가 전부 「비회원」이었는데, 그러면
 * `/api/auth/status` 가 잠깐 5xx 이거나 재발급 서버만 못 답해도 멀쩡한 회원이 게스트로
 * 뒤집혔다. `clientApi` 는 그 둘을 일부러 갈라 준다 — 재발급이 못 답한 경우를
 * `CLIENT-00x`(재시도 가능)로 바꿔 던지고, 회선이 안 닿은 경우는 상태 없는 오류로 준다.
 * 그 구분을 여기서 잃지 않는다.
 *
 * `/api/auth/session` 을 부르지 않는 이유가 여기 있다 — 그쪽은 판정을 대신 해 주지만
 * 언제나 200 이라 `clientApi` 의 401 재발급이 걸리지 않는다.
 */
/**
 * 이 조회의 **종료 상한.**
 *
 * 답이 안 오면 이 함수가 끝나지 않고, 그것을 기다리는 화면은 잠긴 채로 남는다 — 업로드
 * 화면이 그렇다(회원으로 확인될 때까지 조작을 막는다). 상한이 없으면 「다시 확인」 안내조차
 * 뜨지 않는다. 그 안내는 `unknown` 이 **돌아와야** 뜨기 때문이다.
 *
 * 숫자는 **실측이 아니다.** 이 저장소가 같은 성격의 문제(안 끝나면 사용자가 갇힌다)에 이미
 * 걸어 둔 상한과 맞췄다 — `lib/clientApi.ts` 의 `REISSUE_DEADLINE_MS`,
 * `lib/userMediaApi.ts` 의 `DELETE_DEADLINE_MS`, `lib/themeEditorStore.ts` 의
 * `ASSET_QUEUE_WAIT_LIMIT_MS` 가 모두 30초다. 갈라지면 근거가 사라지니 함께 본다.
 *
 * 상한에 걸리면 `clientApi` 가 AbortError 를 그대로 올리고, 아래 `catch` 가 그것을
 * `unknown` 으로 접는다 — 「회원이 아니다」가 아니라 「못 물어봤다」다.
 */
const STATUS_DEADLINE_MS = 30_000;

export async function resolveMembership(): Promise<Membership> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), STATUS_DEADLINE_MS);

  try {
    const res = await clientApi.get<unknown>("/api/auth/status", {
      cache: "no-store",
      signal: controller.signal,
    });
    return isUnusableUserStatus(readUserStatus(res.data)) ? "guest" : "member";
  } catch (error) {
    const { status, code } = getApiErrorDetails(error);

    // 재발급까지 해 보고도 401 이면 세션이 정말 끊긴 것이다. 여기만 확정이다.
    if (status === 401) return "guest";

    // 재발급 서버가 잠깐 못 답했거나 회선이 안 닿았다 — 판정 불가.
    if (
      code === CLIENT_REISSUE_UNAVAILABLE_CODE ||
      code === CLIENT_NETWORK_UNREACHABLE_CODE
    ) {
      return "unknown";
    }

    // 나머지(5xx, 상한에 걸린 AbortError, 형태가 낯선 오류)도 확정할 근거가 없다.
    // 모르는 것은 모른다고 답한다.
    return "unknown";
  } finally {
    clearTimeout(deadline);
  }
}
