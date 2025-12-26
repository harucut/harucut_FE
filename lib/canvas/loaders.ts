type LoadImageOptions = { crossOrigin?: "" | "anonymous" | "use-credentials" };
type LoadVideoOptions = {
  crossOrigin?: "" | "anonymous" | "use-credentials";
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  preload?: "auto" | "metadata" | "none";
};

export function loadImage(src: string, opts: LoadImageOptions = {}) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = opts.crossOrigin ?? "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load error"));
    img.src = src;
  });
}

export function loadVideo(src: string, opts: LoadVideoOptions = {}) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const v = document.createElement("video");
    v.src = src;

    v.crossOrigin = opts.crossOrigin ?? "anonymous";
    v.loop = opts.loop ?? true;
    v.muted = opts.muted ?? true;
    v.playsInline = opts.playsInline ?? true;
    v.preload = opts.preload ?? "metadata";

    const cleanup = () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("error", onError);
    };

    const onLoaded = () => {
      cleanup();
      resolve(v);
    };
    const onError = () => {
      cleanup();
      reject(new Error(v.error?.message ?? "video load error"));
    };

    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("error", onError);
  });
}
