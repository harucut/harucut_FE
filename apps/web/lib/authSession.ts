"use client";

import { clientApi } from "@/lib/clientApi";
import { isUnusableUserStatus, readUserStatus } from "@/lib/authUserStatus";

/**
 * 지금 이 브라우저가 **앱을 쓸 수 있는 회원**인가.
 *
 * 인증 쿠키(accessToken/refreshToken)는 httpOnly 라 클라이언트가 직접 읽지 못한다. 서버에
 * 물어보는 것이 유일한 길인데, 두 가지를 같이 챙겨야 한다.
 *
 * ① **만료된 액세스 토큰은 재발급한다.** 그래서 생 `fetch` 가 아니라 `clientApi` 로 부른다.
 * 액세스 JWT 만 만료되고 refresh 쿠키가 멀쩡한 회원은 흔한데(백엔드는 refresh 를 access 로
 * 받아 주지 않는다 — docs/backend-contract.md), 생 `fetch` 는 그 401 을 그대로 받아 「비회원」
 * 이 된다. `clientApi` 는 401 에서 한 번 재발급하고 원 요청을 다시 보낸다(lib/clientApi.ts).
 *
 * ② **200 이라고 앱을 쓸 수 있는 것은 아니다.** `/api/auth/status` 는 탈퇴요청·탈퇴·차단
 * 계정에도 200 을 준다(복구 진입로를 열어 둔 예외다). 그래서 본문의 `userStatus` 를 함께
 * 본다. 판정의 소유자는 `lib/authUserStatus.ts` 이고 `/api/auth/session` 라우트도 같은 것을 쓴다.
 *
 * `/api/auth/session` 을 부르지 않는 이유가 여기 있다 — 그쪽은 판정을 대신 해 주지만
 * 언제나 200 이라 `clientApi` 의 401 재발급이 걸리지 않는다.
 *
 * 조회가 실패하면(네트워크·5xx·재발급까지 실패한 401) **비회원으로 본다.** 이 답을 쓰는
 * 두 자리가 모두 그쪽으로 실패해야 안전하다 — 촬영 CTA 는 게스트 안내를 띄워야 비회원이
 * 촬영을 할 수 있고, 행사 진입은 게스트로 전환해야 가입 없이 찍을 수 있다.
 */
export async function isUsableMember() {
  try {
    const res = await clientApi.get<unknown>("/api/auth/status", {
      cache: "no-store",
    });
    return !isUnusableUserStatus(readUserStatus(res.data));
  } catch {
    return false;
  }
}
