"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, UserMedia } from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";

/**
 * 최근 것 몇 장만. **한 페이지만 부른다.**
 *
 * 홈은 최근 4장만 보여주는데 예전에는 `listMyMedia()` 로 보관함 전체를 순차로 긁었다
 * (100건씩 최대 100페이지). 이번 달/이번 주 개수를 프론트가 세느라 그랬는데, 그 숫자를
 * 걷어내면서 전체를 받을 이유도 없어졌다. 기록이 늘수록 첫 화면이 느려지던 자리다.
 */
export async function listRecentMedia(limit = 4) {
  const params = new URLSearchParams();
  params.set("page", "0");
  params.set("size", String(Math.max(1, limit)));
  const res = await clientApi.get<
    ApiEnvelope<{ content?: UserMedia[] } | UserMedia[]>
  >(`/api/client/user/media?${params.toString()}`);
  const data = res.data.data;
  const list = Array.isArray(data) ? data : (data?.content ?? []);
  return list.slice(0, limit);
}

export async function listMyMedia() {
  // 백엔드 GET /api/auth/user/media는 page(0부터)/size(기본 10) 기반 페이지네이션이라
  // 모든 페이지를 순회해 전체 미디어를 모은다. (이전엔 첫 페이지 10개 외 항목이 누락됐다)
  // data는 페이지네이션 객체({ content, totalPages, number })이거나(현행) 배열일 수 있어
  // 양쪽을 모두 방어한다. (이전엔 객체를 그대로 반환해 [...] 시 크래시)
  // 미디어는 사진 전용이라 type 필터는 두지 않는다.
  const out: UserMedia[] = [];
  let page = 0;
  for (let guard = 0; guard < 100; guard += 1) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("size", "100");
    const res = await clientApi.get<
      ApiEnvelope<
        | { content?: UserMedia[]; totalPages?: number; number?: number }
        | UserMedia[]
        | null
      >
    >(`/api/client/user/media?${params.toString()}`);
    const data = res.data.data;
    if (Array.isArray(data)) return data;
    out.push(...(data?.content ?? []));
    const current = data?.number ?? page;
    const totalPages = data?.totalPages ?? current + 1;
    if (current + 1 >= totalPages) break;
    page = current + 1;
  }
  return out;
}

/**
 * 방금 만들어진 미디어 한 건을 찾는다.
 *
 * 단건 조회 엔드포인트가 없어서 목록에서 고른다. 합성 결과는 항상 최신이라
 * 첫 페이지에 들어온다. 못 찾으면 null — 호출부가 download-url 로 폴백한다.
 */
export async function findMyMedia(mediaId: number) {
  const params = new URLSearchParams({ page: "0", size: "50" });
  const res = await clientApi.get<
    ApiEnvelope<{ content?: UserMedia[] } | UserMedia[] | null>
  >(`/api/client/user/media?${params.toString()}`);

  const data = res.data.data;
  const list = Array.isArray(data) ? data : (data?.content ?? []);
  return list.find((item) => item.mediaId === mediaId) ?? null;
}

export async function getMediaDownloadUrl(mediaId: number) {
  const res = await clientApi.get<ApiEnvelope<string>>(
    `/api/client/user/media/${mediaId}/download-url`,
  );
  return requireData(res.data, "다운로드 주소");
}

export async function updateMediaDisplayName(mediaId: number, displayName: string) {
  const res = await clientApi.patch<ApiEnvelope<UserMedia>>(
    `/api/client/user/media/${mediaId}/display-name`,
    { displayName },
  );
  return requireData(res.data, "이름을 바꾼 사진");
}

/**
 * 되돌릴 수 없는 DELETE 에 거는 **종료 상한**.
 *
 * `clientApi` 에는 기본 타임아웃이 없고 fetch 도 스스로 끝나지 않는다. 회선이 응답 없이
 * 멈추면 이 프라미스가 영영 안 끝나는데, 확인 다이얼로그는 실행 중에 취소·배경·Escape 를
 * 전부 막으므로(components/ui/ConfirmDialog.tsx) 그대로 두면 가드가 영구화된다 —
 * 사용자는 새로고침 말고 빠져나갈 길이 없다.
 *
 * 30초의 근거는 응답 시간이 아니다. DELETE 실측치는 재 보지 않았다. 이 저장소가 이미
 * 같은 이유로 걸어 둔 상한과 맞춘 것이다 — `ASSET_QUEUE_WAIT_LIMIT_MS`(30초,
 * lib/themeEditorStore.ts)는 "안 끝나면 저장 모달을 닫을 방법이 없다"를 막는 값이고,
 * 여기도 같은 모양의 문제다. 합성 폴링 상한(90초, lib/composeApi.ts)은 Lambda 콜드스타트를
 * 포함해 오래 도는 작업의 값이라 한 번 왕복하는 DELETE 에는 길다.
 *
 * 상한을 `clientApi` 기본값으로 올리지 않는다 — 그러면 성격이 제각각인 모든 요청의
 * 상한을 숫자 하나로 정하게 되고, 그러려면 전부를 재 봐야 한다. 지금 사용자가 갇히는
 * 자리는 되돌릴 수 없는 DELETE 둘뿐이라 거기에만 건다(짝: lib/remoteFrameApi.ts).
 */
const DELETE_DEADLINE_MS = 30_000;

/**
 * 상한을 넘겨 **우리가** 끊은 삭제.
 *
 * 사용자가 끊은 것(AbortError)과 구별하려고 이름을 새로 붙인다 — clientApi 는 취소를
 * 실패로 바꾸지 않고 그대로 올리고(isAbortError), 그 규약은 그대로 둔다.
 *
 * 호출부는 `instanceof` 가 아니라 **`name`** 으로 본다. 이 모듈을 통째로 목으로 갈아
 * 끼우는 테스트에서는 import 한 클래스가 undefined 가 되어 instanceof 자체가 터진다
 * (clientApi 가 AbortError 를 name 으로 보는 것과 같은 결의 다른 이유).
 * **이름을 바꾸면 호출부도 같은 커밋에서 고친다** — app/history/page.tsx.
 */
export class MediaDeleteTimeoutError extends Error {
  constructor() {
    super("사진 삭제가 상한 시간 안에 끝나지 않았다");
    this.name = "MediaDeleteTimeoutError";
  }
}

/**
 * 사진 삭제.
 *
 * 404(GEN-031)는 "없는 사진"과 "남의 사진"을 구분하지 않는다. 화면에서도 구분하지 말 것 —
 * 남의 것을 지우려 한 사람에게 "그건 존재한다"고 알려 주는 셈이 된다.
 *
 * 상한을 걸어도 남는 구멍 둘. 숨기지 말고 화면 문구에 반영한다.
 *  - **서버는 이미 지웠는데 응답만 못 받은 경우를 구별할 수 없다.** 끊긴 쪽에서는 요청이
 *    어디까지 갔는지 알 방법이 없다. 그래서 호출부 문구는 "지우지 못했어요"가 아니라
 *    "결과를 확인하지 못했어요"여야 한다.
 *  - **401 재발급 왕복에도 상한이 닿는다.** `clientApi` 가 이 signal 을 재발급을 기다리는
 *    쪽에 걸어(`Promise.race`), 끊기면 「재발급 못 했다」로 접고 원요청의 401 을 올린다.
 *    재발급 왕복 자체에도 같은 30초 상한이 있어(`REISSUE_DEADLINE_MS`) 아무도 안 기다리게
 *    된 뒤에도 매달려 있지 않는다. 한때 그 signal 이 안 닿아 다이얼로그가 갇혔는데,
 *    지금은 두 자리 다 닫혀 있다 — 되돌리지 않는다.
 */
export async function deleteMedia(mediaId: number) {
  const controller = new AbortController();
  let deadlineHit = false;
  const timer = setTimeout(() => {
    deadlineHit = true;
    controller.abort();
  }, DELETE_DEADLINE_MS);

  try {
    await clientApi.delete<ApiEnvelope<null>>(
      `/api/client/user/media/${mediaId}`,
      { signal: controller.signal },
    );
  } catch (error) {
    // 우리가 끊었을 때만 이름을 바꾼다. 상한이 지났으면 무슨 오류가 왔든 사용자가 기다린
    // 시간은 이미 상한을 넘겼고, 결과를 모르는 것도 같다 — 오류 모양을 더 따지지 않는다.
    if (deadlineHit) throw new MediaDeleteTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
