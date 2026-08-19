"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, RemoteFrame } from "@/lib/api-types";
import type { CreateFrameRequest } from "@/lib/frameApi";

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
  return res.data.data;
}

// 저장·수정 응답에는 방금 만들어진 프레임이 통째로 들어 있다(frameId 포함).
// 예전에는 응답이 비어 있어 목록을 다시 받아 id를 추측해야 했다.
export async function createFrame(body: CreateFrameRequest) {
  const res = await clientApi.post<ApiEnvelope<RemoteFrame>>(
    "/api/client/user/frame",
    body,
  );
  return res.data.data;
}

export async function updateFrame(frameId: number, body: CreateFrameRequest) {
  const res = await clientApi.put<ApiEnvelope<RemoteFrame>>(
    `/api/client/user/frame/${frameId}`,
    body,
  );
  return res.data.data;
}

export async function deleteFrame(frameId: number) {
  await clientApi.delete<ApiEnvelope<null>>(`/api/client/user/frame/${frameId}`);
}
