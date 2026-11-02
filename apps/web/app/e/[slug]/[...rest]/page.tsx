import { notFound } from "next/navigation";

// /e/{slug} 아래의 없는 주소도 행사의 중립 화면으로 받는다. 루트 404 는 하루컷 홈 링크를 보여 준다.
export default function EventUnknown() {
  notFound();
}
