import { NextResponse } from "next/server";

type ProxyOptions = {
  url: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  forwardBody?: boolean;
  contentType?: string;
  extraHeaders?: Record<string, string>;
};

type ForwardResult = {
  ok: boolean;
  status: number;
  body: string;
  contentType: string;
  setCookie: string | null;
};

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
    setCookie: upstream.headers.get("set-cookie"),
  };
}

export function buildResponse(result: ForwardResult) {
  const res = new NextResponse(result.body, {
    status: result.status,
    headers: { "Content-Type": result.contentType },
  });
  if (result.setCookie) res.headers.set("set-cookie", result.setCookie);
  return res;
}

export async function proxyJson(req: Request, options: ProxyOptions) {
  const result = await forward(req, options);
  return buildResponse(result);
}
