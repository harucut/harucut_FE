// 약관·처리방침이 "실제로 하는 일"보다 좁게 고지하지 않는지 본다.
//
// 이 파일이 생긴 이유: 갤러리 불러오기 고지가 두 번 사라졌다.
//   bbfdcbf `/decorate`·`/upload` 제거 — 약관·처리방침에서 "업로드" 문구를 8곳 지웠다.
//              그런데 갤러리 불러오기는 없어진 게 아니라 `/shoot/upload` 로 옮겨졌을 뿐이다.
//   009e905 그 중 7곳을 되살렸다 — 약관 제4조(서비스의 제공 및 변경) 하나가 빠졌다.
//
// 고른 사진 네 장은 회원 합성 경로에서 서버로 올라간다
// (apps/web/lib/fourcutCompose.ts 의 PRESIGNED_UPLOAD_TYPES.FOURCUT_SOURCE).
// 즉 얼굴이 담길 수 있는 갤러리 사진이 전송·처리되므로 고지가 빠지면 방침이 사실보다 좁다.
//
// 문구 자체를 통째로 비교하지 않는다 — 법무 검토로 표현이 바뀔 수 있다. 대신 "갤러리에서
// 불러온 사진을 다룬다"는 **사실이 각 조항에 남아 있는지**만 붙잡는다.

import { PRIVACY_POLICY, TERMS_OF_SERVICE } from './legal';

/** 해당 조항(heading 접두사)의 본문·항목을 한 덩어리 문자열로 모은다. */
function sectionText(doc: typeof TERMS_OF_SERVICE, headingPrefix: string) {
  const section = doc.sections.find((s) => s.heading.startsWith(headingPrefix));
  if (!section) throw new Error(`조항을 찾지 못했다: ${headingPrefix}`);
  return [...(section.paragraphs ?? []), ...(section.bullets ?? [])].join('\n');
}

/** 갤러리 불러오기를 가리키는 표현 중 하나라도 있으면 고지된 것으로 본다. */
const GALLERY_TERMS = ['갤러리', '업로드', '불러', '불러온', '불러오기'];

function mentionsGallery(text: string) {
  return GALLERY_TERMS.some((term) => text.includes(term));
}

describe('서비스 이용약관 — 갤러리 불러오기 고지', () => {
  // 회귀 지점. 제2조·제8조는 009e905 가 되살렸지만 제4조는 빠져 있었다.
  // 이용자가 "이 서비스가 내 파일로 무엇을 하는가"를 확인하는 곳이라 여기가 제일 중요하다.
  it('제4조 기능 목록에 갤러리 사진으로 결과물을 만든다는 항목이 있다', () => {
    expect(mentionsGallery(sectionText(TERMS_OF_SERVICE, '제4조'))).toBe(true);
  });

  it('제2조 서비스·콘텐츠 정의가 촬영 외에 불러온 사진도 포함한다', () => {
    expect(mentionsGallery(sectionText(TERMS_OF_SERVICE, '제2조'))).toBe(true);
  });

  it('제6조 금지행위가 타인 사진 업로드를 다룬다', () => {
    expect(mentionsGallery(sectionText(TERMS_OF_SERVICE, '제6조'))).toBe(true);
  });

  // 코드(apps/web/lib/protectedPaths.ts 의 GUEST_MEMBER_ONLY_PREFIXES = ["/shoot/upload"])가
  // 갤러리 불러오기를 회원 전용으로 막는다. 약관이 그 범위를 같이 적어야 화면과 어긋나지 않는다.
  it('제8조 비회원 범위가 갤러리 불러오기를 회원 전용으로 적는다', () => {
    expect(mentionsGallery(sectionText(TERMS_OF_SERVICE, '제8조'))).toBe(true);
  });
});

describe('개인정보 처리방침 — 갤러리 사진 수집 고지', () => {
  it('수집 항목에 촬영뿐 아니라 불러온 사진이 들어 있다', () => {
    const collected = sectionText(PRIVACY_POLICY, '1.');
    expect(collected).toContain('촬영');
    expect(mentionsGallery(collected)).toBe(true);
  });

  it('수집·이용 목적이 촬영 외에 사진 불러오기도 적는다', () => {
    expect(mentionsGallery(sectionText(PRIVACY_POLICY, '3.'))).toBe(true);
  });

  // 민감정보 조항은 "얼굴 사진을 생체정보로 가공하지 않는다"는 약속이다.
  // 그 약속의 대상에 업로드한 사진이 빠지면 서버로 올라가는 사진 절반이 약속 밖이 된다.
  it('민감정보 조항이 촬영한 얼굴과 업로드한 얼굴을 함께 다룬다', () => {
    const collected = sectionText(PRIVACY_POLICY, '1.');
    const sensitive = collected
      .split('\n')
      .find((line) => line.includes('생체인식정보'));
    expect(sensitive).toBeDefined();
    expect(mentionsGallery(sensitive as string)).toBe(true);
  });
});
