"use client";

import { useCallback, useEffect, useState } from "react";
import { StudioBrandDefaults } from "@/components/studio/StudioBrandDefaults";
import { StudioProjectMembers } from "@/components/studio/StudioProjectMembers";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import {
  createProject,
  getWorkspaceBrandDefaults,
  listProjects,
  updateProject,
  updateWorkspaceBrandDefaults,
  type BrandDefaults,
  type Project,
} from "@/lib/studio/projectsApi";

/**
 * 프로젝트와 브랜드 기본값(ADR-0009 §2, P3-1). 조직 공간 OWNER·ADMIN 만 쓴다.
 * 프로젝트는 선택이다 — 단일 행사 고객은 쓰지 않아도 된다. 보관한 프로젝트에는 새 행사를 넣을 수 없다(PROJECT-001).
 */
export function StudioProjects({ workspaceId }: { workspaceId: string }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [workspaceDefaults, setWorkspaceDefaults] = useState<BrandDefaults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ projectId: string; name: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, defaults] = await Promise.all([listProjects(workspaceId), getWorkspaceBrandDefaults(workspaceId)]);
      setProjects(list);
      setWorkspaceDefaults(defaults);
      setError(null);
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "프로젝트를 불러오지 못했어요."));
    }
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void load();
  }, [load]);

  const replace = (updated: Project) =>
    setProjects((prev) => (prev ?? []).map((p) => (p.projectId === updated.projectId ? updated : p)));

  const run = async (key: string, action: () => Promise<void>, fallback: string) => {
    setBusy(key);
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
  if (!projects || !workspaceDefaults) return <p className="text-[13px] text-(--hc-muted)">불러오는 중…</p>;

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {notice}
        </p>
      ) : null}

      <div className="hc-surface-card rounded-2xl p-4">
        <Disclosure label="공간 기본값" open={open === "workspace"} onToggle={() => setOpen(open === "workspace" ? null : "workspace")} />
        {open === "workspace" ? (
          <div className="mt-3">
            <StudioBrandDefaults
              workspaceId={workspaceId}
              value={workspaceDefaults}
              scopeLabel="공간"
              onSave={async (patch) => {
                const saved = await updateWorkspaceBrandDefaults(workspaceId, patch);
                setWorkspaceDefaults(saved);
                return saved;
              }}
            />
          </div>
        ) : null}
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) return;
          void run(
            "create",
            async () => {
              const created = await createProject(workspaceId, name);
              setProjects((prev) => [created, ...(prev ?? [])]);
              setNewName("");
            },
            "프로젝트를 만들지 못했어요.",
          );
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] font-semibold">
          새 프로젝트 이름
          <input
            value={newName}
            maxLength={100}
            placeholder="예: 2026 봄 웨딩 시즌"
            onChange={(e) => setNewName(e.target.value)}
            className="hc-input h-11 rounded-xl border px-3 text-[14px] font-normal"
          />
        </label>
        <button
          type="submit"
          disabled={!newName.trim() || busy !== null}
          className="hc-button-secondary h-11 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
        >
          {busy === "create" ? "만드는 중…" : "프로젝트 만들기"}
        </button>
      </form>

      {projects.length === 0 ? (
        <p className="text-[13px] text-(--hc-muted)">
          아직 프로젝트가 없어요. 여러 행사를 시즌·고객별로 묶고 기본값을 함께 쓰고 싶을 때 만들어요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((project) => (
            <li key={project.projectId} className="hc-surface-card flex flex-col gap-3 rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {renaming?.projectId === project.projectId ? (
                  <form
                    className="flex min-w-0 flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = renaming.name.trim();
                      if (!name) return;
                      void run(
                        project.projectId,
                        async () => {
                          replace(await updateProject(project.projectId, { name }));
                          setRenaming(null);
                        },
                        "이름을 바꾸지 못했어요.",
                      );
                    }}
                  >
                    <input
                      aria-label="프로젝트 이름"
                      value={renaming.name}
                      maxLength={100}
                      onChange={(e) => setRenaming({ projectId: project.projectId, name: e.target.value })}
                      className="hc-input h-11 min-w-0 flex-1 rounded-xl border px-3 text-[14px]"
                    />
                    <button type="submit" disabled={busy !== null} className="h-11 rounded-full px-3 text-[13px] font-semibold">
                      저장
                    </button>
                    <button type="button" onClick={() => setRenaming(null)} className="h-11 rounded-full px-3 text-[13px]">
                      취소
                    </button>
                  </form>
                ) : (
                  <p className="text-[15px] font-bold">
                    {project.name}
                    {project.archived ? <span className="ml-2 text-[12px] font-normal text-(--hc-muted)">보관됨</span> : null}
                  </p>
                )}
                {renaming?.projectId !== project.projectId ? (
                  <span className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setRenaming({ projectId: project.projectId, name: project.name })}
                      className="h-11 rounded-full px-3 text-[13px] text-(--hc-muted)"
                    >
                      이름 바꾸기
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(
                          project.projectId,
                          async () => replace(await updateProject(project.projectId, { archived: !project.archived })),
                          project.archived ? "보관을 풀지 못했어요." : "보관하지 못했어요.",
                        )
                      }
                      className="h-11 rounded-full px-3 text-[13px] text-(--hc-muted) disabled:opacity-50"
                    >
                      {project.archived ? "보관 풀기" : "보관"}
                    </button>
                  </span>
                ) : null}
              </div>
              <div>
                <Disclosure
                  label="프로젝트 기본값"
                  open={open === project.projectId}
                  onToggle={() => setOpen(open === project.projectId ? null : project.projectId)}
                />
                {open === project.projectId ? (
                  <div className="mt-3">
                    <StudioBrandDefaults
                      workspaceId={workspaceId}
                      value={project.brandDefaults ?? {}}
                      scopeLabel="프로젝트"
                      onSave={async (patch) => {
                        const updated = await updateProject(project.projectId, { brandDefaults: patch });
                        replace(updated);
                        return updated.brandDefaults ?? {};
                      }}
                    />
                  </div>
                ) : null}
              </div>
              <div>
                <Disclosure
                  label="운영 담당"
                  open={open === `members:${project.projectId}`}
                  onToggle={() =>
                    setOpen(open === `members:${project.projectId}` ? null : `members:${project.projectId}`)
                  }
                />
                {open === `members:${project.projectId}` ? (
                  <div className="mt-3">
                    <StudioProjectMembers projectId={project.projectId} workspaceId={workspaceId} />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[12px] text-(--hc-muted)">
        보관한 프로젝트는 기존 행사를 그대로 두고, 새 행사에는 고를 수 없어요. 게시한 행사는 프로젝트를 바꿀 수 없어요.
      </p>
    </div>
  );
}

function Disclosure({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex min-h-11 w-full items-center justify-between text-left text-[14px] font-semibold"
    >
      {label}
      <span aria-hidden className="text-(--hc-muted)">
        {open ? "접기" : "펼치기"}
      </span>
    </button>
  );
}
