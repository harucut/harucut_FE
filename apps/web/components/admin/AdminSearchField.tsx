"use client";

import { useRef, useState } from "react";
import { adminErrorMessage } from "@/components/admin/adminShared";
import {
  ADMIN_SEARCH_MIN,
  searchEvents,
  searchWorkspaces,
  type AdminEventItem,
  type AdminWorkspaceItem,
} from "@/lib/admin/cmsApi";

const EVENT_STATUS_LABEL: Record<AdminEventItem["status"], string> = {
  DRAFT: "초안",
  LIVE: "운영 중",
  CAPTURE_CLOSED: "촬영 종료",
  ARCHIVED: "보관 종료",
};

type Props =
  | { kind: "workspace"; onPick: (item: AdminWorkspaceItem) => void }
  | { kind: "event"; onPick: (item: AdminEventItem) => void };

/**
 * 계약 · 수동 부여 대상 찾기. 공간은 이름·OWNER 이메일, 행사는 slug·이름으로 찾는다(두 글자 이상, 최신순 20건).
 * 고르면 ID 칸을 채운다 — ID 를 손으로 적는 길도 그대로 둔다.
 */
export function AdminSearchField(props: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<AdminWorkspaceItem | AdminEventItem> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 검색 순번. 마지막으로 보낸 검색의 응답만 반영한다 — 앞 검색이 늦게 와서 결과를 덮으면 고른 ID 가
  // 지금 검색어와 다른 대상이 된다(Codex #548).
  const searchSeqRef = useRef(0);
  const label = props.kind === "workspace" ? "공간 찾기" : "행사 찾기";
  const trimmed = query.trim();

  const run = async () => {
    if (trimmed.length < ADMIN_SEARCH_MIN) return;
    const seq = ++searchSeqRef.current;
    setBusy(true);
    setError(null);
    try {
      const found = props.kind === "workspace" ? await searchWorkspaces(trimmed) : await searchEvents(trimmed);
      if (seq === searchSeqRef.current) setResults(found);
    } catch (cause) {
      if (seq === searchSeqRef.current) setError(adminErrorMessage(cause, "찾지 못했어요."));
    } finally {
      if (seq === searchSeqRef.current) setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          aria-label={label}
          value={query}
          placeholder={props.kind === "workspace" ? "공간 이름 또는 소유자 이메일" : "행사 이름 또는 주소(slug)"}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // 바깥 폼을 제출하지 않고 찾기만 한다.
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          className="hc-input h-11 min-w-0 flex-1 rounded-xl border px-3 text-[14px]"
        />
        <button
          type="button"
          disabled={busy || trimmed.length < ADMIN_SEARCH_MIN}
          onClick={() => void run()}
          className="hc-button-secondary h-11 shrink-0 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
        >
          {busy ? "찾는 중…" : "찾기"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[12px] text-(--hc-danger)">
          {error}
        </p>
      ) : null}
      {results ? (
        results.length === 0 ? (
          <p className="text-[12px] text-(--hc-muted)">
            {props.kind === "workspace" ? "맞는 조직 공간이 없어요." : "맞는 행사가 없어요."}
          </p>
        ) : (
          <ul aria-label={`${label} 결과`} className="flex max-h-60 flex-col gap-1 overflow-y-auto">
            {results.map((item) =>
              props.kind === "workspace" ? (
                <li key={(item as AdminWorkspaceItem).workspaceId}>
                  <button
                    type="button"
                    onClick={() => {
                      props.onPick(item as AdminWorkspaceItem);
                      setResults(null);
                    }}
                    className="flex min-h-11 w-full flex-col items-start rounded-xl px-3 py-2 text-left text-[13px] hover:bg-(--hc-surface-well)"
                  >
                    <span className="font-semibold">{(item as AdminWorkspaceItem).name}</span>
                    <span className="text-(--hc-muted)">
                      {(item as AdminWorkspaceItem).workspaceId}
                      {(item as AdminWorkspaceItem).ownerEmails.length ? ` · ${(item as AdminWorkspaceItem).ownerEmails.join(", ")}` : ""}
                    </span>
                  </button>
                </li>
              ) : (
                <li key={(item as AdminEventItem).eventId}>
                  <button
                    type="button"
                    onClick={() => {
                      props.onPick(item as AdminEventItem);
                      setResults(null);
                    }}
                    className="flex min-h-11 w-full flex-col items-start rounded-xl px-3 py-2 text-left text-[13px] hover:bg-(--hc-surface-well)"
                  >
                    <span className="font-semibold">
                      {(item as AdminEventItem).name}
                      <span className="ml-2 font-normal text-(--hc-muted)">{EVENT_STATUS_LABEL[(item as AdminEventItem).status]}</span>
                    </span>
                    <span className="text-(--hc-muted)">
                      /e/{(item as AdminEventItem).slug} · {(item as AdminEventItem).workspaceName}
                    </span>
                  </button>
                </li>
              ),
            )}
          </ul>
        )
      ) : null}
    </div>
  );
}
