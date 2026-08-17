export const GUEST_TRIAL_COOKIE = "harucut_guest_trial";

/** 비회원 체험 쿠키의 유효기간(초). 클라이언트와 프록시가 같은 값을 쓴다. */
export const GUEST_TRIAL_COOKIE_MAX_AGE = 604800;

/**
 * 행사 QR 진입을 알아보는 쿼리 이름.
 *
 * 행사장에서 QR을 찍은 사람은 쿠키가 하나도 없는 새 브라우저로 도착한다.
 * 이 값이 붙어 있으면 "가입 없이 체험하기"를 누른 것과 같은 상태로 시작시킨다.
 */
export const EVENT_ENTRY_QUERY = "event";
