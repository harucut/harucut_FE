"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

type Props = {
  title?: ReactNode;
  description?: ReactNode;
  backHref?: string;
  /**
   * 뒤로 가면 어디인지. **화면에는 안 보이고** 보조기술과 툴팁에만 쓴다.
   *
   * 예전에는 이 문구가 버튼 그 자체였다("프레임 다시 선택", "다시 촬영"). 화살표로 바꾸면서
   * 어디로 가는지가 눈에서는 사라지지만, 그 정보를 통째로 버리지는 않는다.
   */
  backLabel?: string;
  rightSlot?: ReactNode;
  /**
   * 오른쪽 위 요소 **아래**에 붙는 것.
   *
   * 제목 옆에 끼우면 제목의 일부처럼 읽힌다. 부가 정보는 제목이 아니라 오른쪽 열에 쌓는다.
   */
  rightBelow?: ReactNode;
  /** 뒤로가기를 누를 때 함께 할 일(세션 정리 등). 이동 자체는 Link 가 한다. */
  onBackClick?: () => void;
};

/**
 * 흐름 화면의 상단 — `[<]  제목  [부가]`.
 *
 * 예전에는 왼쪽에 로고, 오른쪽에 "처음으로" 같은 **글자 버튼**이 있고 제목은 그 아래
 * 왼쪽에 붙었다. 화면마다 글자가 달라서("처음으로"·"홈으로"·"프레임 다시 선택"·"다시 촬영")
 * 같은 자리의 같은 동작이 매번 다른 모양이었다.
 *
 * 뒤로가기는 어느 화면에서나 같은 동작이므로 같은 모양이어야 한다. 원형 테두리 안의
 * 화살표 하나로 통일하고 제목을 가운데로 보낸다.
 *
 * 좌우를 절대 배치로 둔 이유 — 그래야 **제목이 양쪽 내용 길이와 무관하게 정확히 가운데**
 * 온다. flex 로 세 칸을 나누면 오른쪽에 무엇이 붙느냐에 따라 제목이 좌우로 흔들린다.
 *
 * 로고는 여기 두지 않는다. 이 헤더를 쓰는 곳은 촬영·꾸미기 같은 **전체화면 흐름**이고
 * 로고는 홈과 랜딩이 맡는다. 회원은 뒤로가기를 따라 홈까지 이어지고, 결과 화면에는
 * "홈으로 가기" 버튼이 따로 있다.
 */
export function PageHeader({
  title,
  description,
  backHref = "",
  backLabel,
  rightSlot,
  rightBelow,
  onBackClick,
}: Props) {
  return (
    <>
      {/* 좌우 버튼은 44px 정원이다 — 터치 규칙이 button 만 넓히고 a 는 넓히지 않아 36×44 타원이 됐다. */}
      <header className="relative flex min-h-11 items-center justify-center">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={backLabel || "뒤로"}
            title={backLabel || "뒤로"}
            onClick={onBackClick}
            className="hc-button-icon absolute left-0 top-0 grid h-11 w-11 place-items-center rounded-full border text-(--hc-muted) transition hover:text-(--hc-text)"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        ) : null}

        {title ? (
          // 좌우 버튼 자리를 비켜 간다. 제목이 길면 자르지 않고 줄바꿈한다 —
          // 화면 이름이 잘리면 여기가 어디인지 알 수 없다.
          <h1 className="max-w-[calc(100%-7rem)] text-center text-lg font-semibold tracking-tight">
            {title}
          </h1>
        ) : null}

        <div className="absolute right-0 top-0 flex flex-col items-end gap-1.5">
          {rightSlot ? (
            <div className="flex items-center justify-center">{rightSlot}</div>
          ) : null}
          {rightBelow}
        </div>
      </header>

      {description ? (
        <p className="text-center text-[12px] leading-[1.6] text-(--hc-muted)">{description}</p>
      ) : null}
    </>
  );
}
