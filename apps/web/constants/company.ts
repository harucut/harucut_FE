// 사업자(전자상거래법 표시) 단일 소스. 푸터 등 공통으로 참조한다.
// TODO: mailOrderNo(통신판매업신고번호)는 발급 후 실제 번호로 교체.
export const COMPANY = {
  /** 상호 */
  name: "베일런(Vailen)",
  /** 대표자 */
  owner: "김규원",
  /** 사업자등록번호 */
  bizRegNo: "819-32-01933",
  /** 통신판매업신고번호 (발급 전 placeholder) */
  mailOrderNo: "2026-인천서구-2643",
  /** 사업장 소재지 */
  address:
    "인천광역시 서구 서곶로 45, 103동 4301호 (가정동, 루원 린스트라우스 더 린시티)",
  /** 고객문의 이메일 (공통) */
  email: "gyuwon05@gmail.com · 010-2412-0339",
} as const;
