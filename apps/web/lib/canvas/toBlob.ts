/** 캔버스 인코딩 실패를 빈 파일 성공으로 처리하지 않는다. PNG는 투명도를 보존한다. */
export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("이미지를 만들지 못했어요."));
      else resolve(blob);
    }, type, quality);
  });
}
