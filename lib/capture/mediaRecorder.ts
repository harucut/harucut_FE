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
