"use client";

import { FOURCUT_FILTERS, type FourcutFilterId } from "@/lib/frameFilters";
import { normalizeHexColor } from "@/lib/themeBackground";
import { ColorSwatches, SWATCH_SELECTED_RING } from "@/components/ui/ColorSwatches";

type FrameOutputOptionsPanelProps = {
  borderColor: string;
  onBorderColorChange: (color: string) => void;
  outputFilter: FourcutFilterId;
  onOutputFilterChange: (filter: FourcutFilterId) => void;
  /** 꾸민 프레임을 골랐는가. 그 배경은 프레임에 저장돼 있어 테두리 색을 고르지 않는다. */
  hasCustomFrame: boolean;
  /** 보정 견본에 깔 사진 — 고른 첫 장, 아직 안 골랐으면 찍은 첫 장. */
  samplePhoto?: string | null;
};

/**
 * 사진 고르기의 「꾸미기」(2026-11-14, 시안 B). 미리보기 바로 아래 [사진 | 꾸미기] 전환의 꾸미기 쪽이다.
 *
 * 예전에는 사진 여덟 장 밑에 「출력 옵션」 상자가 있어 폰에서는 스크롤해야 보였고, 고르는 동안 미리보기가
 * 화면 밖에 있었다. 색은 이름표 단추 다섯 개와 색 코드 입력칸, 보정은 설명 문구가 붙은 상자 넷이었다.
 * 이제 색은 편집기와 같은 동그란 견본이고, 보정은 내 사진에 그 보정을 입힌 견본이다. 고르면 위 미리보기에
 * 바로 보인다.
 *
 * 꾸민 프레임은 테두리 고르기를 아예 두지 않는다. 서버 합성은 프레임에 저장된 배경을 쓰고 보낸 색을
 * 버린다(lib/fourcutCompose.ts 의 usesStoredBackground) — 고르게 두면 고른 색이 저장될 때 조용히 사라진다.
 * 프레임 내용을 못 읽었을 때도 같고, 그때는 화면 위 배너가 사실과 다시 불러올 길을 말한다(사진 선택 화면).
 */
export function FrameOutputOptionsPanel({
  borderColor,
  onBorderColorChange,
  outputFilter,
  onOutputFilterChange,
  hasCustomFrame,
  samplePhoto = null,
}: FrameOutputOptionsPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      {hasCustomFrame ? null : (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[14px] font-extrabold text-(--hc-text)">테두리</h2>
          {/* 견본은 '#' 없는 값을, 「다른 색」은 '#rrggbb' 를 준다. 세션에는 '#rrggbb' 로 둔다. */}
          <ColorSwatches
            label="테두리 색"
            value={borderColor}
            onChange={(color) => onBorderColorChange(normalizeHexColor(color))}
          />
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[14px] font-extrabold text-(--hc-text)">보정</h2>
        <div role="group" aria-label="보정" className="flex flex-wrap gap-3">
          {FOURCUT_FILTERS.map((filter) => {
            const selected = outputFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onOutputFilterChange(filter.id)}
                className="flex flex-col items-center gap-1.5"
              >
                <span
                  className={`block size-16 overflow-hidden rounded-2xl border border-(--hc-border) bg-(--hc-surface-muted) ${
                    selected ? SWATCH_SELECTED_RING : ""
                  }`}
                >
                  {samplePhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={samplePhoto}
                      alt=""
                      className="size-full object-cover"
                      style={{ filter: filter.cssFilter }}
                    />
                  ) : null}
                </span>
                <span
                  className={`text-[12px] ${
                    selected ? "font-extrabold text-(--hc-text)" : "font-semibold text-(--hc-muted)"
                  }`}
                >
                  {filter.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
