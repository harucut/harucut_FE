/**
 * 앱 셸이 사진을 저장할 때 쓰는 **파일 이름 씻기**.
 *
 * 앱 코드가 아니라 여기 두는 이유는 shell-origin.ts 와 같다 — 모바일 워크스페이스에는 테스트
 * 러너가 없는데(`apps/mobile/package.json` 에 jest 가 없다) 이 판정은 틀리면 조용히 실패한다.
 * 규칙만 떼어 웹 쪽 jest 로 지키고, 앱은 값(폴백 이름)만 붙여 준다
 * (`apps/mobile/lib/native-bridge.ts` 의 `safeFilename`).
 *
 * **이 분리가 증명하지 못하는 것.** native-filename.test.ts 가 지키는 것은 규칙뿐이다 —
 * *앱이 이 규칙을 쓴다*는 사실은 지키지 못한다. `safeFilename` 본문을 예전 인라인 구현으로
 * 되돌려도 shared 스위트는 전부 통과한다. 모바일에 러너가 없어서 생기는 구조적 한계이고
 * shell-origin.ts 도 같다. 그러니 **초록 스위트를 「앱 저장이 고쳐졌다」는 증거로 읽으면
 * 안 된다.** 그 연결은 호출부 리뷰와 기기 확인으로만 담보된다.
 *
 * **무엇이 잘못됐었나.** 앱은 금지 문자만 `_` 로 바꾸고 길이는 손대지 않았다. 그런데 웹은
 * 표시 이름을 **UTF-16 255자**까지 허용하고(서버 `displayName` maxLength 255,
 * `apps/web/lib/fourcutOutput.ts` 의 DISPLAY_NAME_MAX_LENGTH) 거기에 `.png` 를 붙여 보낸다
 * (`buildDownloadFilename`). 그래서 셸이 캐시에 만드는 경로 구성요소가
 *  - ASCII 최대 이름: 259바이트
 *  - 한글 최대 이름: 255자 × 3바이트 + 4 = **769바이트**
 * 가 된다. 서버가 받아 주는 멀쩡한 이름인데도 `downloadAsync()`/`writeAsStringAsync()` 가
 * ENAMETOOLONG 으로 실패해 **앱에서만 사진 저장이 안 된다.**
 *
 * **한도 255의 근거.** 안드로이드의 ext4·F2FS 는 경로 구성요소 하나가 **255바이트**이고,
 * iOS 의 APFS 도 255 를 넘는 이름을 거절한다(문서마다 "255 UTF-8 문자"로 적힌 곳과
 * "255바이트"로 적힌 곳이 갈린다). **바이트로 재면 둘 다 만족한다** — UTF-8 바이트 수는
 * 언제나 문자 수 이상이라, 255바이트 이하면 255문자 이하이기도 하다. 그래서 더 빡빡한 쪽인
 * 바이트로 잰다.
 */
export const NATIVE_FILENAME_MAX_BYTES = 255;

/** 한 코드 포인트가 UTF-8 로 몇 바이트가 되는가. */
function utf8Size(codePoint: number) {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  // 짝을 잃은 서로게이트(0xd800~0xdfff)도 여기로 떨어진다. 인코더가 U+FFFD 로 바꿔도
  // 3바이트라 셈이 어긋나지 않는다.
  if (codePoint <= 0xffff) return 3;
  // 아스트랄(이모지)은 4바이트다. 3으로 세면 조용히 한도를 넘는다 — 웹의 clampDisplayName 은
  // 길이를 UTF-16 코드 단위로 세므로 이모지 127개(254 코드 단위) 이름이 손대지 않은 채
  // 여기까지 온다. 그 이름에서 3바이트로 세면 251 예산에 83개가 들어간다고 착각해 336바이트를
  // 내놓고, 원래의 ENAMETOOLONG 결함이 이모지 이름에서 그대로 되살아난다.
  return 4;
}

/**
 * UTF-8 바이트 수. `TextEncoder` 를 쓰지 않는다 — Hermes(RN)와 jsdom 어디에나 있다고
 * 장담할 수 없고, 어차피 아래 자르기가 코드 포인트를 하나씩 훑어야 한다.
 */
function utf8Length(value: string) {
  let total = 0;
  for (const char of value) total += utf8Size(char.codePointAt(0) as number);
  return total;
}

/**
 * 상한 바이트를 넘지 않게 앞에서부터 채운다.
 *
 * `for...of` 로 도는 이유가 핵심이다 — **코드 포인트 단위**라 서로게이트 페어(이모지)가
 * 반으로 쪼개지지 않는다. `slice()` 로 UTF-16 자리를 세어 자르면 깨진 반쪽이 이름 끝에 남고,
 * 그 이름으로 만든 파일은 기기마다 다르게 깨져 보인다.
 *
 * 한계: 자소 클러스터(결합 문자·ZWJ 로 이어 붙인 가족 이모지)까지는 묶지 않는다.
 * `Intl.Segmenter` 가 Hermes 에 있다고 믿을 수 없어서다. 잘린 자리에서 이모지 하나가
 * 여러 조각으로 보일 수 있지만, **바이트가 깨지지는 않는다** — 파일은 정상으로 만들어진다.
 */
function truncateUtf8(value: string, maxBytes: number) {
  let used = 0;
  let out = '';

  for (const char of value) {
    const size = utf8Size(char.codePointAt(0) as number);
    if (used + size > maxBytes) break;
    used += size;
    out += char;
  }

  return out;
}

/**
 * 확장자를 지키면서 이름을 상한 바이트 안으로 줄인다. 상한 안이면 손대지 않는다.
 *
 * **확장자를 왜 살리나.** 안드로이드 `MediaLibrary.saveToLibraryAsync()` 는 확장자로 MIME 을
 * 정한다. `.png` 가 떨어져 나가면 길이 문제를 고치고도 사진첩 저장이 거절된다.
 *
 * 이름 쪽이 한 글자도 안 들어가면 **빈 문자열**을 돌려준다. 남는 것이 `.png` 뿐이면 그건
 * 이름이 아니라 숨김 파일이라, 그 판단은 폴백을 아는 호출부(safeNativeFilename)에 넘긴다.
 * 실제로는 상한 255바이트에 확장자 4바이트라 이 길로 오지 않는다 — 상한을 아주 작게 준
 * 경우와, 확장자 자리에 이름보다 긴 것이 온 경우를 덮는 가장자리다.
 */
export function clampFilenameBytes(
  name: string,
  maxBytes: number = NATIVE_FILENAME_MAX_BYTES,
) {
  if (utf8Length(name) <= maxBytes) return name;

  // 맨 앞의 점은 확장자 구분이 아니라 숨김 파일 표시다(`.gitignore`). dot > 0 으로 거른다.
  //
  // 다만 이 `> 0` 은 **의도를 적어 둔 방어일 뿐 동작을 가르지는 않는다.** dot === 0 이면
  // 확장자가 이름 전체가 되는데, 상한 안이면 위에서 이미 반환했으니 그 바이트 수는 언제나
  // maxBytes 보다 크다 — 아래 `extensionBytes >= maxBytes` 가 같은 truncateUtf8 로 보낸다.
  // 그래서 `>= 0` 으로 바꿔도 결과가 같고, 테스트로 가를 수 있는 입력이 없다.
  // 그래도 남겨 둔다: 위 조기 반환을 손대는 순간 이 가드가 유일한 방어가 된다.
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot) : '';
  const extensionBytes = utf8Length(extension);

  // 확장자가 상한을 통째로 먹으면 확장자로 보지 않는다. 그대로 두면 이름이 한 글자도 남지
  // 않아 결과가 비어 버린다.
  if (extension.length === 0 || extensionBytes >= maxBytes) {
    return truncateUtf8(name, maxBytes);
  }

  const base = truncateUtf8(name.slice(0, dot), maxBytes - extensionBytes);
  return base.length > 0 ? `${base}${extension}` : '';
}

/**
 * 표시 이름 하나를 파일시스템이 받아 주는 이름으로 바꾼다.
 *
 * 두 가지를 한다 — 경로 구분자·금지 문자 치환, 그리고 위의 길이 제한.
 * 씻은 뒤 남는 것이 없으면(전부 금지 문자였거나, 공백뿐이었거나, 잘라서 이름이 사라졌으면)
 * 호출부가 준 폴백을 쓴다. 폴백도 상한을 넘을 수 있으므로 같은 자로 잰다 — 다만 폴백은
 * 우리가 만든 짧은 이름이라 실제로는 잘리지 않는다.
 */
export function safeNativeFilename(
  name: string,
  fallback: string,
  maxBytes: number = NATIVE_FILENAME_MAX_BYTES,
) {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  const clamped = cleaned.length > 0 ? clampFilenameBytes(cleaned, maxBytes) : '';
  if (clamped.length > 0) return clamped;

  // 폴백은 확장자를 지킬 것도 없이 통째로 재단한다 — 여기까지 왔다는 것은 이미 이름이 없다.
  return truncateUtf8(fallback, maxBytes);
}
