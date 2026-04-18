from __future__ import annotations

import json
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    config_path = ROOT / ".ralph-loop.yml"
    assert config_path.exists(), ".ralph-loop.yml is missing"
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert isinstance(config, dict), ".ralph-loop.yml must contain a mapping"

    goal = str(config.get("goal", "")).strip()
    assert goal, "goal must not be empty"

    minimum_done = config.get("minimum_done", [])
    assert isinstance(minimum_done, list) and minimum_done, "minimum_done must be a non-empty list"

    context_docs = config.get("context_docs", [])
    assert isinstance(context_docs, list) and context_docs, "context_docs must be a non-empty list"
    for raw_doc in context_docs:
        doc_path = ROOT / str(raw_doc)
        assert doc_path.exists(), f"context doc is missing: {raw_doc}"

    runtime = config.get("runtime", {})
    assert isinstance(runtime, dict), "runtime section must be a mapping"
    assert str(runtime.get("bridge_host", "")).strip(), "runtime.bridge_host must not be empty"

    workspace_policy = config.get("workspace_policy", {})
    assert isinstance(workspace_policy, dict), "workspace_policy must be a mapping"
    assert workspace_policy.get("forbid_web_changes") is True, "workspace_policy.forbid_web_changes must be true"
    read_only_paths = set(workspace_policy.get("read_only_paths", []))
    assert "apps/web/" in read_only_paths, "apps/web/ must be listed as read-only"

    verification_policy = config.get("verification_policy", {})
    assert isinstance(verification_policy, dict), "verification_policy must be a mapping"
    assert verification_policy.get("require_visual_check") is True, "visual check must be required"
    assert verification_policy.get("require_api_check") is True, "api check must be required"
    assert verification_policy.get("require_mobile_only_scope") is True, "mobile-only scope must be required"

    git = config.get("git", {})
    assert isinstance(git, dict), "git section must be a mapping"
    assert git.get("base_branch") == "develop_loop", "git.base_branch must be develop_loop"
    assert git.get("pr_base") == "develop_loop", "git.pr_base must be develop_loop"
    assert git.get("auto_create_issue_pr") is False, "git.auto_create_issue_pr must be false"
    assert git.get("auto_create_release_pr") is False, "git.auto_create_release_pr must be false"

    protected = set(git.get("protected_branches", []))
    expected = {"main", "develop", "develop_loop"}
    assert expected.issubset(protected), "protected branches must include main/develop/develop_loop"

    commands = config.get("commands", {})
    assert isinstance(commands, dict), "commands must be a mapping"
    for key in ("lint", "test", "build"):
        assert str(commands.get(key, "")).strip(), f"commands.{key} must be set"

    for path in (
        ROOT / ".codex" / "config.toml",
        ROOT / ".codex" / "hooks.json",
        ROOT / ".codex" / "rules" / "default.rules",
        ROOT / ".githooks" / "pre-commit",
        ROOT / ".githooks" / "pre-push",
        ROOT / "scripts" / "ralph_runtime.py",
        ROOT / "scripts" / "verify_workspace.py",
        ROOT / "apps" / "web" / "package.json",
        ROOT / "apps" / "mobile" / "package.json",
        ROOT / "docs" / "mobile-qa-checklist.md",
    ):
        assert path.exists(), f"missing required file: {path.relative_to(ROOT)}"

    print(json.dumps({"ok": True, "project": config.get("project", {}).get("name", "")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
