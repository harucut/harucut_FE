import { apiEnvelopeData } from '@/lib/api-client';

export type PresignedUploadContentType = 'GIF' | 'JPEG' | 'PNG' | 'WEBP';
export type PresignedUploadType =
  | 'FOURCUT_PHOTO'
  | 'FRAME'
  | 'FRAME_COMPONENT'
  | 'PROFILE';

type PresignedUploadResponse = {
  contentType: string;
  expiresIn?: string;
  key: string;
  uploadUrl: string;
};

type UploadLocalFileOptions = {
  contentType?: PresignedUploadContentType;
  filename?: string | null;
  mimeType?: string | null;
  type: PresignedUploadType;
  uri: string;
};

// 백엔드 ContentType enum과 1:1. 확장자 집합·MIME 모두 서버 계약 그대로다.
const EXTENSION_TO_CONTENT_TYPE: Record<string, PresignedUploadContentType> = {
  gif: 'GIF',
  jpeg: 'JPEG',
  jpg: 'JPEG',
  png: 'PNG',
  webp: 'WEBP',
};

const MIME_TO_CONTENT_TYPE: Record<string, PresignedUploadContentType> = {
  'image/gif': 'GIF',
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
};

// presign 요청의 filename 확장자는 반드시 이 표를 따른다(서버가 확장자↔MIME 일치를 강제).
const CONTENT_TYPE_TO_EXTENSION: Record<PresignedUploadContentType, string> = {
  GIF: 'gif',
  JPEG: 'jpg',
  PNG: 'png',
  WEBP: 'webp',
};

// content:// 같은 점 없는 URI에서 경로 전체를 확장자로 오인하지 않도록,
// 마지막 '/' 뒤에 있는 점만 확장자로 인정한다(백엔드 extractExtension과 같은 규칙).
function extensionOf(value: string) {
  const withoutQuery = value.split('?')[0] ?? value;
  const dot = withoutQuery.lastIndexOf('.');
  const slash = withoutQuery.lastIndexOf('/');
  return dot > slash && dot >= 0 ? withoutQuery.slice(dot + 1).trim().toLowerCase() : '';
}

function baseNameOf(value: string) {
  const withoutQuery = value.split('?')[0] ?? value;
  const name = withoutQuery.split('/').pop()?.trim() ?? '';
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).trim();
}

/**
 * 업로드 형식과 파일명을 한 쌍으로 확정한다.
 *
 * 백엔드는 filename의 확장자와 contentType enum이 **같은 항목에 동시에 속할 때만** 통과시킨다
 * (아니면 415 GEN-051). 그래서 판정 기준을 확장자로 잡고, 확장자가 지원 목록 밖인데 MIME만
 * 맞는 경우(.jfif, iOS HEIC→jpeg 변환 보고 등)에는 파일명 확장자를 contentType에 맞춰 정규화한다.
 * S3 key의 확장자도 이 filename에서 나오므로 정규화가 곧 저장 형식 정합이 된다.
 */
export function resolveUpload(args: {
  contentType?: PresignedUploadContentType | null;
  filename?: string | null;
  mimeType?: string | null;
  uri?: string;
}): { contentType: PresignedUploadContentType; filename: string } {
  const rawName = args.filename?.trim() || '';
  const uri = args.uri ?? '';
  const base = baseNameOf(rawName) || baseNameOf(uri) || `harucut-${Date.now()}`;

  // 호출부가 형식을 이미 판정해 넘겼으면 그 값이 기준이다. 확장자·MIME으로 다시 추론하지 않는다.
  // (.jfif처럼 확장자는 표에 없고 MIME만 맞는 파일은 호출부가 asset.mimeType으로 판정해 넘기는데,
  //  여기서 재추론하면 mimeType 없이 온 그 값이 되레 미지원으로 튕긴다)
  if (args.contentType) {
    return {
      contentType: args.contentType,
      filename: `${base}.${CONTENT_TYPE_TO_EXTENSION[args.contentType]}`,
    };
  }

  const ext = extensionOf(rawName) || extensionOf(uri);
  const contentType =
    EXTENSION_TO_CONTENT_TYPE[ext] ??
    MIME_TO_CONTENT_TYPE[args.mimeType?.trim().toLowerCase() ?? ''];

  if (!contentType) {
    // 매칭 실패 시 JPEG으로 조용히 떨어뜨리지 않는다. .heic 같은 원본이 JPEG으로 presign·PUT되면
    // S3 Content-Type이 실제 바이트와 어긋나 나중에 렌더가 깨진다(웹과 동일하게 즉시 중단).
    throw new Error('지원하지 않는 이미지 형식이에요. JPG·PNG·WEBP·GIF 파일을 올려 주세요.');
  }

  return { contentType, filename: `${base}.${CONTENT_TYPE_TO_EXTENSION[contentType]}` };
}

export function resolveUploadContentType(args: {
  filename?: string | null;
  mimeType?: string | null;
  uri?: string;
}): PresignedUploadContentType {
  return resolveUpload(args).contentType;
}

// 스웨거 PresignedUploadRequest 는 contentType/filename/type 세 필드가 전부다(전부 required).
// 임시 업로드 구분(isTemp)은 서버 계약에 없어 보내지 않는다.
async function createPresignedUpload(args: {
  contentType: PresignedUploadContentType;
  filename: string;
  type: PresignedUploadType;
}) {
  return apiEnvelopeData<PresignedUploadResponse>(
    '/api/auth/user/files/presigned-upload',
    {
      body: args,
      method: 'POST',
    },
  );
}

export async function getPresignedImageUrl(key: string) {
  return apiEnvelopeData<string>(
    `/api/auth/user/files/presigned-img?key=${encodeURIComponent(key)}`,
    {
      cache: 'no-store',
    },
  );
}

export async function uploadLocalFileWithPresigned(opts: UploadLocalFileOptions) {
  // 호출부가 형식을 지정했으면 그 값을 그대로 따르고, 파일명 확장자만 형식에 맞춰 다시 붙인다.
  // (확장자와 contentType이 어긋나면 서버가 415로 거절한다)
  const { contentType, filename } = resolveUpload({
    contentType: opts.contentType,
    filename: opts.filename,
    mimeType: opts.mimeType,
    uri: opts.uri,
  });

  const presigned = await createPresignedUpload({
    contentType,
    filename,
    type: opts.type,
  });

  const fileResponse = await fetch(opts.uri);
  const fileBlob = await fileResponse.blob();
  // presigned PUT 서명에 content-type이 포함돼 있다(X-Amz-SignedHeaders=content-type;host).
  // 헤더를 빼거나 다른 값을 넣으면 S3가 403 SignatureDoesNotMatch로 거절한다.
  const uploadResponse = await fetch(presigned.uploadUrl, {
    body: fileBlob,
    headers: {
      'Content-Type': presigned.contentType,
    },
    method: 'PUT',
  });

  if (!uploadResponse.ok) {
    throw new Error(`파일 업로드에 실패했어요. (${uploadResponse.status})`);
  }

  // 버킷은 공개 읽기가 없다. 서명 없는 오브젝트 URL은 403이므로 조회용 presigned URL을 받아 쓴다.
  // (조회 URL 발급이 실패하면 화면이 통째로 막히지 않도록 원본 URL로만 폴백한다)
  let objectUrl = presigned.uploadUrl.split('?')[0] ?? presigned.uploadUrl;
  try {
    objectUrl = (await getPresignedImageUrl(presigned.key)) || objectUrl;
  } catch {
    // 폴백 유지
  }

  return {
    contentType,
    key: presigned.key,
    objectUrl,
  };
}
