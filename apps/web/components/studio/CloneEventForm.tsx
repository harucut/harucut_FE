"use client";

import { useState } from "react";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { cloneEvent } from "@/lib/studio/photosApi";
import type { StudioEvent } from "@/lib/studio/studioApi";

const SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;

/**
 * 행사 복제(R5 7절). 설정 · 테마 · 제공 프레임만 새 초안으로 옮긴다. 사진 · 참가자 · 결과 링크 · 고객 초대 · 동의 기록 ·
 * 부스는 옮기지 않는다 — 다음 행사에 앞 행사의 사람과 사진이 섞이면 안 된다. 일정은 복제본에서 다시 정한다.
 */
export function CloneEventForm({
  eventId,
  defaultName,
  onCancel,
  onCloned,
}: {
  eventId: string;
  defaultName: string;
  onCancel: () => void;
  onCloned: (event: StudioEvent) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = name.trim().length > 0 && SLUG_PATTERN.test(slug);

  return (
    <form
      className="hc-surface-card flex flex-col gap-3 rounded-2xl p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok || busy) return;
        setBusy(true);
        setError(null);
        try {
          onCloned(await cloneEvent(eventId, name.trim(), slug));
        } catch (cause) {
          setError(getUserFacingApiErrorMessage(cause, "행사를 복제하지 못했어요."));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-[18px] font-bold">행사 복제</h2>
      <p className="text-[13px] text-(--hc-muted)">
        설정 · 테마 · 제공 프레임만 새 초안으로 옮겨요. 사진 · 참가자 · 고객 · 부스와 촬영 일정은 옮기지 않아요.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="studio-clone-name" className="text-[13px] font-semibold">
          새 행사 이름
        </label>
        <input
          id="studio-clone-name"
          className="hc-input h-11 rounded-xl border px-3 text-[14px]"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="studio-clone-slug" className="text-[13px] font-semibold">
          새 참가 주소
        </label>
        <input
          id="studio-clone-slug"
          className="hc-input h-11 rounded-xl border px-3 text-[14px]"
          value={slug}
          maxLength={40}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          aria-describedby="studio-clone-slug-help"
          placeholder="wedding-1103"
        />
        <p id="studio-clone-slug-help" className="text-[12px] text-(--hc-muted)">
          영문 소문자·숫자·하이픈 3~40자. 앞 행사와 다른 주소여야 해요.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="h-11 rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold">
          취소
        </button>
        <button
          type="submit"
          disabled={!ok || busy}
          className="hc-button-primary h-11 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
        >
          {busy ? "복제하는 중…" : "복제하기"}
        </button>
      </div>
    </form>
  );
}
