import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 기기의 활성 회차 — version 이 다르면 job·결과 토큰을 싣지 않는다. 부스 기기 자격(X-Booth-Token). 쿠키는 넘기지 않는다(ADR-0007). */
export async function GET(req: Request) {
  const incoming = new URL(req.url).searchParams;
  const search = new URLSearchParams();
  const version = incoming.get("version");
  if (version !== null) search.set("version", version);
  const query = search.size > 0 ? `?${search.toString()}` : "";

  return proxyJson(req, {
    method: "GET",
    // 쿼리는 템플릿 밖에서 붙인다 — 계약 검사(scripts/check_backend_contract.py)가 템플릿 속 ${…} 를 경로 변수로 읽는다.
    url: `${BASE_URL}/api/booth/capture-runs/current` + query,
    eventCredential: "booth",
  });
}
