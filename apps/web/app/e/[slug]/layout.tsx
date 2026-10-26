import { neutralEventMetadata, neutralEventViewport } from "@/lib/event/eventMetadata";

// 첫 HTML 은 행사 이름 없이 중립으로 둔다. 행사 이름은 참가 정보를 받은 뒤 화면이 채운다(P2B 에서
// 게시 테마·주최자 아이콘으로 바꾼다). 하루컷 제목·아이콘으로 대체하지 않는다(기획 R5 18절).
export const metadata = neutralEventMetadata("행사 촬영");
export const viewport = neutralEventViewport;

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return children;
}
