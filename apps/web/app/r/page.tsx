import { ResultReceiver } from "@/components/participation/ResultReceiver";

/**
 * 개인 결과 수령 `/r#<token>`(기획 R5 4·16절).
 *
 * 토큰은 fragment 에만 있다 — 첫 요청에 서버로 가지 않으므로 이 페이지의 HTML·로그·미리보기
 * 크롤러는 토큰을 모른다. 그래서 서버가 그리는 것은 중립 껍데기뿐이고, 결과·행사 디자인은
 * 브라우저가 토큰으로 결과 API 를 부른 뒤에 그린다.
 */
export default function ResultPage() {
  return <ResultReceiver />;
}
