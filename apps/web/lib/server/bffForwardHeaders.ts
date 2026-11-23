import { headers } from "next/headers";

/**
 * 백엔드에 실제 방문자 IP 를 BFF 비밀과 함께 넘기는 헤더(app/api/client/_proxy.ts 와 같은 규칙). 백엔드는 비밀이 맞을 때만
 * 이 IP 로 요청 제한을 건다. 비밀이 없거나 IP 를 모르면 비운다 — 백엔드는 접속 IP(이 서버)로 판정한다.
 */
export async function bffForwardHeaders(): Promise<Record<string, string>> {
  const secret = process.env.BFF_SHARED_SECRET;
  if (!secret) return {};
  const incoming = await headers();
  const clientIp = incoming.get("x-forwarded-for") ?? incoming.get("x-real-ip");
  return clientIp ? { "x-harucut-bff-secret": secret, "x-harucut-client-ip": clientIp } : {};
}
