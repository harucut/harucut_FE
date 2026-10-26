"use client";

import { useCallback, useEffect, useState } from "react";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import {
  EVENT_OPERATIONS,
  EVENT_PERMISSIONS,
  OPERATION_LABEL,
  PERMISSION_LABEL,
  listMembers,
  type EventOperation,
  type EventPermission,
  type Member,
} from "@/lib/studio/accessApi";
import { listProjectMembers, putProjectMember, removeProjectMember } from "@/lib/studio/projectsApi";

type Grant = { operations: EventOperation[]; permissions: EventPermission[] };

const EMPTY: Grant = { operations: [], permissions: [] };

const same = (a: Grant, b: Grant) =>
  JSON.stringify([[...a.operations].sort(), [...a.permissions].sort()]) ===
  JSON.stringify([[...b.operations].sort(), [...b.permissions].sort()]);

/**
 * 프로젝트 멤버(ADR-0009 §3, P3-2). 공간의 운영 담당(OPERATOR)에게 이 프로젝트의 모든 행사(앞으로 만들 행사 포함)를 맡긴다.
 * 운영 권한과 사진 권한을 따로 고른다. 둘 다 비우고 저장하면 프로젝트에서 빠진다.
 */
export function StudioProjectMembers({ projectId, workspaceId }: { projectId: string; workspaceId: string }) {
  const [operators, setOperators] = useState<Member[] | null>(null);
  const [saved, setSaved] = useState<Record<string, Grant>>({});
  const [draft, setDraft] = useState<Record<string, Grant>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [members, projectMembers] = await Promise.all([listMembers(workspaceId), listProjectMembers(projectId)]);
      const current: Record<string, Grant> = {};
      for (const m of projectMembers) current[m.userId] = { operations: m.operations, permissions: m.permissions };
      setOperators(members.filter((m) => m.role === "OPERATOR"));
      setSaved(current);
      setDraft(current);
      setError(null);
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "프로젝트 멤버를 불러오지 못했어요."));
    }
  }, [projectId, workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void load();
  }, [load]);

  const apply = (userId: string, next: Grant | null) => {
    const set = (prev: Record<string, Grant>) => {
      const copy = { ...prev };
      if (next) copy[userId] = next;
      else delete copy[userId];
      return copy;
    };
    setSaved(set);
    setDraft(set);
  };

  const run = async (userId: string, action: () => Promise<void>, fallback: string) => {
    setBusy(userId);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      setNotice(getUserFacingApiErrorMessage(cause, fallback));
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
        운영 담당 멤버가 없어요. 멤버를 「운영 담당」으로 초대하거나 역할을 바꾸면 이 프로젝트를 맡길 수 있어요.
      </p>
    );
  }

  const toggle = <K extends keyof Grant>(userId: string, key: K, item: Grant[K][number], on: boolean) =>
    setDraft((prev) => {
      const grant = prev[userId] ?? EMPTY;
      const list = grant[key] as string[];
      return {
        ...prev,
        [userId]: { ...grant, [key]: on ? [...list, item] : list.filter((v) => v !== item) },
      };
    });

  return (
    <div className="flex flex-col gap-3">
      {notice ? (
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {notice}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {operators.map((operator) => {
          const value = draft[operator.userId] ?? EMPTY;
          const member = saved[operator.userId];
          const changed = !same(value, member ?? EMPTY);
          return (
            <li key={operator.userId} className="hc-surface-well flex flex-col gap-2 rounded-2xl p-3">
              <p className="text-[14px] font-semibold">
                {operator.name}
                {member ? <span className="ml-2 text-[12px] font-normal text-(--hc-muted)">멤버</span> : null}
              </p>
              <fieldset disabled={busy !== null} className="flex flex-col gap-1">
                <legend className="text-[12px] text-(--hc-muted)">운영 권한</legend>
                <div className="flex flex-wrap gap-x-4">
                  {EVENT_OPERATIONS.map((op) => (
                    <label key={op} className="flex min-h-11 items-center gap-2 text-[14px]">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={value.operations.includes(op)}
                        onChange={(e) => toggle(operator.userId, "operations", op, e.target.checked)}
                      />
                      {OPERATION_LABEL[op]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset disabled={busy !== null} className="flex flex-col gap-1">
                <legend className="text-[12px] text-(--hc-muted)">사진 권한</legend>
                <div className="flex flex-wrap gap-x-4">
                  {EVENT_PERMISSIONS.map((perm) => (
                    <label key={perm} className="flex min-h-11 items-center gap-2 text-[14px]">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={value.permissions.includes(perm)}
                        onChange={(e) => toggle(operator.userId, "permissions", perm, e.target.checked)}
                      />
                      {PERMISSION_LABEL[perm]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap gap-2">
                {changed ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        operator.userId,
                        async () => {
                          const next = await putProjectMember(
                            projectId,
                            operator.userId,
                            EVENT_OPERATIONS.filter((op) => value.operations.includes(op)),
                            EVENT_PERMISSIONS.filter((perm) => value.permissions.includes(perm)),
                          );
                          // 둘 다 비면 서버가 멤버에서 뺀다(본문 없음).
                          apply(
                            operator.userId,
                            next && (next.operations.length || next.permissions.length)
                              ? { operations: next.operations, permissions: next.permissions }
                              : null,
                          );
                        },
                        "프로젝트 권한을 저장하지 못했어요.",
                      )
                    }
                    className="hc-button-primary h-11 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
                  >
                    {busy === operator.userId ? "저장하는 중…" : "저장"}
                  </button>
                ) : null}
                {member ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        operator.userId,
                        async () => {
                          await removeProjectMember(projectId, operator.userId);
                          apply(operator.userId, null);
                        },
                        "프로젝트에서 빼지 못했어요.",
                      )
                    }
                    className="h-11 rounded-full px-3 text-[13px] text-(--hc-muted) disabled:opacity-50"
                  >
                    프로젝트에서 빼기
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[12px] text-(--hc-muted)">
        프로젝트 권한은 이 프로젝트의 모든 행사에 같이 적용돼요. 행사마다 따로 준 권한은 행사 화면에서 관리해요.
      </p>
    </div>
  );
}
