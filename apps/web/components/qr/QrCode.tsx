"use client";

import { useMemo } from "react";
import { encode } from "uqr";

/**
 * 브라우저 안에서 그리는 QR — 결과 수령 링크(`/r#<token>`)와 Studio 참가 링크·부스 결과에 쓴다.
 *
 * 외부 QR 생성 서비스에 주소를 보내지 않는다(기획 R5 16절). 결과 링크는 그 자체가 수령 권한이라
 * `?data=전체링크` 처럼 남의 서버로 넘기면 그쪽 로그에 비밀이 남는다. 그래서 QR 행렬만 계산하고
 * SVG 로 직접 그린다(uqr — MIT, 의존성 없음).
 *
 * 오류 정정은 M(15%). 부스 화면 반사·휴대폰 카메라 거리에서 읽히는 쪽을 고른다.
 * 테두리(quiet zone)는 4칸 — 행사 테마 배경 위에 놓여도 스캐너가 경계를 찾게 흰 바탕을 둔다.
 */
export function QrCode({
  value,
  size = 200,
  label,
  className,
}: {
  value: string;
  /** 화면에 그릴 한 변(px). 행렬은 viewBox 로 늘리므로 선명도와 무관하다. */
  size?: number;
  /** 스크린리더용 설명. 비밀 링크 원문을 넣지 않는다. */
  label: string;
  className?: string;
}) {
  const { path, dimension } = useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 4 });
    // 어두운 칸을 한 줄의 path 로 모은다. 칸마다 rect 를 두면 버전 10 이상에서 노드가 수천 개다.
    let d = "";
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { path: d, dimension: qr.size };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${dimension} ${dimension}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={dimension} height={dimension} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
