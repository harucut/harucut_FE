"use client";

import Link from "next/link";
import { Check, ChevronRight, Minus } from "lucide-react";
import { StudioJoinLink } from "@/components/studio/StudioJoinLink";
import { onStudioSectionLink } from "@/components/studio/StudioSectionNav";
import type { ChecklistRow } from "@/lib/studio/eventSections";
import type { ViolationGroup } from "@/lib/studio/publishViolations";
import type { EventAction, StudioEvent } from "@/lib/studio/studioApi";
import type { EventUsage } from "@/lib/studio/usageApi";

export type StudioBusy = null | "save" | EventAction;

export function RunButton({
  action,
  busy,
  disabled,
  primary,
  children,
  onRun,
  className,
}: {
  action: EventAction;
  busy: StudioBusy;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
  onRun: (action: EventAction) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy !== null}
      onClick={() => onRun(action)}
      className={`h-11 shrink-0 rounded-full px-4 text-[14px] font-semibold transition disabled:opacity-50 ${
        primary ? "hc-button-primary" : "border border-(--hc-border) enabled:hover:border-(--hc-border-strong)"
      } ${className ?? ""}`}
    >
      {busy === action ? "처리하는 중…" : children}
    </button>
  );
}

function ChecklistMark({ state }: { state: ChecklistRow["state"] }) {
  if (state === "done") {
    return (
      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-(--hc-text) text-(--hc-surface)">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === "optional") {
    return (
      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full border border-(--hc-border) text-(--hc-muted)">
        <Minus className="size-3.5" />
      </span>
    );
  }
  return <span aria-hidden className="size-6 shrink-0 rounded-full border-2 border-(--hc-danger)" />;
}

const STATE_LABEL: Record<ChecklistRow["state"], string> = {
  done: "완료",
  todo: "해야 해요",
  optional: "선택",
};

/** 게시 전 체크리스트. 줄을 누르면 그 구역으로 간다. */
function DraftChecklist({ rows }: { rows: ChecklistRow[] }) {
  return (
    <ol className="hc-surface-card flex flex-col divide-y divide-(--hc-border) rounded-2xl">
      {rows.map((row) => (
        <li key={row.key}>
          <a
            href={`#${row.anchor}`}
            onClick={(event) => onStudioSectionLink(event, row.anchor)}
            className="flex min-h-14 items-center gap-3 rounded-2xl px-4 py-2.5 transition hover:bg-(--hc-surface-well)"
          >
            <ChecklistMark state={row.state} />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">
                {row.label}
                <span className="sr-only"> {STATE_LABEL[row.state]}</span>
              </span>
              <span className={`block text-[12px] ${row.state === "todo" ? "text-(--hc-danger)" : "text-(--hc-muted)"}`}>
                {row.detail}
              </span>
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-(--hc-muted)" />
          </a>
        </li>
      ))}
    </ol>
  );
}

/** 위반 묶음. 묶음마다 고칠 자리로 가는 링크를 둔다(세부 사유는 그 구역 안에 있다). */
function ViolationList({ groups }: { groups: ViolationGroup[] }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-(--hc-danger-border) p-4">
      <p className="text-[14px] font-semibold">게시하려면 아래를 고쳐 주세요.</p>
      <ul className="flex flex-col gap-2 text-[13px]">
        {groups.map((group) => (
          <li key={group.key} className="flex flex-wrap items-center justify-between gap-x-3">
            <span className="min-w-0 flex-1 basis-60">{group.message}</span>
            {group.anchor ? (
              <a
                href={`#${group.anchor}`}
                onClick={(event) => onStudioSectionLink(event, group.anchor!)}
                className="flex h-11 shrink-0 items-center font-semibold underline underline-offset-4"
              >
                고치러 가기
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function liveCopy(event: StudioEvent) {
  if (event.paused) return "일시 중지 중이에요. 다시 열 때까지 새 촬영을 받지 않아요.";
  if (event.captureOpen) return "지금 이 링크로 참가자가 촬영할 수 있어요.";
  return "촬영 기간이 되면 이 링크로 참가자가 촬영할 수 있어요.";
}

function Reading({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] text-(--hc-muted)">{label}</dt>
      <dd className="font-mono text-[18px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * 행사 당일의 계기판. 멀리 내려가지 않고 남은 촬영을 읽고 일시 중지·종료를 누른다.
 * 게이지는 무채색이다 — 이 화면의 초록은 저장·게시 하나만 갖는다.
 */
function LiveInstrument({
  event,
  usage,
  deviceCount,
  canManage,
  busy,
  onRun,
  onRequestClose,
}: {
  event: StudioEvent;
  usage: EventUsage | undefined;
  deviceCount: number | null;
  canManage: boolean;
  busy: StudioBusy;
  onRun: (action: EventAction) => void;
  onRequestClose: () => void;
}) {
  const quota = Math.max(0, usage?.composeQuota ?? 0);
  const available = usage ? (usage.parent ? Math.min(usage.remaining, usage.parent.remaining) : usage.remaining) : 0;
  const spent = usage ? usage.used + usage.reserved : 0;
  const ratio = quota > 0 ? Math.min(1, spent / quota) : 0;
  return (
    <div className="hc-surface-card flex flex-col gap-4 rounded-[20px] p-5">
      <div className="flex flex-col gap-0.5">
        <p className="text-[14px]">{liveCopy(event)}</p>
        {event.currentExperienceVersion ? (
          <p className="text-[12px] text-(--hc-muted)">
            지금 적용 중인 게시본: <span className="font-mono tabular-nums">{event.currentExperienceVersion}</span>번째
          </p>
        ) : null}
      </div>
      {usage?.entitlement ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-baseline gap-2">
            <span className="text-[13px] text-(--hc-muted)">더 찍을 수 있는 사진</span>
            <strong className="font-mono text-[30px] font-bold leading-none tabular-nums">{available.toLocaleString("ko-KR")}</strong>
            <span className="font-mono text-[14px] tabular-nums text-(--hc-muted)">/ {quota.toLocaleString("ko-KR")}</span>
          </p>
          <div
            role="meter"
            aria-label="촬영 한도 사용량"
            aria-valuemin={0}
            aria-valuemax={quota}
            aria-valuenow={spent}
            className="h-2 overflow-hidden rounded-full bg-(--hc-surface-well)"
          >
            <div className="h-full rounded-full bg-(--hc-text)" style={{ width: `${ratio * 100}%` }} />
          </div>
          <dl className="grid grid-cols-3 gap-3">
            <Reading label="완성" value={usage.used.toLocaleString("ko-KR")} />
            <Reading label="만드는 중" value={usage.reserved.toLocaleString("ko-KR")} />
            {deviceCount !== null ? <Reading label="연결 기기" value={deviceCount} /> : null}
          </dl>
        </div>
      ) : usage ? (
        <p className="text-[13px] text-(--hc-muted)">적용된 이용권이 없어 한도를 보여 줄 수 없어요.</p>
      ) : (
        <p role="status" className="text-[13px] text-(--hc-muted)">
          사용량을 불러오는 중…
        </p>
      )}
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {event.paused ? (
            <RunButton busy={busy} action="resume" onRun={onRun}>
              다시 열기
            </RunButton>
          ) : (
            <RunButton busy={busy} action="pause" onRun={onRun}>
              일시 중지
            </RunButton>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={onRequestClose}
            className="h-11 rounded-full border border-(--hc-danger-border) px-4 text-[14px] font-semibold text-(--hc-danger) transition enabled:hover:bg-(--hc-danger-soft-bg) disabled:opacity-50"
          >
            촬영 종료
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 행사 화면의 맨 위. 초안이면 게시까지 남은 일을, 게시했으면 당일 조작과 참가 링크를 먼저 보여 준다.
 * 설정 폼을 내려가지 않고도 「지금 무슨 상태고 다음에 뭘 하지」에 답한다.
 */
export function StudioEventOverview({
  event,
  usage,
  deviceCount,
  checklist,
  violations,
  canManage,
  busy,
  joinUrl,
  onRun,
  onRequestClose,
}: {
  event: StudioEvent;
  usage: EventUsage | undefined;
  deviceCount: number | null;
  checklist: ChecklistRow[];
  violations: ViolationGroup[];
  canManage: boolean;
  busy: StudioBusy;
  joinUrl: string;
  onRun: (action: EventAction) => void;
  onRequestClose: () => void;
}) {
  const fileName = event.settings.slug || "harucut-event";
  return (
    <div className="flex flex-col gap-4">
      {canManage ? <h3 className="text-[18px] font-bold">게시와 운영</h3> : null}
      {violations.length > 0 ? <ViolationList groups={violations} /> : null}

      {event.status === "DRAFT" ? (
        <>
          <p className="max-w-[65ch] text-[14px] text-(--hc-muted)">
            아래를 확인하고 게시하면 참가 링크가 열려요. 게시 전에는 참가자가 들어올 수 없어요.
          </p>
          <DraftChecklist rows={checklist} />
          {joinUrl ? (
            <p className="text-[13px] text-(--hc-muted)">
              게시하면 열리는 주소{" "}
              <span translate="no" className="break-all font-semibold text-(--hc-text)">
                {joinUrl}
              </span>
            </p>
          ) : null}
        </>
      ) : null}

      {event.status === "LIVE" ? (
        <>
          <LiveInstrument
            event={event}
            usage={usage}
            deviceCount={deviceCount}
            canManage={canManage}
            busy={busy}
            onRun={onRun}
            onRequestClose={onRequestClose}
          />
          {joinUrl ? <StudioJoinLink url={joinUrl} fileName={fileName} /> : null}
        </>
      ) : null}

      {event.status === "CAPTURE_CLOSED" || event.status === "ARCHIVED" ? (
        <div className="hc-surface-card flex flex-col gap-3 rounded-[20px] p-5">
          <p className="text-[14px]">촬영이 끝난 행사예요. 참가자는 결과 링크로 사진을 계속 받을 수 있어요.</p>
          {usage ? (
            <p className="text-[13px] text-(--hc-muted)">
              완성한 사진 <span className="font-mono font-semibold tabular-nums text-(--hc-text)">{usage.used.toLocaleString("ko-KR")}</span>장
            </p>
          ) : null}
          <Link
            href={`/studio/events/${encodeURIComponent(event.eventId)}/photos`}
            className="hc-button-secondary flex h-11 items-center self-start rounded-full px-4 text-[13px] font-semibold"
          >
            사진함 보기
          </Link>
        </div>
      ) : null}
    </div>
  );
}
