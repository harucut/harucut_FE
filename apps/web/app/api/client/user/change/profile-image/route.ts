import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

export async function PATCH(req: Request) {
  return proxyJson(req, {
    method: "PATCH",
    url: `${BASE_URL}/api/auth/user/change/profile-image`,
  });
}

export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/user/change/profile-image`,
  });
}

