import { jwtVerify, JWTPayload } from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);

export type AuthUserPayload = JWTPayload & {
  userId: string;
  email: string;
};

export async function verifyAccessToken(
  token: string
): Promise<AuthUserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, {
      algorithms: ["HS256"],
    });
    return payload as AuthUserPayload;
  } catch {
    return null;
  }
}
