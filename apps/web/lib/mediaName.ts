/**
 * 사진 이름 판정 — 기록 화면(lib/userMediaPreview.ts)과 공유 링크 페이지(app/s/[token]/page.tsx)가 같이 쓴다.
 * 공유 페이지는 서버가 그려서 "use client" 모듈의 함수를 부를 수 없다. 그래서 여기로 뺐다.
 */

/** 표시용으로 확장자를 뗀다. 서버는 저장할 때 이름 뒤에 확장자를 붙여서 돌려준다. */
export function withoutExtension(name: string) {
  return name.replace(/\.(png|jpe?g|webp|gif|heic|mp4|mov)$/i, "").trim();
}

/**
 * 사람이 붙인 이름이 아니라 기계가 붙인 이름인지 가린다.
 *
 * 기록 목록의 제목이 `3f9a1c2e-...`(S3 키), `KakaoTalk_20260101_193355_1.jpg`(원본
 * 파일명), `harucut_20260416_213654`(서버 기본 이름) 중 하나였다. 셋 다 그날 무엇을
 * 찍었는지 알려주지 않고, 넉 장이 나란히 있으면 서로 구분도 안 된다.
 * 이런 이름은 제목으로 쓰지 않고 날짜로 대신한다.
 *
 * 판정은 **확장자를 뗀 몸통**으로 한다. 서버가 저장할 때 이름 뒤에 확장자를 붙여 주기 때문에
 * (실측: `연결점검` 으로 저장하면 `연결점검.png` 로 돌아온다), 확장자만 보고 버리면
 * 사용자가 직접 지은 이름까지 전부 날짜로 갈아치운다 — 기록 화면에서 이름을 바꿔도
 * 목록 제목이 그대로인 것처럼 보였다.
 */
export function isMachineName(name: string) {
  const stem = withoutExtension(name);
  if (!stem) return true;

  return (
    // 서버 기본 이름: harucut_20260416_213654
    /^harucut[_-]?\d{6,}/i.test(stem) ||
    // 메신저·카메라가 붙이는 이름: KakaoTalk_2026..., IMG_1234, PXL_2026..., Screenshot_...
    // 뒤에 숫자가 붙는 형태만 잡는다 — "IMG_우리집" 같은 건 사람이 지은 이름이다.
    /^(kakaotalk|img|image|photo|pxl|dsc|screenshot|scaled_image)[_-]?\d/i.test(stem) ||
    // UUID
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stem) ||
    // 숫자·기호뿐인 이름
    /^[\d_\-.\s]+$/.test(stem)
  );
}
