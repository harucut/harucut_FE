"use client";

import { useId } from "react";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/fourcutOutput";
import { FOURCUT_FILTERS, type FourcutFilterId } from "@/lib/frameFilters";
import { SWATCH_SELECTED_RING } from "@/components/ui/ColorSwatches";

type FrameOutputOptionsPanelProps = {
  outputFilter: FourcutFilterId;
  onOutputFilterChange: (filter: FourcutFilterId) => void;
  /** 보정 견본에 깔 사진 — 고른 첫 장, 아직 안 골랐으면 찍은 첫 장. */
  samplePhoto?: string | null;
  /**
   * 보정을 고를 수 없다 — 비회원(2026-11-15 「비회원이면 보정은 선택 못하도록 해」). 견본은 보이되 잠기고
   * 「회원 전용」이 붙는다. 고른 값은 부른 쪽이 기본으로 되돌린다.
   */
  filtersLocked?: boolean;
  /**
   * 사진 이름(2026-11-15 「사진 이름도 마지막에 바꾸는 게 아니라 꾸미기에서 넣으면 되지 않을까?」). 완성되면 기록에
   * 그 이름으로 남고, 기기에 저장하는 파일 이름도 된다. 비워 두면 날짜·시간으로 붙는다. 나중에 바꾸는 것은 기록에서만 한다.
   * 주지 않으면 이름 칸이 없다.
   */
  photoName?: string;
  onPhotoNameChange?: (name: string) => void;
};

/**
 * 사진 고르기의 「꾸미기」(2026-11-14, 시안 B). 미리보기 바로 아래 [사진 | 꾸미기] 전환의 꾸미기 쪽이다.
 * 보정(내 사진에 그 보정을 입힌 견본)과 사진 이름이다. 고르면 위 미리보기에 바로 보인다.
 *
 * 테두리 색은 없다(2026-11-15 「프레임 고르고 왔으면 사진 고르고 꾸미기에서 색상 변경은 없어도 되겠다 그치?」).
 * 프레임은 이미 골라 왔다 — 고를 때 본 카드의 종이 색이 곧 완성본의 색이다. 예전에는 기본 프레임이면 여기서
 * 견본 다섯 색과 「다른 색」으로 다시 골랐고, 꾸민 프레임은 저장된 배경을 쓰느라 고르기를 숨겼다.
 */
export function FrameOutputOptionsPanel({
  outputFilter,
  onOutputFilterChange,
  samplePhoto = null,
  filtersLocked = false,
  photoName,
  onPhotoNameChange,
}: FrameOutputOptionsPanelProps) {
  const nameId = useId();
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2.5">
        <h2 className="flex items-baseline gap-2 text-[14px] font-extrabold text-(--hc-text)">
          보정
          {filtersLocked ? <span className="text-[12px] font-semibold text-(--hc-muted)">회원 전용</span> : null}
        </h2>
        <div role="group" aria-label="보정" className="flex flex-wrap gap-3">
          {FOURCUT_FILTERS.map((filter) => {
            const selected = outputFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={selected}
                disabled={filtersLocked}
                onClick={() => onOutputFilterChange(filter.id)}
                className="flex flex-col items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-45"
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

      {onPhotoNameChange ? (
        <section className="flex flex-col gap-2.5">
          <label htmlFor={nameId} className="text-[14px] font-extrabold text-(--hc-text)">
            사진 이름
          </label>
          <input
            id={nameId}
            value={photoName ?? ""}
            onChange={(event) => onPhotoNameChange(event.target.value)}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            placeholder="비워 두면 날짜와 시간으로 붙어요"
            enterKeyHint="done"
            className="hc-input w-full rounded-xl border px-3.5 py-3 text-[14px]"
          />
        </section>
      ) : null}
    </div>
  );
}
