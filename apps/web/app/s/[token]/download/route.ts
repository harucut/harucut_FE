import { redirectToSharedPhoto } from "../sharedPhotoRedirect";

/** 공유한 사진 내려받기. 받는 사람 페이지의 「사진 저장」이 쓴다 — 첨부 파일 주소로 보낸다. */
export function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  return redirectToSharedPhoto(ctx, "downloadUrl");
}
