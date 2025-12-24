import { jwtVerify } from "jose";

const secret = process.env.JWT_ACCESS_SECRET;
if (!secret) {
  throw new Error("JWT_ACCESS_SECRET is not set");
}

const SECRET = new TextEncoder().encode(secret);

export async function verifyAccessToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET, {
      algorithms: ["HS256"],
    });

    return payload;
  } catch {
    return null;
  }
}
