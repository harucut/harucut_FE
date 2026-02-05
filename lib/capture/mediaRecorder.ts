/**
 * 브라우저에서 지원하는 WebM 코덱을 우선순위로 선택
 */
export function getBestWebmMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;

  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];

  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}
