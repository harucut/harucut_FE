"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, RemoteFrame } from "@/lib/api-types";
import type { CreateFrameRequest } from "@/lib/frameApi";

export async function listMyFrames() {
  const res = await clientApi.get<ApiEnvelope<RemoteFrame[]>>("/api/client/user/frame");
  return res.data.data ?? [];
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
