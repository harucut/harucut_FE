/*
  앱 셸이 사진을 저장할 때 만드는 파일 이름이 파일시스템 한도를 넘지 않는지 본다.

  이 파일이 막는 사고:
    웹은 표시 이름을 UTF-16 255자까지 허용하고(서버 displayName maxLength 255) 거기에
    `.png` 를 붙여 셸에 넘긴다(apps/web/lib/fourcutOutput.ts 의 buildDownloadFilename).
    앱의 safeFilename 은 금지 문자만 바꾸고 길이를 손대지 않아, 한글 최대 이름이 오면
    경로 구성요소가 769바이트가 됐다 — ext4·F2FS·APFS 의 255 한도를 훌쩍 넘는다.
    그러면 downloadAsync()/writeAsStringAsync() 가 ENAMETOOLONG 으로 실패하고,
    **서버가 받아 준 멀쩡한 이름인데 앱에서만 사진 저장이 안 된다.**

  못은 양쪽에 박는다. 길이를 줄이는 쪽만 보면 "이름을 통째로 폴백으로 바꿔 버리는" 수정도
  통과한다. 그래서 상한 안의 이름이 **그대로 남는지**, 확장자가 살아 있는지, 잘린 자리에
  깨진 바이트가 없는지도 같이 본다.

  **이 스위트가 증명하지 않는 것.** 여기서 지키는 것은 *규칙*(safeNativeFilename 의 셈)뿐이고,
  **앱이 그 규칙을 쓴다는 사실은 증명하지 않는다.** apps/mobile 에는 테스트 러너가 없어
  (`apps/mobile/package.json` 에 jest 가 없다) `native-bridge.ts` 의 `safeFilename` 이
  이 함수를 부르는지 여기서는 확인할 수 없다 — 그 본문을 예전 인라인 구현(금지 문자만 치환)
  으로 되돌려도 이 파일은 전부 초록이다. shell-origin.ts 와 같은 구조적 한계다.
  그러므로 **이 스위트가 초록이라고 "앱 저장이 고쳐졌다"고 읽으면 안 된다.** 앱 쪽 연결은
  코드 리뷰(호출부 한 줄)와 기기 확인으로만 담보된다.

  한도 숫자는 리터럴 255 로 잰다. 검증 대상 상수(NATIVE_FILENAME_MAX_BYTES)를 그대로 기준
  으로 쓰면 상수를 1024 로 바꿔도 통과해, 한도 자체를 지키는 못이 사라진다.
*/

import {
  NATIVE_FILENAME_MAX_BYTES,
  clampFilenameBytes,
  safeNativeFilename,
} from './native-filename';

/** 구현과 독립된 자로 잰다 — 구현이 쓰는 셈법을 그대로 빌려 오면 같이 틀린다. */
function utf8Bytes(value: string) {
  return Buffer.byteLength(value, 'utf8');
}

/** UTF-8 로 인코딩했다가 되돌렸을 때 원본과 같은가. 다르면 중간에서 잘린 바이트가 있다. */
function hasBrokenBytes(value: string) {
  return Buffer.from(value, 'utf8').toString('utf8') !== value;
}

// 웹이 실제로 만들어 보내는 최악의 세 이름(fourcutOutput.ts 의 DISPLAY_NAME_MAX_LENGTH 255).
const WORST_KOREAN = `${'가'.repeat(255)}.png`;
const WORST_ASCII = `${'a'.repeat(255)}.png`;
// 이모지 127개 = UTF-16 254 코드 단위. clampDisplayName 은 코드 단위로 세므로 상한 안이고,
// 서로게이트 페어를 일부러 보존하니 이 이름은 서버·웹을 **손대지 않은 채로** 통과한다.
const WORST_EMOJI = `${'🌊'.repeat(127)}.png`;

describe('네이티브 저장 파일명 — 길이 한도', () => {
  it('한도는 255바이트다', () => {
    // 나머지 못이 리터럴 255 로 재는 근거. 상수를 옮기면 여기서 먼저 걸린다.
    expect(NATIVE_FILENAME_MAX_BYTES).toBe(255);
  });

  it('서버가 받아 주는 한글 최대 이름을 255바이트 안으로 줄인다', () => {
    // 고치기 전: 769바이트. 이 이름으로 downloadAsync 가 실패했다.
    expect(utf8Bytes(WORST_KOREAN)).toBe(769);

    const safe = safeNativeFilename(WORST_KOREAN, 'harucut-1.png');
    expect(utf8Bytes(safe)).toBeLessThanOrEqual(255);
  });

  it('ASCII 최대 이름(259바이트)도 줄인다', () => {
    expect(utf8Bytes(WORST_ASCII)).toBe(259);

    const safe = safeNativeFilename(WORST_ASCII, 'harucut-1.png');
    expect(utf8Bytes(safe)).toBeLessThanOrEqual(255);
  });

  it('이모지 최대 이름(512바이트)도 줄인다 — 아스트랄 문자는 4바이트로 센다', () => {
    // 웹이 이 이름을 그대로 내보낸다는 것부터 못을 박는다. UTF-16 254 코드 단위라
    // clampDisplayName(코드 단위 255)의 상한 안이고, 잘리지도 다듬어지지도 않는다.
    expect(WORST_EMOJI.length - '.png'.length).toBe(254);
    expect(utf8Bytes(WORST_EMOJI)).toBe(512);

    const safe = safeNativeFilename(WORST_EMOJI, 'harucut-1.png');
    expect(utf8Bytes(safe)).toBeLessThanOrEqual(255);

    // 여기까지가 4바이트 분기를 실제로 가르는 자리다. 아스트랄을 3바이트로 세면 예산
    // 251 에 83개가 들어간다고 착각해 **336바이트**를 내놓는다 — 한도를 다시 넘어
    // 원래 ENAMETOOLONG 결함이 이모지 이름에서 그대로 되살아난다.
    expect(safe).toBe(`${'🌊'.repeat(62)}.png`);
    expect(utf8Bytes(safe)).toBe(252);
  });

  it('잘라도 확장자는 남는다 — 안드로이드는 확장자로 MIME 을 정한다', () => {
    expect(safeNativeFilename(WORST_KOREAN, 'harucut-1.png').endsWith('.png')).toBe(true);
    expect(safeNativeFilename(WORST_ASCII, 'harucut-1.png').endsWith('.png')).toBe(true);
  });

  it('잘린 자리에 깨진 UTF-8 바이트가 남지 않는다', () => {
    const safe = safeNativeFilename(WORST_KOREAN, 'harucut-1.png');
    expect(hasBrokenBytes(safe)).toBe(false);
    // 한글은 3바이트라 251바이트 예산에 83자(249바이트)까지 들어간다. 남는 2바이트를
    // 억지로 채우려 들면 글자가 쪼개진다.
    expect(safe).toBe(`${'가'.repeat(83)}.png`);
  });

  it('이모지(서로게이트 페어)를 반으로 쪼개지 않는다', () => {
    // 4바이트 이모지를 예산 경계에 걸리게 둔다 — 예산 5바이트, 이름 예산 1바이트.
    const clamped = clampFilenameBytes('🌊🌊.png', 9);
    expect(hasBrokenBytes(clamped)).toBe(false);
    expect(clamped).toBe('🌊.png');
    expect(utf8Bytes(clamped)).toBe(8);
  });

  it('상한 안의 이름은 손대지 않는다', () => {
    // 반대쪽 못. 길이만 보고 전부 폴백으로 바꾸는 수정을 막는다.
    expect(safeNativeFilename('여름 바다.png', 'harucut-1.png')).toBe('여름 바다.png');
    expect(clampFilenameBytes(`${'가'.repeat(83)}.png`)).toBe(`${'가'.repeat(83)}.png`);
  });
});

describe('네이티브 저장 파일명 — 씻기와 가장자리', () => {
  it('경로 구분자와 금지 문자를 바꾼다', () => {
    // 예전 동작 그대로. 길이 제한을 넣으면서 이쪽이 사라지면 경로를 벗어난다.
    expect(safeNativeFilename('a/b\\c:d*e?f"g<h>i|j.png', 'harucut-1.png')).toBe(
      'a_b_c_d_e_f_g_h_i_j.png',
    );
  });

  it('이름이 비거나 공백뿐이면 폴백을 쓴다', () => {
    expect(safeNativeFilename('', 'harucut-1.png')).toBe('harucut-1.png');
    expect(safeNativeFilename('   ', 'harucut-1.png')).toBe('harucut-1.png');
  });

  it('전부 금지 문자면 치환된 이름이 남는다 — 폴백까지 가지 않는다', () => {
    expect(safeNativeFilename('///', 'harucut-1.png')).toBe('___');
  });

  it('잘라서 이름이 사라지면 폴백을 쓴다 — `.png` 만 남기지 않는다', () => {
    // 확장자만 남은 이름은 숨김 파일이라 이름이 아니다.
    expect(clampFilenameBytes('🌊.png', 5)).toBe('');
    expect(safeNativeFilename('🌊.png', 'fb.png', 5)).toBe('fb.pn');
  });

  it('확장자 자리가 상한보다 크면 확장자를 포기하고 이름을 남긴다', () => {
    // `a.<300자>` 같은 입력. 확장자를 지키려다 결과가 빈 이름이 되는 것을 막는다.
    const clamped = clampFilenameBytes(`a.${'b'.repeat(300)}`, 10);
    expect(clamped).toBe('a.bbbbbbbb');
    expect(utf8Bytes(clamped)).toBe(10);
  });

  it('점으로 시작하는 이름도 앞에서부터 자른다', () => {
    // `.gitignore` 처럼 점으로 시작하는 이름. 여기서 재는 것은 **결과**다.
    //
    // 예전 주석은 이 테스트가 `dot > 0` 가드를 지킨다고 적었는데 사실이 아니다.
    // `dot === 0` 이면 `dot >= 0` 으로 바꿔도 결과가 같다 — 확장자가 이름 전체가 되고,
    // 상한 안이면 이미 조기 반환했으니 `extensionBytes >= maxBytes` 가 언제나 참이라
    // 같은 truncateUtf8 로 떨어진다. 그 가드를 가르는 입력은 없다(native-filename.ts 주석).
    expect(clampFilenameBytes(`.${'a'.repeat(300)}`, 10)).toBe('.aaaaaaaaa');
  });

  /*
    회귀 — **2바이트 문자도 2바이트로 센다.**

    아스트랄(4바이트) 분기와 같은 부류의 실재 결함이다. 웹의 표시 이름 검사는 길이를
    UTF-16 코드 단위로 세므로 `é` 255자짜리 이름은 서버·웹이 그대로 통과시킨다. 그 이름은
    UTF-8 로 510바이트라 반드시 잘려야 하는데, 여기서 1바이트로 세면 「안 잘라도 된다」가
    되어 원래 결함이 그대로 되살아난다. 3바이트로 세면 반대로 필요 이상 잘라 낸다.
  */
  it("2바이트 문자를 2바이트로 센다", () => {
    // 라틴 확장 한 글자는 UTF-8 로 2바이트다. 예산을 정확히 그 경계에 세운다.
    const name = "é".repeat(255) + ".png";
    const safe = safeNativeFilename(name, "fallback.png");

    // 255바이트 예산에서 확장자 4바이트를 빼면 251바이트 → 2바이트 문자 125개.
    expect(safe).toBe("é".repeat(125) + ".png");
    expect(utf8Bytes(safe)).toBe(254);
    expect(utf8Bytes(safe)).toBeLessThanOrEqual(255);
  });

  /*
    경계 — 확장자만으로 예산이 **꽉 차는** 자리(`extensionBytes >= maxBytes`)의 등호.
    확장자가 예산과 정확히 같으면 이름을 한 글자도 담을 수 없으므로 확장자를 붙들 이유가
    없다. `>` 로 바꾸면 빈 이름 + 확장자가 나온다.
  */
  it("확장자가 예산을 정확히 채우면 확장자에 매달리지 않는다", () => {
    // 확장자 ".bbbb"(5바이트)에 예산도 5바이트 — 딱 맞아떨어지는 자리다.
    const clamped = clampFilenameBytes("aaa.bbbb", 5);

    // 확장자를 붙들면 이름 예산이 0 이 되어 **빈 이름**이 나온다. 그러느니 확장자를
    // 포기하고 앞에서부터 채운다. (경계를 `>` 로 두면 여기서 빈 문자열이 된다.)
    expect(clamped).toBe("aaa.b");
    expect(utf8Bytes(clamped)).toBeLessThanOrEqual(5);
  });
});
