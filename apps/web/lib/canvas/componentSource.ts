/**
 * 프레임 컴포넌트를 **화면에 그릴 때** 쓸 이미지 주소.
 *
 * 저장 뒤 `source` 는 S3 key 가 된다(서버가 key 만 읽기 때문 — 자세한 이유는
 * `lib/types/themeEditor.ts` 의 `source` 주석). key 는 그대로 `<img src>` 에 넣을 수
 * 없으므로, 그릴 때 쓸 주소를 `renderUrl` 에 따로 들고 다닌다.
 *
 * 아직 올리지 않은 것(로컬 blob URL, `/stickers/x.png` 같은 기본 스티커)은 `source` 가
 * 곧 주소라 그대로 쓴다.
 */
export function componentImageSrc(component: {
  source: string;
  renderUrl?: string;
}): string {
  return component.renderUrl?.trim() || component.source;
}

/** 서버에 올려야 하는 자산인지 — 아직 S3 key 가 아닌 이미지인지 본다. */
export function needsUpload(source: string): boolean {
  const value = source.trim();
  if (!value) return false;
  // 이미 key 로 보이면(우리 업로드 경로) 그대로 둔다.
  if (value.startsWith("uploads/")) return false;
  return (
    value.startsWith("/") ||
    value.startsWith("blob:") ||
    value.startsWith("data:") ||
    /^https?:\/\//i.test(value)
  );
}
