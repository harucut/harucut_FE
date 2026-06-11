// 네컷 결과 톤 필터의 공통 정의 (id/라벨/설명/순서).
// 실제 렌더링 방식(css filter, canvas filter, RN 처리)은 각 앱이 id 기준으로 구현한다.

export type FourcutFilterId = 'NONE' | 'B&W' | 'BRIGHT' | 'SOFT';

export type FourcutFilterDefinition = {
  id: FourcutFilterId;
  label: string;
  description: string;
};

export const DEFAULT_FOURCUT_FILTER: FourcutFilterId = 'NONE';

export const FOURCUT_FILTER_DEFINITIONS: FourcutFilterDefinition[] = [
  { id: 'NONE', label: '기본', description: '원본 톤 그대로' },
  { id: 'B&W', label: '흑백', description: '차분한 필름 톤' },
  { id: 'BRIGHT', label: '밝게', description: '밝고 또렷하게' },
  { id: 'SOFT', label: '뽀샤시', description: '은은하고 부드럽게' },
];
