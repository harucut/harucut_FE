import { apiEnvelopeData, apiRequest } from '@/lib/api-client';

export type PresignedUploadContentType = 'GIF' | 'JPEG' | 'MOV' | 'MP4' | 'PNG' | 'WEBM' | 'WEBP';
export type PresignedUploadType =
  | 'FOURCUT_PHOTO'
  | 'FOURCUT_VIDEO'
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
  isTemp?: boolean;
  type: PresignedUploadType;
  uri: string;
};

type TranscodeTaskStatus = 'COMPLETE' | 'ERROR' | 'PROGRESSING' | 'QUEUED' | 'SUBMITTED';

type TranscodeTaskSubmitResponse = {
  jobId: string;
  requestedAt?: string;
  status: TranscodeTaskStatus;
  taskId: string;
};

type TranscodeTaskStatusResponse = TranscodeTaskSubmitResponse & {
  errorMessage?: string | null;
  media?: unknown;
  updatedAt?: string;
};

function extensionFromUri(uri: string) {
  const withoutQuery = uri.split('?')[0] ?? uri;
  return withoutQuery.split('.').pop()?.trim().toLowerCase() ?? '';
}

function filenameFromUri(uri: string, fallbackPrefix: string) {
  const withoutQuery = uri.split('?')[0] ?? uri;
  const name = withoutQuery.split('/').pop()?.trim();

  if (name && name.includes('.')) return name;

  const ext = extensionFromUri(uri) || 'jpg';
  return `${fallbackPrefix}-${Date.now()}.${ext}`;
}

export function resolveUploadContentType(args: {
  filename?: string | null;
  mimeType?: string | null;
  uri?: string;
}): PresignedUploadContentType {
  const mimeType = args.mimeType?.toLowerCase() ?? '';
  const ext = (args.filename?.split('.').pop() ?? (args.uri ? extensionFromUri(args.uri) : ''))
    .trim()
    .toLowerCase();

  if (mimeType === 'image/png' || ext === 'png') return 'PNG';
  if (mimeType === 'image/webp' || ext === 'webp') return 'WEBP';
  if (mimeType === 'image/gif' || ext === 'gif') return 'GIF';
  if (mimeType === 'video/mp4' || ext === 'mp4') return 'MP4';
  if (mimeType === 'video/webm' || ext === 'webm') return 'WEBM';
  if (mimeType === 'video/quicktime' || mimeType === 'video/mov' || ext === 'mov') return 'MOV';
  if (
    mimeType === 'image/jpeg' ||
    mimeType === 'image/jpg' ||
    ext === 'jpg' ||
    ext === 'jpeg'
  ) {
    return 'JPEG';
  }

  return 'JPEG';
}

function isVideoContentType(contentType: PresignedUploadContentType) {
  return ['MOV', 'MP4', 'WEBM'].includes(contentType);
}

export function fourcutUploadType(contentType: PresignedUploadContentType): PresignedUploadType {
  return isVideoContentType(contentType) ? 'FOURCUT_VIDEO' : 'FOURCUT_PHOTO';
}

async function createPresignedUpload(args: {
  contentType: PresignedUploadContentType;
  filename: string;
  isTemp: boolean;
  type: PresignedUploadType;
}) {
  return apiEnvelopeData<PresignedUploadResponse>(
    {
      direct: '/api/auth/user/files/presigned-upload',
      proxy: '/api/client/user/files/presigned-upload',
    },
    {
      body: args,
      method: 'POST',
    },
  );
}

export async function getPresignedImageUrl(key: string) {
  return apiEnvelopeData<string>(
    {
      direct: `/api/auth/user/files/presigned-img?key=${encodeURIComponent(key)}`,
      proxy: `/api/client/user/files/presigned-img?key=${encodeURIComponent(key)}`,
    },
    {
      cache: 'no-store',
    },
  );
}

export async function uploadLocalFileWithPresigned(opts: UploadLocalFileOptions) {
  const filename = opts.filename?.trim() || filenameFromUri(opts.uri, 'harucut');
  const contentType = opts.contentType ?? resolveUploadContentType({ filename, uri: opts.uri });
  const presigned = await createPresignedUpload({
    contentType,
    filename,
    isTemp: opts.isTemp ?? false,
    type: opts.type,
  });

  const fileResponse = await fetch(opts.uri);
  const fileBlob = await fileResponse.blob();
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

  return {
    contentType,
    key: presigned.key,
    objectUrl: presigned.uploadUrl.split('?')[0] ?? presigned.uploadUrl,
  };
}

export async function requestVideoTranscode(filename: string) {
  return apiEnvelopeData<TranscodeTaskSubmitResponse>(
    {
      direct: '/api/auth/user/files/transcode',
      proxy: '/api/client/user/files/transcode',
    },
    {
      body: { filename },
      method: 'POST',
    },
  );
}

export async function getVideoTranscodeStatus(taskId: string) {
  return apiEnvelopeData<TranscodeTaskStatusResponse>(
    {
      direct: `/api/auth/user/files/transcode/status?taskId=${encodeURIComponent(taskId)}`,
      proxy: `/api/client/user/files/transcode/status?taskId=${encodeURIComponent(taskId)}`,
    },
    {
      cache: 'no-store',
    },
  );
}
