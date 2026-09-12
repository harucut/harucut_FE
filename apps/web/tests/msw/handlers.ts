import type { RequestHandler } from "msw";

// 이 배열은 의도적으로 비어 있다 — jest 테스트 중에 실제로 나가는 네트워크 요청이 없어서
// 가로챌 것이 없다. 그래도 서버는 계속 띄운다: jest.setup.ts 의
// `server.listen({ onUnhandledRequest: "error" })` 가 실수로 네트워크를 타는 테스트를
// 그 자리에서 실패시키는 감시자이고, msw 를 의존성으로 남겨 두는 이유가 그 감시자다.
// 실제로 모킹할 요청이 생기면 여기에 핸들러를 추가한다.
export const handlers: RequestHandler[] = [];
