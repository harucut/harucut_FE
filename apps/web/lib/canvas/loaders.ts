type LoadImageOptions = { crossOrigin?: "" | "anonymous" | "use-credentials" };

/** 이미지 로드 (CORS 옵션 포함) */
export function loadImage(src: string, opts: LoadImageOptions = {}) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = opts.crossOrigin ?? "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load error"));
    img.src = src;
  });
}
