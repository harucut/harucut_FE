import type { Metadata, Viewport } from "next";

/**
 * 행사 화면(/e·/r·/booth)의 중립 메타데이터.
 *
 * 루트 레이아웃은 하루컷 제목·설명·applicationName·아이콘·manifest·OG 를 정한다. 세그먼트 metadata 는
 * 얕게 병합되어 같은 키를 이 값이 덮는다(설치된 Next 문서 generate-metadata.md:1346). 그래서 행사
 * 화면이 하루컷 브랜드로 대체되지 않게 키마다 명시한다(기획 R5 18절, F35). null 은 「내지 않는다」다.
 * 실제 참가 사진·비밀 토큰은 여기 넣지 않는다 — 결과 링크의 미리보기가 사진을 퍼 나르면 안 된다.
 */
export function neutralEventMetadata(title: string): Metadata {
  return {
    title,
    description: null,
    applicationName: null,
    authors: null,
    creator: null,
    publisher: null,
    manifest: null,
    icons: { icon: "/event-neutral.svg", apple: "/event-neutral.svg" },
    openGraph: { title, type: "website" },
    twitter: { card: "summary", title },
    // 결과 링크와 참가 화면은 검색에 올리지 않는다. robots.txt 로 막지 않는 이유는 next.config.ts 참고.
    robots: { index: false, follow: false },
  };
}

export const neutralEventViewport: Viewport = {
  themeColor: "#f6f6f4",
  viewportFit: "cover",
};
