import { buildResponse, forward, proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type")?.trim();
  const page = searchParams.get("page")?.trim();
  const size = searchParams.get("size")?.trim();

  // forward()는 options.url만 사용하고 들어온 쿼리스트링을 전달하지 않으므로,
  // 페이지네이션 파라미터(page/size)도 여기서 명시적으로 백엔드 URL에 붙여야 한다.
  const url = new URL(`${BASE_URL}/api/auth/user/media`);
  if (type) url.searchParams.set("type", type);
  if (page) url.searchParams.set("page", page);
  if (size) url.searchParams.set("size", size);

  const upstream = await forward(req, {
    method: "GET",
    url: url.toString(),
    forwardBody: false,
  });

  return buildResponse(upstream, req);
}

export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/user/media`,
  });
}
