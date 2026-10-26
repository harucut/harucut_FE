export const GUEST_TRIAL_COOKIE = "harucut_guest_trial";

/** 비회원 체험 쿠키의 유효기간(초). 클라이언트와 프록시가 같은 값을 쓴다. */
export const GUEST_TRIAL_COOKIE_MAX_AGE = 604800;

/** 공개 CTA. 프론트 프록시가 쿠키만 보고 촬영으로 보내며 백엔드를 부르지 않는다. */
export const PUBLIC_SHOOT_ENTRY = "/shoot/start";
