import { redirectToSharedPhoto } from "../sharedPhotoRedirect";

/** 공유한 사진 그림. 받는 사람 페이지의 사진과 미리보기(og:image)가 이 주소를 쓴다. */
export function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  return redirectToSharedPhoto(ctx, "imageUrl");
}
