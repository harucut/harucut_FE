"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, RemoteFrame } from "@/lib/api-types";
import type { CreateFrameRequest } from "@/lib/frameApi";
import { requireData } from "@/lib/apiEnvelope";

/**
 * 서버가 내려주는 프레임 **전부**. 내 프레임 + 기본 제공(시스템) 프레임이 섞여 있다.
 *
 * 시스템 프레임은 요금제 한도·보관 기간을 받지 않아서 BASIC 계정 목록에도 항상 들어온다.
 * 서버 합성이 요구하는 frameId 를 그중에서 찾으므로(lib/fourcutCompose.ts) 여기서 거르면 안 된다.
 */
export async function listAllFrames() {
  const res = await clientApi.get<ApiEnvelope<RemoteFrame[]>>("/api/client/user/frame");
  return res.data.data ?? [];
}

export async function listMyFrames() {
  // 시스템 프레임은 내 소유가 아니라 수정/삭제가 403이므로 '저장한 프레임' 목록에서는 제외한다
  // (꾸미고 저장하는 순간 작업분이 날아간다). 읽기 전용 '기본 제공' 섹션이 생기면 그때 따로 노출한다.
  return (await listAllFrames()).filter((frame) => !frame.isSystem);
}

export async function getFrame(frameId: number) {
  const res = await clientApi.get<ApiEnvelope<RemoteFrame>>(
    `/api/client/user/frame/${frameId}`,
  );
  return requireData(res.data, "프레임");
}

// 저장·수정 응답에는 방금 만들어진 프레임이 통째로 들어 있다(frameId 포함).
// 예전에는 응답이 비어 있어 목록을 다시 받아 id를 추측해야 했다.
export async function createFrame(body: CreateFrameRequest) {
  const res = await clientApi.post<ApiEnvelope<RemoteFrame>>(
    "/api/client/user/frame",
    body,
  );
  return requireData(res.data, "저장된 프레임");
}

export async function updateFrame(frameId: number, body: CreateFrameRequest) {
  const res = await clientApi.put<ApiEnvelope<RemoteFrame>>(
    `/api/client/user/frame/${frameId}`,
    body,
  );
  return requireData(res.data, "수정된 프레임");
}

/**
 * 프레임 삭제의 종료 상한. **숫자와 근거의 소유자는 `lib/userMediaApi.ts` 의
 * `DELETE_DEADLINE_MS` 주석이다** — 같은 값을 두 파일이 각자 들고 있다.
 *
 * 한곳으로 모을 자리는 `clientApi` 인데 거기 기본값으로 올리면 성격이 제각각인 모든
 * 요청의 상한을 숫자 하나로 정하게 된다. 사용자가 갇히는 자리는 확인 다이얼로그가 막고
 * 있는 되돌릴 수 없는 DELETE 둘뿐이라 거기에만 건다. **한쪽만 바꾸지 않는다.**
 */
const DELETE_DEADLINE_MS = 30_000;

/**
 * 상한을 넘겨 **우리가** 끊은 삭제. 사용자가 끊은 것(AbortError)과 구별하려고 이름을
 * 새로 붙인다 — clientApi 는 취소를 실패로 바꾸지 않고 그대로 올린다(isAbortError).
 *
 * 호출부는 `instanceof` 가 아니라 **`name`** 으로 본다. 이 모듈을 통째로 목으로 갈아
 * 끼우는 테스트에서는 import 한 클래스가 undefined 가 되어 instanceof 자체가 터진다
 * (ThemeEditorPage.test.tsx 가 그렇다). **이름을 바꾸면 호출부도 같은 커밋에서 고친다** —
 * components/theme/editor/ThemeEditorPage.tsx.
 */
export class FrameDeleteTimeoutError extends Error {
  constructor() {
    super("프레임 삭제가 상한 시간 안에 끝나지 않았다");
    this.name = "FrameDeleteTimeoutError";
  }
}

/**
 * 프레임 삭제.
 *
 * 상한을 걸어도 남는 구멍은 사진 삭제와 같다 — 끊긴 쪽에서는 서버가 이미 지웠는지 알 수
 * 없다(그래서 화면은 "지우지 못했어요"가 아니라 "결과를 확인하지 못했어요"라고 말한다).
 *
 * 401 재발급 왕복에는 **상한이 닿는다.** `clientApi` 가 이 signal 을 재발급을 기다리는 쪽에
 * 걸고, 재발급 왕복 자체에도 같은 30초 상한이 있다(`REISSUE_DEADLINE_MS`). 한때 안 닿아
 * 다이얼로그가 갇혔는데 지금은 닫혀 있다 — 되돌리지 않는다.
 */
export async function deleteFrame(frameId: number) {
  const controller = new AbortController();
  let deadlineHit = false;
  const timer = setTimeout(() => {
    deadlineHit = true;
    controller.abort();
  }, DELETE_DEADLINE_MS);

  try {
    await clientApi.delete<ApiEnvelope<null>>(
      `/api/client/user/frame/${frameId}`,
      { signal: controller.signal },
    );
  } catch (error) {
    if (deadlineHit) throw new FrameDeleteTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
