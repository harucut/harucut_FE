// 비회원에게 "안 되는 것"을 세는 화면 문구가 실제 차단 범위보다 좁지 않은지 본다.
//
// 이 파일이 생긴 이유: 갤러리 불러오기가 목록에서 빠져 있었다.
//   apps/web/proxy.ts 는 비회원의 `/shoot/upload` 를 막아 `/shoot?guestNotice=restricted` 로
//   돌려보내고, 그 화면의 모달(guestTrialStore 의 showGuestRestrictedNotice)은
//   GUEST_MEMBER_ONLY_ITEMS 를 그대로 읽는다. 즉 막힌 사람은 **방금 막힌 것만 빼고**
//   나머지 세 가지를 안내받았다.
//
// 범위를 쥔 곳은 셋이다.
//   코드: apps/web/lib/protectedPaths.ts 의 GUEST_MEMBER_ONLY_PREFIXES(`/shoot/upload`)
//   고지: 약관 제8조(비회원 체험)
//   화면: 여기 GUEST_MEMBER_ONLY_ITEMS
// 한쪽만 바뀌면 화면이 거짓말을 한다. 이 파일은 화면과 고지가 같은 것을 가리키는지 붙잡는다.
//
// 문구를 통째로 비교하지 않는다 — 표현은 바뀔 수 있다. "갤러리에서 불러온 사진"이라는
// 사실이 목록에 남아 있는지만 본다.

import {
  GUEST_ALLOWED_ITEMS,
  GUEST_MEMBER_ONLY_ITEMS,
  GUEST_TRIAL_NOTICE,
} from './guest-trial';
import { TERMS_OF_SERVICE } from './legal';

/** 갤러리 불러오기를 가리키는 표현 중 하나라도 있으면 적힌 것으로 본다. */
const GALLERY_TERMS = ['갤러리', '불러'];

function mentionsGallery(text: string) {
  return GALLERY_TERMS.some((term) => text.includes(term));
}

/** 목록은 모달 문장 안에 그대로 박히므로, 읽는 쪽과 같은 방식으로 끊어 본다. */
function memberOnlyItems() {
  return GUEST_MEMBER_ONLY_ITEMS.split(',').map((item) => item.trim());
}

function termsSectionText(headingPrefix: string) {
  const section = TERMS_OF_SERVICE.sections.find((s) =>
    s.heading.startsWith(headingPrefix),
  );
  if (!section) throw new Error(`조항을 찾지 못했다: ${headingPrefix}`);
  return [...(section.paragraphs ?? []), ...(section.bullets ?? [])].join('\n');
}

describe('비회원 회원 전용 목록 — 갤러리 불러오기', () => {
  // 회귀 지점. 목록에 없으면 `/shoot/upload` 에서 막힌 사람이 이유를 못 듣는다.
  it('회원 전용 목록이 갤러리에서 사진 불러오기를 적는다', () => {
    expect(mentionsGallery(GUEST_MEMBER_ONLY_ITEMS)).toBe(true);
  });

  it('원래 있던 세 항목도 그대로 남아 있다', () => {
    expect(memberOnlyItems()).toEqual(
      expect.arrayContaining(['링크 공유', '기록 보관', '프레임 만들기']),
    );
  });

  it('항목이 빈 칸 없이 끊어 읽힌다', () => {
    const items = memberOnlyItems();
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items.every((item) => item.length > 0)).toBe(true);
    expect(new Set(items).size).toBe(items.length);
  });
});

describe('비회원 체험 허용 범위', () => {
  // 허용 쪽이 갤러리를 말하면 "불러오기가 된다"는 약속이 된다. 코드는 막고 있다.
  it('허용 목록은 촬영과 이미지 저장까지만 말한다', () => {
    expect(GUEST_ALLOWED_ITEMS).toBe('사진 촬영과 이미지 저장');
    expect(mentionsGallery(GUEST_ALLOWED_ITEMS)).toBe(false);
  });

  it('체험 시작 안내도 갤러리 불러오기를 약속하지 않는다', () => {
    expect(mentionsGallery(GUEST_TRIAL_NOTICE.message)).toBe(false);
  });
});

describe('약관 제8조와 화면 문구', () => {
  // 약관만 고치고 화면을 안 고치면(그 반대도) 다시 어긋난다. 둘을 묶어 둔다.
  it('약관이 회원 전용으로 적는 갤러리 불러오기를 화면 목록도 적는다', () => {
    expect(mentionsGallery(termsSectionText('제8조'))).toBe(true);
    expect(mentionsGallery(GUEST_MEMBER_ONLY_ITEMS)).toBe(true);
  });
});
