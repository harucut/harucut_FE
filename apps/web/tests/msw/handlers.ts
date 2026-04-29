import { rest } from "msw";

type ApiEnvelope<T> = {
  code: string;
  status: number;
  message: string;
  data: T;
};

export function apiEnvelope<T>(data: T, status = 200, message = "OK"): ApiEnvelope<T> {
  return {
    code: `GEN-${status}`,
    status,
    message,
    data,
  };
}

export const handlers = [
  rest.get("/api/auth/session", (_req, res, ctx) => {
    return res(ctx.json({ authenticated: false }));
  }),
  rest.get(/\/api\/auth\/status$/, (_req, res, ctx) => {
    return res(ctx.json(apiEnvelope({ authenticated: false })));
  }),
];
