"use client";

import { useCallback, useEffect, useState } from "react";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import {
  EVENT_OPERATIONS,
  OPERATION_LABEL,
  assignEventOperator,
  listEventGrants,
  listMembers,
  type EventOperation,
  type Member,
} from "@/lib/studio/accessApi";

/**
 * 행사 운영자 배정(ADR-0009 §3, P3-2). OWNER·ADMIN 이 공간의 운영 담당(OPERATOR)에게 이 행사의 운영 권한을 준다.
 * 사진 권한은 따로다 — 운영을 맡겨도 사진은 자동으로 열리지 않는다(「행사 고객」에서 사진 권한을 준다).
 * 프로젝트 멤버로 받은 권한은 여기서 보이지 않고 빼지도 못한다(프로젝트에서 관리).
 */
export function StudioEventOperators({
  eventId,
  workspaceId,
  onSaved,
}: {
  eventId: string;
  workspaceId: string;
  /** 저장한 뒤. 같은 권한 행을 보는 「행사 고객」이 다시 받게 한다. */
  onSaved?: () => void;
}) {
  const [operators, setOperators] = useState<Member[] | null>(null);
  const [assigned, setAssigned] = useState<Record<string, EventOperation[]>>({});
  const [draft, setDraft] = useState<Record<string, EventOperation[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [members, grants] = await Promise.all([listMembers(workspaceId), listEventGrants(eventId)]);
      const current: Record<string, EventOperation[]> = {};
      for (const grant of grants) if (grant.operations?.length) current[grant.userId] = grant.operations;
      setOperators(members.filter((m) => m.role === "OPERATOR"));
      setAssigned(current);
      setDraft(current);
      setError(null);
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "운영자를 불러오지 못했어요."));
    }
  }, [eventId, workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void load();
  }, [load]);

  const save = async (userId: string) => {
    setBusy(userId);
    setNotice(null);
    try {
      const operations = EVENT_OPERATIONS.filter((op) => (draft[userId] ?? []).includes(op));
      const grant = await assignEventOperator(eventId, userId, operations);
      const next = grant.operations ?? operations;
      setAssigned((prev) => ({ ...prev, [userId]: next }));
      setDraft((prev) => ({ ...prev, [userId]: next }));
      setNotice(next.length ? "운영 권한을 저장했어요." : "운영 권한을 뺐어요.");
      onSaved?.();
    } catch (cause) {
      setNotice(getUserFacingApiErrorMessage(cause, "운영 권한을 저장하지 못했어요."));
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <p role="alert" className="text-[13px] text-(--hc-danger)">
        {error}
      </p>
    );
  }
  if (!operators) return <p className="text-[13px] text-(--hc-muted)">불러오는 중…</p>;
  if (operators.length === 0) {
    return (
      <p className="text-[13px] text-(--hc-muted)">
        운영 담당 멤버가 없어요. 멤버를 「운영 담당」으로 초대하거나 역할을 바꾸면 이 행사를 맡길 수 있어요.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {notice ? (
        <p role="status" className="text-[13px]">
          {notice}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {operators.map((operator) => {
          const value = draft[operator.userId] ?? [];
          const changed =
            JSON.stringify([...value].sort()) !== JSON.stringify([...(assigned[operator.userId] ?? [])].sort());
          return (
            <li key={operator.userId} className="hc-surface-card flex flex-col gap-2 rounded-2xl p-3">
              <p className="text-[14px] font-semibold">{operator.name}</p>
              <div className="flex flex-wrap gap-x-4">
                {EVENT_OPERATIONS.map((op) => (
                  <label key={op} className="flex min-h-11 items-center gap-2 text-[14px]">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={value.includes(op)}
                      disabled={busy !== null}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [operator.userId]: e.target.checked ? [...value, op] : value.filter((v) => v !== op),
                        }))
                      }
                    />
                    {OPERATION_LABEL[op]}
                  </label>
                ))}
              </div>
              {changed ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void save(operator.userId)}
                  className="hc-button-primary h-11 self-start rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
                >
                  {busy === operator.userId ? "저장하는 중…" : "저장"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-[12px] text-(--hc-muted)">
        사진 권한은 따로 줘요. 프로젝트 멤버로 받은 권한은 프로젝트에서 관리해요.
      </p>
    </div>
  );
}
