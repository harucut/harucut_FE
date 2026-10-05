import { decodeImageFile } from "@/lib/imageDecode";
import { MAX_UPLOAD_BYTES } from "@/lib/presignedUploadApi";
import { toTrustedImageUrl } from "@/lib/serverAssets";

/** 서버 원본을 직접 수정하지 않고, 저장 시 사용자 소유 파일로 복사한다. */
export async function fetchServerAssetFile(url: string): Promise<File> {
  const trusted = toTrustedImageUrl(url);
  if (!trusted) throw new Error("사용할 수 없는 소재 주소예요.");
  const res = await fetch(trusted, {
    credentials: "omit",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok || Number(res.headers.get("content-length")) > MAX_UPLOAD_BYTES) {
    throw new Error("소재를 불러오지 못했어요. 다시 선택해 주세요.");
  }
  const blob = await res.blob();
  if (!blob.size || blob.size > MAX_UPLOAD_BYTES)
    throw new Error("10MB 이하 소재만 사용할 수 있어요.");
  const name = new URL(trusted).pathname.split("/").pop() || "asset.png";
  const file = new File([blob], name, { type: blob.type });
  const decoded = await decodeImageFile(file);
  if (!decoded || decoded.width * decoded.height > 16_000_000) {
    throw new Error("소재의 크기가 너무 크거나 읽을 수 없어요.");
  }
  return file;
}
