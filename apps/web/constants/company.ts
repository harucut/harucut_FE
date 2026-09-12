// 사업자(전자상거래법 표시) 표시 값은 packages/shared가 단일 소스다.
// 약관 §14(legal.ts)도 같은 상수를 쓰므로 여기서 값을 다시 적지 않는다.
// 웹 코드가 이미 "@/constants/company"로 참조하고 있어 경로만 유지한다.
export { COMPANY, PAYMENTS_ENABLED } from "@harucut/shared";
