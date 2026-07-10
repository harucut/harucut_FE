import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

// 스웨거상 프로필 이미지 변경은 PATCH만 존재한다. (이전 POST 폴백 핸들러 제거)
export async function PATCH(req: Request) {
  return proxyJson(req, {
    method: "PATCH",
    url: `${BASE_URL}/api/auth/user/change/profile-image`,
  });
}

