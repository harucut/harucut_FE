"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, RemoteFrame } from "@/lib/api-types";
import type { CreateFrameRequest } from "@/lib/frameApi";

export async function listMyFrames() {
  const res = await clientApi.get<ApiEnvelope<RemoteFrame[]>>("/api/client/user/frame");
  // 서버는 내 프레임 뒤에 기본 제공(시스템) 프레임을 붙여 내려준다. 그건 내 소유가 아니라
  // 수정/삭제가 403이므로 '저장한 프레임' 목록에서는 제외한다(꾸미고 저장하는 순간 작업분이 날아간다).
  // 읽기 전용 '기본 제공' 섹션이 생기면 그때 따로 노출한다.
  return (res.data.data ?? []).filter((frame) => !frame.isSystem);
}

export async function getFrame(frameId: number) {
  const res = await clientApi.get<ApiEnvelope<RemoteFrame>>(
    `/api/client/user/frame/${frameId}`,
  );
  return res.data.data;
}

export async function createFrame(body: CreateFrameRequest) {
  await clientApi.post<ApiEnvelope<null>>("/api/client/user/frame", body);
}

export async function updateFrame(frameId: number, body: CreateFrameRequest) {
  await clientApi.put<ApiEnvelope<null>>(`/api/client/user/frame/${frameId}`, body);
}

export async function deleteFrame(frameId: number) {
  await clientApi.delete<ApiEnvelope<null>>(`/api/client/user/frame/${frameId}`);
}
