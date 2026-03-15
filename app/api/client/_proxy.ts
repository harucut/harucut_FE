import { NextResponse } from "next/server";
import {
  adaptSetCookiesForRequest,
  getSetCookieHeaders,
} from "@/lib/server/setCookies";

type ProxyOptions = {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  forwardBody?: boolean;
  contentType?: string;
  extraHeaders?: Record<string, string>;
};

type ForwardResult = {
  ok: boolean;
  status: number;
  body: string;
  contentType: string;
  setCookies: string[];
};

type RequestLike = Pick<Request, "headers" | "url">;

export async function forward(
  req: Request,
  options: ProxyOptions,
): Promise<ForwardResult> {
  const cookie = req.headers.get("cookie") ?? "";
  const shouldForwardBody =
    options.forwardBody ?? (options.method !== "GET" && options.method !== "DELETE");
  const body = shouldForwardBody ? await req.text() : undefined;

  const headers: Record<string, string> = { ...(options.extraHeaders ?? {}) };
  if (body !== undefined) {
    headers["Content-Type"] = options.contentType ?? "application/json";
  }
  if (cookie) headers.cookie = cookie;

  const upstream = await fetch(options.url, {
    method: options.method,
    headers,
    body,
    cache: "no-store",
  });

  const responseBody = await upstream.text();
  const contentType =
    upstream.headers.get("content-type") ?? "application/json";

  return {
    ok: upstream.ok,
    status: upstream.status,
    body: responseBody,
    contentType,
    setCookies: getSetCookieHeaders(upstream.headers),
  };
}

export function buildResponse(result: ForwardResult, req?: RequestLike) {
  const res = new NextResponse(result.body, {
    status: result.status,
    headers: { "Content-Type": result.contentType },
  });
  const setCookies = req
    ? adaptSetCookiesForRequest(result.setCookies, req)
    : result.setCookies;

  for (const cookie of setCookies) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}

export async function proxyJson(req: Request, options: ProxyOptions) {
  const result = await forward(req, options);
  return buildResponse(result, req);
}
