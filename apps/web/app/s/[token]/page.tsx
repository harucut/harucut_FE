import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedPhotoView, SharedPhotoUnavailable } from "@/components/share/SharedPhotoView";
import { sharedPhotoTitle } from "@/lib/mediaShareLink";
import { loadSharedPhotoOnServer } from "@/lib/server/mediaShareServer";

/**
 * 공유 링크를 받은 사람이 여는 페이지(2026-11-16 「받은 사람은 사진만 볼 수 있게 다운로드 할 수 있는」).
 *
 * 사진과 「사진 저장」만 있다. 로그인을 묻지 않는다 — 계정 세션을 쓰지 않는 공개 페이지다(proxy.ts 가 이 경로를 보지 않는다).
 * 링크를 카카오톡·X·스레드에 붙이면 미리보기에 이 사진이 뜬다(og:image). 사진을 지우거나 보관 기간이 지나면 닫힌다.
 * 리퍼러·캐시·색인은 next.config.ts 가 막는다 — 주소 자체가 사진을 보는 권한이다.
 */
type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const lookup = await loadSharedPhotoOnServer(token);
  const robots = { index: false, follow: false };
  if (lookup.status !== "ok") {
    // 닫힌 링크의 미리보기에 하루컷 소개 그림을 띄우지 않는다 — 사진이 있는 줄 안다.
    return { title: "하루컷", description: null, openGraph: null, twitter: null, robots };
  }
  const title = sharedPhotoTitle(lookup.photo.displayName, lookup.photo.createdAt);
  const image = `/s/${encodeURIComponent(token)}/image`;
  // 설명은 두지 않는다. 미리보기는 사진과 이름이면 된다 — 루트의 하루컷 소개 문장이 사진 밑에 붙지 않게 지운다.
  return {
    title,
    description: null,
    openGraph: { title, type: "website", siteName: "harucut 하루컷", locale: "ko_KR", images: [{ url: image, alt: title }] },
    twitter: { card: "summary_large_image", title, images: [image] },
    robots,
  };
}

export default async function SharedPhotoPage({ params }: Props) {
  const { token } = await params;
  const lookup = await loadSharedPhotoOnServer(token);
  // 닫힌 링크는 404 로 답한다 — 미리보기 수집기가 죽은 링크를 사진 있는 링크처럼 붙들지 않게. 문구는 ./not-found.tsx.
  if (lookup.status === "closed") notFound();
  if (lookup.status === "unavailable") return <SharedPhotoUnavailable closed={false} />;

  const extension = lookup.photo.imageUrl.split(/[?#]/)[0].match(/\.(jpe?g|png|webp)$/i)?.[1]?.toLowerCase();
  return (
    <SharedPhotoView
      token={token}
      title={sharedPhotoTitle(lookup.photo.displayName, lookup.photo.createdAt)}
      extension={extension === "jpeg" ? "jpg" : (extension ?? "jpg")}
    />
  );
}
