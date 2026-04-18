from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import textwrap
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from fnmatch import fnmatch
from pathlib import Path
from shutil import which
from typing import Any
from urllib import error, parse, request

import yaml

ROOT = Path(__file__).resolve().parents[1]
AGENTS_FILE = ROOT / "AGENTS.md"
RALPH_LOOP_FILE = ROOT / ".ralph-loop.yml"
STATE_DIR = ROOT / ".omx" / "state"
RUNTIME_DIR = ROOT / ".omx" / "runtime"
JOURNAL_DIR = ROOT / ".omx" / "journal"

TASK_FILE = STATE_DIR / "TASK.md"
STATE_FILE = STATE_DIR / "STATE.md"
BACKLOG_FILE = STATE_DIR / "BACKLOG.md"
NEXT_PROMPT_FILE = STATE_DIR / "NEXT_PROMPT.md"
DISCORD_STATUS_FILE = STATE_DIR / "DISCORD_STATUS.md"
VERIFY_FAILURE_FILE = STATE_DIR / "VERIFY_LAST_FAILURE.md"
DISCORD_IMPORTANT_FILE = STATE_DIR / "DISCORD_IMPORTANT.md"
DISCORD_INBOX_LOG = STATE_DIR / "DISCORD_INBOX.jsonl"
TEAM_CONVERSATION_LOG = STATE_DIR / "TEAM_CONVERSATION.jsonl"
LOOP_STATE_FILE = STATE_DIR / "OMX_LOOP_STATE.json"
LOOP_RUNTIME_STATUS_FILE = RUNTIME_DIR / "omx-loop-status.json"
ROLE_SCHEMA_FILE = ROOT / "scripts" / "omx_role_output.schema.json"
CODE_REVIEW_FILE = STATE_DIR / "CODEX_REVIEW_LAST.md"
GITHUB_AUTOMATION_STATUS_FILE = STATE_DIR / "GITHUB_AUTOMATION_STATUS.md"
RALPH_CONTROL_STATE_FILE = STATE_DIR / "RALPH_CONTROL_STATE.json"
RALPH_PROGRESS_FILE = ROOT / ".ralph" / "progress.md"
RALPH_STATE_FILE = ROOT / ".ralph" / "state.json"

DISCORD_BRIDGE_HOST = os.getenv("DISCORD_BRIDGE_HOST", "127.0.0.1").strip() or "127.0.0.1"
DISCORD_BRIDGE_PORT = int(os.getenv("DISCORD_BRIDGE_PORT", "8787"))
AUTONOMOUS_IDLE_INTERVAL_SECONDS = max(int(os.getenv("OMX_AUTONOMOUS_IDLE_INTERVAL_SECONDS", "300")), 60)
ROLE_TIMEOUT_SECONDS = max(int(os.getenv("OMX_ROLE_TIMEOUT_SECONDS", "900")), 120)
VERIFY_TIMEOUT_SECONDS = max(int(os.getenv("OMX_VERIFY_TIMEOUT_SECONDS", "1800")), 120)
RECENT_CONVERSATION_LIMIT = max(int(os.getenv("OMX_RECENT_CONVERSATION_LIMIT", "12")), 4)
MAX_TRACKED_IDS = 400
ROLE_ORDER = ("planner", "critic", "researcher", "architect", "executor")
CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F]")
RAW_UNICODE_ESCAPE_RE = re.compile(r"\\u[0-9a-fA-F]{4}")
DOUBLE_QUESTION_RE = re.compile(r"\?\?")
HANGUL_RE = re.compile(r"[가-힣]")
DISCORD_SIGNAL_PHASES = frozenset(
    {
        "meeting_start",
        "meeting_end",
        "failure_streak",
        "loop_error",
        "github_issue_branch",
        "github_pr_open",
        "github_release_pr",
    }
)
EXECUTOR_WRITABLE = os.getenv("OMX_EXECUTOR_WRITABLE", "true").strip().lower() == "true"
PROTECTED_BRANCHES = {
    item.strip()
    for item in os.getenv("OMX_PROTECTED_BRANCHES", "main,develop").split(",")
    if item.strip()
}
EXECUTOR_ALLOWED_PREFIXES = tuple(
    item.strip()
    for item in os.getenv(
        "OMX_EXECUTOR_ALLOWED_PREFIXES",
        ".github/,apps/,docs/,omx_discord_bridge/,packages/,plugins/,scripts/,.vscode/",
    ).split(",")
    if item.strip()
)
EXECUTOR_ALLOWED_FILES = {
    item.strip()
    for item in os.getenv(
        "OMX_EXECUTOR_ALLOWED_FILES",
        ".gitignore,AGENTS.md,README.md,package.json,pnpm-lock.yaml,pnpm-workspace.yaml",
    ).split(",")
    if item.strip()
}
EXECUTOR_ALLOWED_GLOBS = tuple(
    item.strip()
    for item in os.getenv(
        "OMX_EXECUTOR_ALLOWED_GLOBS",
        "*.code-workspace",
    ).split(",")
    if item.strip()
)
EXECUTOR_IGNORED_PREFIXES = tuple(
    item.strip()
    for item in os.getenv("OMX_EXECUTOR_IGNORED_PREFIXES", ".omx/").split(",")
    if item.strip()
)
EXECUTOR_FORBIDDEN_PREFIXES = tuple(
    item.strip()
    for item in os.getenv(
        "OMX_EXECUTOR_FORBIDDEN_PREFIXES",
        ".git/,.venv/,node_modules/,.pnpm-store/,dist/,coverage/",
    ).split(",")
    if item.strip()
)
EXECUTOR_FORBIDDEN_GLOBS = tuple(
    item.strip()
    for item in os.getenv(
        "OMX_EXECUTOR_FORBIDDEN_GLOBS",
        ".env,.env.*,*.pem,*.key,*.p12,*.pfx,*.crt,*.cer,*.der,*.jks,*.kdb,*.secrets.*",
    ).split(",")
    if item.strip()
)
EXECUTOR_FORBIDDEN_GLOB_EXCEPTIONS = tuple(
    item.strip()
    for item in os.getenv(
        "OMX_EXECUTOR_FORBIDDEN_GLOB_EXCEPTIONS",
        ".env.example,*.env.example",
    ).split(",")
    if item.strip()
)
ISSUE_BRANCH_BASE = os.getenv("OMX_ISSUE_BRANCH_BASE", "develop").strip() or "develop"
ISSUE_BRANCH_PREFIX = os.getenv("OMX_ISSUE_BRANCH_PREFIX", "auto").strip() or "auto"
ENABLE_GITHUB_AUTOMATION_DEFAULT = os.getenv("ENABLE_GITHUB_AUTOMATION", "true").strip().lower() == "true"
RELEASE_TO_MAIN_AUTO_MERGE_POLICY = "auto-merge-if-green"
RELEASE_TO_MAIN_PR_ONLY_POLICY = "pr-only-manual-merge"
REPEATED_FAILURE_THRESHOLD = 3


@dataclass(frozen=True)
class AgentsContract:
    primary_task: str = ""
    min_exit_condition: str = ""
    auto_continue_policy: str = ""
    release_to_main_policy: str = ""
    required_docs: tuple[str, ...] = ()
    consensus_order: tuple[str, ...] = ()
    enable_github_automation: bool = False
    issue_pr_policy: str = ""
    review_feedback_policy: str = ""
    project_name: str = ""
    minimum_done: tuple[str, ...] = ()
    ask_user_only_when: tuple[str, ...] = ()
    continue_without_user_by_default: bool = True
    failure_threshold: int = 3
    max_iterations: int = 30
    git_base_branch: str = ""
    protected_branches: tuple[str, ...] = ()
    no_commit_on: tuple[str, ...] = ()
    no_direct_push_to: tuple[str, ...] = ()
    issue_branch_prefix: str = ""
    pr_base_branch: str = ""
    merge_strategy: str = "squash"
    auto_create_issue_pr: bool = True
    auto_create_release_pr: bool = True
    delete_branch_after_merge: bool = True
    install_command: str = ""
    lint_command: str = ""
    test_command: str = ""
    build_command: str = ""
    verify_commands: tuple[str, ...] = ()
    discord_channel_id: str = ""
    discord_thread_per_run: bool = False
    discord_notify_on: tuple[str, ...] = ()
    discord_remote_commands: tuple[str, ...] = ()
    runtime_bridge_host: str = "127.0.0.1"
    runtime_bridge_port: int = 8787
    runtime_ascii_workspace_drive: str = ""


@dataclass(frozen=True)
class RoleSpec:
    name: str
    goal: str
    sandbox: str
    writable: bool = False


@dataclass(frozen=True)
class MeetingContext:
    started_at: str
    focus_note: str
    trigger_context: str
    state_excerpt: str
    docs_excerpt: str
    related_summary: str


@dataclass(frozen=True)
class WriteGateResult:
    ok: bool
    reason: str
    branch: str


@dataclass(frozen=True)
class GitHubFlowResult:
    ok: bool
    detail: str
    issue_number: int | None = None
    issue_url: str = ""
    branch: str = ""
    pr_number: int | None = None
    pr_url: str = ""
    release_pr_number: int | None = None
    release_pr_url: str = ""
    status: str = ""
    report_to_discord: bool = False
    record_in_journal: bool = False


def release_policy_creates_pr(policy: str) -> bool:
    normalized = policy.strip()
    return normalized in {RELEASE_TO_MAIN_AUTO_MERGE_POLICY, RELEASE_TO_MAIN_PR_ONLY_POLICY}


def release_policy_auto_merges(policy: str) -> bool:
    return policy.strip() == RELEASE_TO_MAIN_AUTO_MERGE_POLICY


ROLE_DISPLAY_NAMES = {
    "planner": "planner",
    "critic": "critic",
    "researcher": "researcher",
    "architect": "architect",
    "executor": "executor",
    "verifier": "verifier",
    "coordinator": "coordinator",
    "scribe": "scribe",
    "watchdog": "watchdog",
}


ROLE_SPECS = {
    "planner": RoleSpec("planner", "최신 트리거와 상태를 읽고 이번 iteration의 가장 작은 P0를 고른다.", "read-only"),
    "critic": RoleSpec("critic", "계획의 허점, 정책 위반, 검증 누락, 재발 위험을 먼저 잡는다.", "read-only"),
    "researcher": RoleSpec("researcher", "관련 파일, 상태, 테스트, 데이터 경로를 짚어 실행 전 사실관계를 보강한다.", "read-only"),
    "architect": RoleSpec("architect", "작업을 되돌리기 쉬운 구현 단위와 검증 단위로 정리한다.", "read-only"),
    "executor": RoleSpec("executor", "합의한 최소 작업을 안전한 범위 안에서 실제로 구현하고, 변경 파일과 검증 결과를 남긴다.", "danger-full-access", writable=EXECUTOR_WRITABLE),
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def trim(text: str, limit: int = 3000) -> str:
    normalized = re.sub(r"\s+\n", "\n", text).strip()
    return normalized if len(normalized) <= limit else normalized[: limit - 3].rstrip() + "..."


def decode_text_bytes(raw: bytes) -> str:
    for encoding in ("utf-8", "cp949", "utf-16"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def sanitize_text(value: str) -> str:
    text = value.replace("\r\n", "\n").replace("\r", "\n")
    text = CONTROL_CHAR_RE.sub("", text).strip()
    question_count = text.count("?")
    if question_count >= 3 and not HANGUL_RE.search(text):
        ascii_letters = sum(1 for ch in text if ch.isascii() and ch.isalpha())
        if ascii_letters < 8:
            return "[인코딩 손상으로 원문을 보존하지 못함]"
    text = DOUBLE_QUESTION_RE.sub("?", text)
    text = RAW_UNICODE_ESCAPE_RE.sub("[유니코드 이스케이프 제거]", text)
    return text


def sanitize_value(value: Any) -> Any:
    if isinstance(value, str):
        return sanitize_text(value)
    if isinstance(value, list):
        return [sanitize_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): sanitize_value(item) for key, item in value.items()}
    return value


def slugify(value: str) -> str:
    lowered = re.sub(r"[^0-9A-Za-z가-힣]+", "-", value.lower())
    return re.sub(r"-{2,}", "-", lowered).strip("-") or "task"


def read_text(path: Path, default: str = "") -> str:
    return default if not path.exists() else path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    write_text(path, json.dumps(sanitize_value(payload), ensure_ascii=False, indent=2) + "\n")


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(sanitize_value(payload), ensure_ascii=False) + "\n")


def rewrite_jsonl(path: Path, items: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for item in items:
            handle.write(json.dumps(sanitize_value(item), ensure_ascii=False) + "\n")


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for raw in read_text(path).splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            items.append(payload)
    return items


def repair_state_logs() -> None:
    for path in (DISCORD_INBOX_LOG, TEAM_CONVERSATION_LOG):
        if not path.exists():
            continue
        repaired = [sanitize_value(item) for item in load_jsonl(path)]
        rewrite_jsonl(path, repaired)


def emit_console(phase: str, message: str) -> None:
    print(f"[omx][{iso_now()}][{phase}] {message}", flush=True)


def ensure_dirs() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    JOURNAL_DIR.mkdir(parents=True, exist_ok=True)


def resolve_workspace_root() -> str:
    override = os.getenv("OMX_WORKSPACE_ROOT", "").strip()
    if override:
        return override
    raw_root = str(ROOT)
    if os.name != "nt" or raw_root.isascii():
        return raw_root
    drive = os.getenv("OMX_ASCII_WORKSPACE_DRIVE", "X:").strip() or "X:"
    if re.fullmatch(r"[A-Za-z]:", drive):
        try:
            subprocess.run(["subst", drive, raw_root], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            return f"{drive}\\"
        except Exception:
            pass
    try:
        import ctypes

        buffer = ctypes.create_unicode_buffer(1024)
        if ctypes.windll.kernel32.GetShortPathNameW(raw_root, buffer, len(buffer)):
            return buffer.value or raw_root
    except Exception:
        pass
    return raw_root


OMX_WORKSPACE_ROOT = resolve_workspace_root()


def write_runtime_status(*, status: str, detail: str = "", meeting_id: str = "", role: str = "", trigger: str = "") -> None:
    write_json(
        LOOP_RUNTIME_STATUS_FILE,
        {
            "status": status,
            "detail": detail,
            "meeting_id": meeting_id,
            "role": role,
            "trigger": trigger,
            "updated_at": iso_now(),
        },
    )


def parse_string_list(value: Any) -> tuple[str, ...]:
    if isinstance(value, (list, tuple)):
        return tuple(str(item).strip() for item in value if str(item).strip())
    if isinstance(value, str):
        return tuple(part.strip() for part in value.split(",") if part.strip())
    return ()


def parse_positive_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(parsed, 1)


def load_ralph_loop_config() -> dict[str, Any]:
    if not RALPH_LOOP_FILE.exists():
        return {}
    try:
        payload = yaml.safe_load(RALPH_LOOP_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def build_contract_from_ralph_config(config: dict[str, Any]) -> AgentsContract:
    project = config.get("project", {}) if isinstance(config.get("project"), dict) else {}
    loop_cfg = config.get("loop", {}) if isinstance(config.get("loop"), dict) else {}
    git_cfg = config.get("git", {}) if isinstance(config.get("git"), dict) else {}
    commands_cfg = config.get("commands", {}) if isinstance(config.get("commands"), dict) else {}
    discord_cfg = config.get("discord", {}) if isinstance(config.get("discord"), dict) else {}
    runtime_cfg = config.get("runtime", {}) if isinstance(config.get("runtime"), dict) else {}

    minimum_done = parse_string_list(config.get("minimum_done", []))
    ask_only = parse_string_list(config.get("ask_user_only_when", []))
    context_docs = parse_string_list(config.get("context_docs", []))
    continue_without_user_by_default = bool(loop_cfg.get("continue_without_user_by_default", True))

    verify_commands = parse_string_list(commands_cfg.get("verify", []))
    if not verify_commands:
        verify_commands = tuple(
            item
            for item in (
                str(commands_cfg.get("lint", "")).strip(),
                str(commands_cfg.get("test", "")).strip(),
                str(commands_cfg.get("build", "")).strip(),
            )
            if item
        )

    auto_continue_policy = "continue-by-default" if continue_without_user_by_default else "ask-before-continue"
    if ask_only:
        auto_continue_policy = f"{auto_continue_policy}; ask only when: {' / '.join(ask_only)}"

    required_docs = [str(RALPH_LOOP_FILE.relative_to(ROOT)), "README.md"]
    for doc in context_docs:
        if doc and doc not in required_docs:
            required_docs.append(doc)

    return AgentsContract(
        primary_task=str(config.get("goal", "")).strip(),
        min_exit_condition=" / ".join(minimum_done),
        auto_continue_policy=auto_continue_policy,
        release_to_main_policy=str(git_cfg.get("release_to_main_policy", "disabled")).strip(),
        required_docs=tuple(required_docs),
        consensus_order=("planner", "critic", "researcher", "architect", "executor", "verifier"),
        enable_github_automation=True,
        issue_pr_policy=f"issue-first branch -> {str(git_cfg.get('pr_base', 'develop_loop')).strip() or 'develop_loop'}",
        review_feedback_policy="same-branch same-pr follow-up",
        project_name=str(project.get("name", "")).strip(),
        minimum_done=minimum_done,
        ask_user_only_when=ask_only,
        continue_without_user_by_default=continue_without_user_by_default,
        failure_threshold=parse_positive_int(loop_cfg.get("failure_threshold", 3) or 3, 3),
        max_iterations=parse_positive_int(loop_cfg.get("max_iterations", 30) or 30, 30),
        git_base_branch=str(git_cfg.get("base_branch", "develop_loop")).strip() or "develop_loop",
        protected_branches=parse_string_list(git_cfg.get("protected_branches", ["main", "develop", "develop_loop"])),
        no_commit_on=parse_string_list(git_cfg.get("no_commit_on", ["main", "develop", "develop_loop"])),
        no_direct_push_to=parse_string_list(git_cfg.get("no_direct_push_to", ["main", "develop", "develop_loop"])),
        issue_branch_prefix=str(git_cfg.get("issue_branch_prefix", "issue")).strip() or "issue",
        pr_base_branch=str(git_cfg.get("pr_base", "develop_loop")).strip() or "develop_loop",
        merge_strategy=str(git_cfg.get("merge_strategy", "squash")).strip() or "squash",
        auto_create_issue_pr=bool(git_cfg.get("auto_create_issue_pr", True)),
        auto_create_release_pr=bool(git_cfg.get("auto_create_release_pr", True)),
        delete_branch_after_merge=bool(git_cfg.get("delete_branch_after_merge", True)),
        install_command=str(commands_cfg.get("install", "")).strip(),
        lint_command=str(commands_cfg.get("lint", "")).strip(),
        test_command=str(commands_cfg.get("test", "")).strip(),
        build_command=str(commands_cfg.get("build", "")).strip(),
        verify_commands=verify_commands,
        discord_channel_id=str(discord_cfg.get("channel_id", "")).strip(),
        discord_thread_per_run=bool(discord_cfg.get("thread_per_run", False)),
        discord_notify_on=parse_string_list(discord_cfg.get("notify_on", [])),
        discord_remote_commands=parse_string_list(discord_cfg.get("remote_commands", [])),
        runtime_bridge_host=str(runtime_cfg.get("bridge_host", "127.0.0.1")).strip() or "127.0.0.1",
        runtime_bridge_port=parse_positive_int(runtime_cfg.get("bridge_port", 8787) or 8787, 8787),
        runtime_ascii_workspace_drive=str(runtime_cfg.get("ascii_workspace_drive", "")).strip().upper(),
    )


def parse_agents_contract() -> AgentsContract:
    ralph_config = load_ralph_loop_config()
    if ralph_config:
        return build_contract_from_ralph_config(ralph_config)

    text = read_text(AGENTS_FILE)

    def normalize_markdown_block(block: str) -> str:
        lines: list[str] = []
        for raw_line in block.splitlines():
            stripped = raw_line.strip()
            if not stripped or stripped.startswith("## "):
                continue
            stripped = re.sub(r"^###\s*", "", stripped)
            stripped = re.sub(r"^[-*]\s*", "", stripped)
            stripped = re.sub(r"^\d+\.\s*", "", stripped)
            lines.append(stripped)
        return " ".join(lines).strip()

    def find_section_value(*titles: str) -> str:
        for title in titles:
            match = re.search(
                rf"^(?:##|#)\s+{re.escape(title)}\s*$([\s\S]*?)(?=^\s*(?:##|#)\s+|\Z)",
                text,
                flags=re.MULTILINE,
            )
            if match:
                section_value = normalize_markdown_block(match.group(1))
                if section_value:
                    return section_value
        return ""

    def find_value(key: str, default: str = "", *fallback_titles: str) -> str:
        match = re.search(rf"^- {re.escape(key)}:\s*(.+)$", text, flags=re.MULTILINE)
        if match:
            return match.group(1).strip()
        fallback = find_section_value(*fallback_titles)
        return fallback or default

    def find_bool(key: str, default: bool = False) -> bool:
        raw = find_value(key, "true" if default else "false").lower()
        return raw in {"1", "true", "yes", "on"}

    docs: list[str] = []
    collecting = False
    for line in text.splitlines():
        stripped = line.strip()
        if not collecting and stripped in {"먼저 읽을 문서", "## 먼저 읽을 문서", "# 먼저 읽을 문서"}:
            collecting = True
            continue
        if collecting and re.match(r"^(?:##|#)\s+", stripped):
            break
        if collecting and stripped.startswith("- "):
            docs.append(stripped[2:].strip().strip("`"))
        elif collecting and docs and stripped:
            break

    raw_consensus = find_value(
        "MULTI_AGENT_CONSENSUS",
        "planner -> critic -> researcher -> architect -> executor -> verifier",
        "다중 agent 합의 규칙",
    )
    consensus_order = tuple(part.strip() for part in raw_consensus.split("->") if part.strip()) or (
        "planner",
        "critic",
        "researcher",
        "architect",
        "executor",
        "verifier",
    )

    return AgentsContract(
        primary_task=find_value("PRIMARY_TASK", "", "최상위 목표"),
        min_exit_condition=find_value("MIN_EXIT_CONDITION", "", "최소 종료 조건"),
        auto_continue_policy=find_value("AUTO_CONTINUE_POLICY", "", "실행 원칙"),
        release_to_main_policy=find_value("RELEASE_TO_MAIN_POLICY"),
        required_docs=tuple(docs),
        consensus_order=consensus_order,
        enable_github_automation=find_bool("ENABLE_GITHUB_AUTOMATION", ENABLE_GITHUB_AUTOMATION_DEFAULT),
        issue_pr_policy=find_value("ISSUE_PR_POLICY", "issue-first branch -> develop, develop -> main release pr"),
        review_feedback_policy=find_value("REVIEW_FEEDBACK_POLICY", "same-branch same-pr follow-up"),
    )


def apply_contract_runtime_overrides(contract: AgentsContract) -> None:
    global DISCORD_BRIDGE_HOST, DISCORD_BRIDGE_PORT, ISSUE_BRANCH_BASE, ISSUE_BRANCH_PREFIX, OMX_WORKSPACE_ROOT, PROTECTED_BRANCHES, REPEATED_FAILURE_THRESHOLD

    if contract.runtime_bridge_host:
        DISCORD_BRIDGE_HOST = contract.runtime_bridge_host
        os.environ["DISCORD_BRIDGE_HOST"] = contract.runtime_bridge_host
    if contract.runtime_bridge_port > 0:
        DISCORD_BRIDGE_PORT = contract.runtime_bridge_port
        os.environ["DISCORD_BRIDGE_PORT"] = str(contract.runtime_bridge_port)
    if contract.runtime_ascii_workspace_drive and not os.getenv("OMX_WORKSPACE_ROOT", "").strip():
        os.environ["OMX_ASCII_WORKSPACE_DRIVE"] = contract.runtime_ascii_workspace_drive
        OMX_WORKSPACE_ROOT = resolve_workspace_root()

    if contract.git_base_branch:
        ISSUE_BRANCH_BASE = contract.git_base_branch
    if contract.issue_branch_prefix:
        ISSUE_BRANCH_PREFIX = contract.issue_branch_prefix
    if contract.protected_branches:
        PROTECTED_BRANCHES = {item for item in contract.protected_branches if item}
    if contract.failure_threshold > 0:
        REPEATED_FAILURE_THRESHOLD = contract.failure_threshold


def load_control_state() -> dict[str, Any]:
    default = {
        "command": "",
        "nudge": "",
        "goal_override": "",
        "done_overrides": [],
        "updated_at": "",
        "message_id": "",
    }
    payload = load_json(RALPH_CONTROL_STATE_FILE, default)
    merged = default | payload if isinstance(payload, dict) else default
    if not isinstance(merged.get("done_overrides"), list):
        merged["done_overrides"] = []
    return merged


def save_control_state(payload: dict[str, Any]) -> None:
    write_json(RALPH_CONTROL_STATE_FILE, payload)


def apply_control_overrides(contract: AgentsContract, control_state: dict[str, Any]) -> AgentsContract:
    goal_override = str(control_state.get("goal_override", "")).strip()
    done_overrides = tuple(str(item).strip() for item in control_state.get("done_overrides", []) if str(item).strip())
    updated_contract = contract
    if goal_override:
        updated_contract = replace(updated_contract, primary_task=goal_override)
    if done_overrides:
        minimum_done = tuple(dict.fromkeys([*updated_contract.minimum_done, *done_overrides]))
        updated_contract = replace(
            updated_contract,
            minimum_done=minimum_done,
            min_exit_condition=" / ".join(minimum_done),
        )
    return updated_contract


def parse_backlog_first_unchecked(text: str) -> str:
    current_section = ""
    saw_p0 = False
    first_unchecked = ""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("## "):
            current_section = stripped[3:].strip()
            if current_section == "P0":
                saw_p0 = True
        elif stripped.startswith("- [ ] "):
            task = stripped[len("- [ ] ") :].strip()
            if current_section == "P0":
                return task
            if not first_unchecked:
                first_unchecked = task
    return first_unchecked if not saw_p0 else ""


def parse_next_prompt_action(text: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if re.match(r"^\d+\.\s", stripped):
            return re.sub(r"^\d+\.\s*", "", stripped)
    return ""


def parse_verify_failure(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in text.splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            result[key.strip()] = value.strip()
    return result


def load_loop_state() -> dict[str, Any]:
    default = {
        "iteration": 0,
        "meeting_counter": 0,
        "handled_discord_message_ids": [],
        "last_autonomous_cycle_at": "",
        "last_failure_signature": "",
        "failure_streak": 0,
        "last_result": "",
        "last_meeting_id": "",
        "last_next_action": "",
        "pending_followup": {},
        "github_flow": {},
    }
    payload = load_json(LOOP_STATE_FILE, default)
    merged = default | payload if isinstance(payload, dict) else default
    if not isinstance(merged.get("handled_discord_message_ids"), list):
        merged["handled_discord_message_ids"] = []
    merged["handled_discord_message_ids"] = [str(item) for item in merged["handled_discord_message_ids"] if str(item).strip()]
    if not isinstance(merged.get("pending_followup"), dict):
        merged["pending_followup"] = {}
    if not isinstance(merged.get("github_flow"), dict):
        merged["github_flow"] = {}
    return merged



def save_loop_state(payload: dict[str, Any]) -> None:
    handled = payload.get("handled_discord_message_ids", [])
    if isinstance(handled, list):
        payload["handled_discord_message_ids"] = handled[-MAX_TRACKED_IDS:]
    write_json(LOOP_STATE_FILE, payload)


def update_important_discord_notes() -> None:
    entries = load_discord_user_messages()

    latest = entries[-1] if entries else None
    superseded = entries[:-1]

    lines = [
        "# 중요한 Discord 지시",
        "",
        "- 최신 사용자 지시 1건만 회의 트리거로 사용한다.",
        "- 과거 미처리 지시는 superseded로 정리하고 다시 읽지 않는다.",
    ]
    if latest:
        lines.extend(
            [
                "",
                "## 최신 지시",
                "",
                f"- {latest.get('created_at', '')} / `{latest.get('message_id', '')}` / {latest.get('author', 'unknown')}",
                f"- 사용자 지시: {latest.get('content', '')}",
            ]
        )
    else:
        lines.extend(
            [
                "",
                "## 최신 지시",
                "",
                "- 현재 대기 중인 Discord 사용자 지시가 없다.",
            ]
        )
    if superseded:
        lines.extend(
            [
                "",
                "## Superseded",
                "",
                f"- 최신 지시 도착으로 이전 지시 {len(superseded)}건은 다시 읽지 않는다.",
            ]
        )
    write_text(DISCORD_IMPORTANT_FILE, "\n".join(lines) + "\n")


def load_discord_user_messages() -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in reversed(load_jsonl(DISCORD_INBOX_LOG)):
        if str(item.get("source")) != "discord_user":
            continue
        message_id = str(item.get("message_id", "")).strip()
        content = str(item.get("content", "")).strip()
        if not message_id or not content or message_id in seen:
            continue
        seen.add(message_id)
        entries.append(item)
    entries.reverse()
    return entries


def collect_pending_discord_user_messages(handled_message_ids: set[str]) -> list[dict[str, Any]]:
    entries = load_discord_user_messages()
    latest_handled_index = max(
        (
            index
            for index, item in enumerate(entries)
            if str(item.get("message_id", "")).strip() in handled_message_ids
        ),
        default=-1,
    )
    relevant_entries = entries[latest_handled_index + 1 :]
    return [
        item
        for item in relevant_entries
        if str(item.get("message_id", "")).strip() not in handled_message_ids
    ]


def select_trigger(loop_state: dict[str, Any], contract: AgentsContract) -> dict[str, Any] | None:
    handled = {str(item) for item in loop_state.get("handled_discord_message_ids", [])}
    pending = collect_pending_discord_user_messages(handled)
    if pending:
        latest = pending[-1]
        return {
            "id": f"discord-{latest['message_id']}",
            "kind": "discord_user",
            "message_id": str(latest.get("message_id", "")).strip(),
            "author": str(latest.get("author", "unknown")).strip(),
            "content": str(latest.get("content", "")).strip(),
            "thread_id": str(latest.get("thread_id", "")).strip() or None,
            "superseded_message_ids": [
                str(item.get("message_id", "")).strip()
                for item in pending[:-1]
                if str(item.get("message_id", "")).strip()
            ],
            "label": f"Discord 사용자 지시: {str(latest.get('content', '')).strip()}",
        }

    failure = parse_verify_failure(read_text(VERIFY_FAILURE_FILE))
    if failure.get("status") == "active":
        cmd = failure.get("failing_command", "unknown")
        return {
            "id": f"verify-{slugify(cmd)}",
            "kind": "verify_failure",
            "content": cmd,
            "thread_id": None,
            "label": f"검증 실패: {cmd}",
        }

    followup = str((loop_state.get("pending_followup") or {}).get("content", "")).strip()
    if followup:
        return {
            "id": f"followup-{slugify(followup)}",
            "kind": "followup",
            "content": followup,
            "thread_id": None,
            "label": f"후속 액션: {followup}",
        }

    last_cycle_raw = str(loop_state.get("last_autonomous_cycle_at", "")).strip()
    try:
        last_cycle = (
            datetime.fromisoformat(last_cycle_raw.replace("Z", "+00:00"))
            if last_cycle_raw
            else utc_now() - timedelta(seconds=AUTONOMOUS_IDLE_INTERVAL_SECONDS + 1)
        )
    except ValueError:
        last_cycle = utc_now() - timedelta(seconds=AUTONOMOUS_IDLE_INTERVAL_SECONDS + 1)
    if (utc_now() - last_cycle).total_seconds() < AUTONOMOUS_IDLE_INTERVAL_SECONDS:
        return None

    backlog = parse_backlog_first_unchecked(read_text(BACKLOG_FILE))
    if backlog:
        return {
            "id": f"autonomous-{slugify(backlog)}",
            "kind": "autonomous_backlog",
            "content": backlog,
            "thread_id": None,
            "label": f"자율 백로그: {backlog}",
        }

    next_prompt = parse_next_prompt_action(read_text(NEXT_PROMPT_FILE))
    if next_prompt:
        return {
            "id": f"next-{slugify(next_prompt)}",
            "kind": "next_prompt",
            "content": next_prompt,
            "thread_id": None,
            "label": f"다음 프롬프트: {next_prompt}",
        }

    if contract.primary_task:
        return {
            "id": "agents-primary-task",
            "kind": "agents_primary_task",
            "content": contract.primary_task,
            "thread_id": None,
            "label": "최상위 계약: PRIMARY_TASK",
        }
    return None



def bridge_url(path: str) -> str:
    return f"http://{DISCORD_BRIDGE_HOST}:{DISCORD_BRIDGE_PORT}{path}"


def sync_discord_replies() -> None:
    try:
        req = request.Request(bridge_url("/sync-replies"), data=b"{}", method="POST")
        with request.urlopen(req, timeout=15):
            return
    except Exception:
        return


def load_discord_env_values() -> dict[str, str]:
    env_path = Path(os.getenv("DISCORD_ENV_FILE", str(ROOT / "omx_discord_bridge" / ".env.discord")))
    values: dict[str, str] = {}
    for line in read_text(env_path).splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def normalize_discord_mode(value: str) -> str:
    normalized = value.strip().lower()
    if normalized in {"all", "signal-only", "local-only"}:
        return normalized
    return "all"


def resolve_discord_mode(env_values: dict[str, str] | None = None) -> str:
    env_values = env_values or {}
    explicit = os.getenv("OMX_DISCORD_MODE", "").strip()
    from_file = str(env_values.get("OMX_DISCORD_MODE", "")).strip()
    return normalize_discord_mode(explicit or from_file or "all")


def should_emit_to_discord(phase: str, metadata: dict[str, Any] | None, mode: str) -> bool:
    if mode == "all":
        return True
    if mode == "local-only":
        return False
    if phase in DISCORD_SIGNAL_PHASES:
        return True
    if isinstance(metadata, dict) and bool(metadata.get("needs_human")):
        return True
    return False


def append_local_conversation(
    username: str,
    content: str,
    source: str,
    meeting_id: str,
    phase: str,
    trigger_id: str,
    thread_id: str | None,
    metadata: dict[str, Any] | None = None,
) -> None:
    username = sanitize_text(username)
    content = sanitize_text(content)
    entry: dict[str, Any] = {
        "source": source,
        "role": username,
        "content": content,
        "meeting_id": meeting_id,
        "phase": phase,
        "trigger_id": trigger_id,
        "thread_id": thread_id or "",
        "created_at": iso_now(),
    }
    if isinstance(metadata, dict):
        reserved = {"source", "role", "content", "meeting_id", "phase", "trigger_id", "thread_id", "created_at"}
        for key, value in sanitize_value(metadata).items():
            normalized_key = str(key).strip()
            if not normalized_key or normalized_key in reserved:
                continue
            entry[normalized_key] = value
    append_jsonl(TEAM_CONVERSATION_LOG, entry)


def direct_discord_webhook_post(webhook_url: str, content: str, username: str, thread_id: str | None) -> bool:
    if not webhook_url:
        return False
    username = sanitize_text(username)
    content = sanitize_text(content)
    target = webhook_url if not thread_id else f"{webhook_url}{'&' if '?' in webhook_url else '?'}{parse.urlencode({'thread_id': thread_id})}"
    payload = json.dumps(
        {"content": content, "username": username, "allowed_mentions": {"parse": []}}
    ).encode("utf-8")
    req = request.Request(target, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with request.urlopen(req, timeout=15) as response:
            return 200 <= response.status < 300
    except Exception:
        return False


def post_message(
    username: str,
    content: str,
    meeting_id: str,
    phase: str,
    trigger_id: str,
    thread_id: str | None,
    source: str = "agent",
    metadata: dict[str, Any] | None = None,
) -> None:
    username = sanitize_text(username)
    content = sanitize_text(content)
    merged_metadata = sanitize_value(metadata) if isinstance(metadata, dict) else None
    env_values = load_discord_env_values()
    discord_mode = resolve_discord_mode(env_values)
    if not should_emit_to_discord(phase, merged_metadata, discord_mode):
        append_local_conversation(
            username,
            content,
            f"{source}_local",
            meeting_id,
            phase,
            trigger_id,
            thread_id,
            metadata=merged_metadata,
        )
        return

    event_payload: dict[str, Any] = {
        "username": username,
        "content": content,
        "thread_id": thread_id or "",
        "meeting_id": meeting_id,
        "phase": phase,
        "source": source,
        "trigger_id": trigger_id,
    }
    if isinstance(merged_metadata, dict):
        event_payload["metadata"] = merged_metadata
    payload = json.dumps(event_payload).encode("utf-8")
    try:
        req = request.Request(
            bridge_url("/event"),
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=15) as response:
            if 200 <= response.status < 300:
                return
    except error.URLError:
        pass
    except Exception:
        pass

    sent = direct_discord_webhook_post(
        env_values.get("DISCORD_WEBHOOK_URL", "").strip(),
        content,
        username,
        thread_id,
    )
    append_local_conversation(
        username,
        content,
        source if sent else f"{source}_local",
        meeting_id,
        phase,
        trigger_id,
        thread_id,
        metadata=merged_metadata,
    )


def build_trigger_metadata(trigger: dict[str, Any]) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "trigger_kind": str(trigger.get("kind", "")).strip(),
        "trigger_label": str(trigger.get("label", "")).strip(),
    }
    message_id = str(trigger.get("message_id", "")).strip()
    if message_id:
        metadata["trigger_message_id"] = message_id
    author = str(trigger.get("author", "")).strip()
    if author:
        metadata["trigger_author"] = author
    superseded_message_ids = [
        str(item).strip()
        for item in trigger.get("superseded_message_ids", [])
        if str(item).strip()
    ]
    metadata["superseded_message_ids"] = superseded_message_ids
    return metadata


def merge_metadata(*payloads: dict[str, Any] | None) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for payload in payloads:
        if not isinstance(payload, dict):
            continue
        for key, value in payload.items():
            normalized_key = str(key).strip()
            if not normalized_key:
                continue
            merged[normalized_key] = value
    return merged


def find_omx_exec() -> str:
    candidates = (
        os.getenv("OMX_EXECUTABLE", "").strip(),
        which("omx") or "",
        which("omx.cmd") or "",
        str(Path.home() / "AppData" / "Roaming" / "npm" / "omx.cmd"),
    )
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    raise FileNotFoundError("omx executable not found")


def find_bash() -> str:
    candidates = (
        os.getenv("OMX_BASH", "").strip(),
        r"C:\Program Files\Git\bin\bash.exe",
        which("bash.exe") or "",
        which("bash") or "",
    )
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    raise FileNotFoundError("bash executable not found")


def git_command(*args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return decode_text_bytes(completed.stdout or b"").rstrip("\r\n")


def normalize_repo_path(path: str) -> str:
    return path.replace("\\", "/").strip()


def is_ignored_executor_path(path: str) -> bool:
    normalized = normalize_repo_path(path)
    return any(normalized.startswith(prefix) for prefix in EXECUTOR_IGNORED_PREFIXES)


def is_forbidden_executor_path(path: str) -> bool:
    normalized = normalize_repo_path(path)
    if any(normalized.startswith(prefix) for prefix in EXECUTOR_FORBIDDEN_PREFIXES):
        return True
    name = normalized.split("/")[-1]
    if any(fnmatch(name, pattern) or fnmatch(normalized, pattern) for pattern in EXECUTOR_FORBIDDEN_GLOB_EXCEPTIONS):
        return False
    return any(fnmatch(name, pattern) or fnmatch(normalized, pattern) for pattern in EXECUTOR_FORBIDDEN_GLOBS)


def is_allowed_executor_path(path: str) -> bool:
    normalized = normalize_repo_path(path)
    if is_ignored_executor_path(normalized) or is_forbidden_executor_path(normalized):
        return False
    if normalized in EXECUTOR_ALLOWED_FILES:
        return True
    name = normalized.split("/")[-1]
    if any(fnmatch(name, pattern) or fnmatch(normalized, pattern) for pattern in EXECUTOR_ALLOWED_GLOBS):
        return True
    return any(normalized.startswith(prefix) for prefix in EXECUTOR_ALLOWED_PREFIXES)


def git_status_snapshot() -> dict[str, str]:
    snapshot: dict[str, str] = {}
    raw = git_command("status", "--porcelain=v1", "--untracked-files=all")
    for line in raw.splitlines():
        if not line.strip():
            continue
        status = line[:2]
        entry = line[3:]
        if " -> " in entry:
            _, entry = entry.split(" -> ", 1)
        snapshot[normalize_repo_path(entry)] = status
    return snapshot


def get_current_branch() -> str:
    return git_command("branch", "--show-current")


def collect_non_ignored_dirty_paths(snapshot: dict[str, str] | None = None) -> list[str]:
    current = snapshot if snapshot is not None else git_status_snapshot()
    return sorted(path for path in current if not is_ignored_executor_path(path))


def summarize_path_list(paths: list[str], *, limit: int = 8) -> str:
    if not paths:
        return ""
    preview = ", ".join(paths[:limit])
    if len(paths) <= limit:
        return preview
    return f"{preview} 외 {len(paths) - limit}건"


def check_executor_write_gate() -> WriteGateResult:
    branch = get_current_branch()
    if not branch:
        return WriteGateResult(False, "현재 git 브랜치를 확인할 수 없어 executor 쓰기를 시작하지 않습니다.", branch)
    if branch in PROTECTED_BRANCHES:
        protected = ", ".join(sorted(PROTECTED_BRANCHES))
        return WriteGateResult(False, f"현재 브랜치 `{branch}` 는 보호 브랜치입니다. `{protected}` 에서는 executor가 쓰기 작업을 하지 않습니다.", branch)

    dirty_paths = collect_non_ignored_dirty_paths()
    if not dirty_paths:
        return WriteGateResult(True, "", branch)

    forbidden = [path for path in dirty_paths if is_forbidden_executor_path(path)]
    if forbidden:
        return WriteGateResult(False, f"executor가 이어서 다루면 안 되는 민감 경로가 dirty 상태입니다: {summarize_path_list(forbidden)}", branch)

    disallowed = [path for path in dirty_paths if not is_allowed_executor_path(path)]
    if disallowed:
        return WriteGateResult(False, f"executor 허용 범위를 벗어난 dirty 파일이 있습니다: {summarize_path_list(disallowed)}", branch)

    return WriteGateResult(
        True,
        f"issue branch에서 허용된 기존 변경을 이어서 사용합니다. `.omx/` 밖 변경 파일: {summarize_path_list(dirty_paths)}",
        branch,
    )


def build_write_gate_output(role: RoleSpec, reason: str, *, branch: str, status: str = "blocked", changed_files: list[str] | None = None) -> dict[str, Any]:
    files = changed_files or []
    return normalize_role_output(
        role,
        {
            "role": role.name,
            "status": status,
            "summary": "executor 쓰기 안전 게이트가 작업을 차단했다." if status == "blocked" else "executor 쓰기 안전 게이트가 위반을 감지했다.",
            "rationale": reason,
            "proposed_action": "안전 게이트 조건을 만족한 뒤 같은 작업을 다시 실행한다.",
            "team_message": f"지금은 바로 수정하지 않겠습니다. {reason}",
            "question_for_next": "보호 브랜치에서 벗어나고 `.omx/` 밖 작업트리를 정리했는가?" if status == "blocked" else "허용되지 않은 변경 파일을 정리했는가?",
            "reply_to": ["architect", "critic"],
            "risks": ["안전 게이트 없이 계속 수정하면 보호 브랜치나 예기치 않은 파일이 오염될 수 있다."],
            "verification": [f"write safety gate: {status}", f"branch: {branch or 'unknown'}"],
            "changed_files": files,
            "followups": ["issue branch에서 깨끗한 작업트리로 다시 실행"],
            "confidence": 0.9 if status == "blocked" else 0.2,
            "needs_human": False,
        },
    )


def validate_executor_changes(role: RoleSpec, branch: str) -> tuple[bool, list[str], str]:
    actual_changed = collect_non_ignored_dirty_paths()
    forbidden = [path for path in actual_changed if is_forbidden_executor_path(path)]
    if forbidden:
        preview = ", ".join(forbidden[:8])
        return False, actual_changed, f"허용되지 않은 민감 경로가 변경되었다: {preview}"
    disallowed = [path for path in actual_changed if not is_allowed_executor_path(path)]
    if disallowed:
        preview = ", ".join(disallowed[:8])
        return False, actual_changed, f"executor 허용 범위를 벗어난 파일이 변경되었다: {preview}"
    return True, actual_changed, branch


def run_process(command: list[str], *, timeout: int = 300, input_text: str | None = None) -> str:
    completed = subprocess.run(
        command,
        cwd=ROOT,
        input=input_text.encode("utf-8") if input_text is not None else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=True,
    )
    return decode_text_bytes(completed.stdout or b"").rstrip("\r\n")


def gh_command(*args: str, timeout: int = 300) -> str:
    return run_process(["gh", *args], timeout=timeout)


def gh_json(*args: str, timeout: int = 300) -> Any:
    raw = gh_command(*args, timeout=timeout)
    return json.loads(raw) if raw else None


def repo_name_with_owner() -> str:
    payload = gh_json("repo", "view", "--json", "nameWithOwner")
    if not isinstance(payload, dict) or not payload.get("nameWithOwner"):
        raise RuntimeError("GitHub 저장소 이름을 확인하지 못했다.")
    return str(payload["nameWithOwner"])


def extract_trailing_number(url: str) -> int | None:
    match = re.search(r"/(\d+)$", url.strip())
    return int(match.group(1)) if match else None


def get_github_flow(loop_state: dict[str, Any]) -> dict[str, Any]:
    flow = loop_state.setdefault("github_flow", {})
    if not isinstance(flow, dict):
        flow = {}
        loop_state["github_flow"] = flow
    return flow


def write_github_automation_status(loop_state: dict[str, Any], detail: str) -> None:
    flow = get_github_flow(loop_state)
    lines = [
        "# GitHub Automation Status",
        "",
        f"- updated_at: {iso_now()}",
        f"- detail: {detail}",
        f"- issue: {flow.get('issue_number', '')} {flow.get('issue_url', '')}".rstrip(),
        f"- branch: {flow.get('branch', '')}",
        f"- pr: {flow.get('pr_number', '')} {flow.get('pr_url', '')}".rstrip(),
        f"- release_pr: {flow.get('release_pr_number', '')} {flow.get('release_pr_url', '')}".rstrip(),
        f"- status: {flow.get('status', '')}",
    ]
    write_text(GITHUB_AUTOMATION_STATUS_FILE, "\n".join(lines).strip() + "\n")


def summarize_trigger_for_title(trigger: dict[str, Any]) -> str:
    if trigger["kind"] == "discord_user":
        return trim(str(trigger.get("content", "")).strip(), 72)
    return trim(str(trigger.get("label", trigger.get("content", "autonomous task"))), 72)


def build_issue_title(trigger: dict[str, Any]) -> str:
    summary = summarize_trigger_for_title(trigger)
    if trigger["kind"] == "verify_failure":
        return f"복구: {summary}"
    if trigger["kind"] == "discord_user":
        return summary
    return f"자동 작업: {summary}"


def build_issue_body(trigger: dict[str, Any], contract: AgentsContract) -> str:
    return textwrap.dedent(
        f"""\
        ## Trigger
        - kind: {trigger['kind']}
        - label: {trigger['label']}
        - content: {trigger.get('content', '')}

        ## Contract
        - PRIMARY_TASK: {contract.primary_task}
        - MIN_EXIT_CONDITION: {contract.min_exit_condition}
        - ISSUE_PR_POLICY: {contract.issue_pr_policy}
        - REVIEW_FEEDBACK_POLICY: {contract.review_feedback_policy}

        ## Notes
        - created by OMX GitHub automation
        - latest Discord/user trigger is prioritized
        """
    ).strip()


def build_issue_branch_name(issue_number: int, trigger: dict[str, Any]) -> str:
    return f"{ISSUE_BRANCH_PREFIX}/{issue_number}-{slugify(summarize_trigger_for_title(trigger))[:48]}"


def ensure_issue_branch(loop_state: dict[str, Any], trigger: dict[str, Any], contract: AgentsContract) -> GitHubFlowResult:
    current_branch = get_current_branch()
    if not contract.enable_github_automation:
        return GitHubFlowResult(True, "GitHub 자동화 비활성", branch=current_branch)
    if current_branch not in PROTECTED_BRANCHES:
        flow = get_github_flow(loop_state)
        if not flow.get("branch"):
            flow["branch"] = current_branch
            flow["status"] = "work_branch_active"
            write_github_automation_status(loop_state, "현재 작업 브랜치에서 계속 진행한다.")
        return GitHubFlowResult(True, "이미 작업 브랜치에 있다.", branch=current_branch)
    dirty_paths = collect_non_ignored_dirty_paths()
    if dirty_paths:
        detail = f"GitHub 자동 issue/branch 전환을 생략했다. `.omx/` 밖 작업트리가 깨끗하지 않다: {', '.join(dirty_paths[:8])}"
        flow = get_github_flow(loop_state)
        flow["status"] = "branch_bootstrap_blocked"
        write_github_automation_status(loop_state, detail)
        return GitHubFlowResult(False, detail, branch=current_branch)

    issue_title = build_issue_title(trigger)
    issue_url = gh_command("issue", "create", "--title", issue_title, "--body", build_issue_body(trigger, contract), timeout=600).splitlines()[-1].strip()
    issue_number = extract_trailing_number(issue_url)
    if issue_number is None:
        raise RuntimeError(f"생성된 issue URL에서 번호를 파싱하지 못했다: {issue_url}")

    branch_name = build_issue_branch_name(issue_number, trigger)
    try:
        git_command("rev-parse", "--verify", branch_name)
        run_process(["git", "switch", branch_name], timeout=120)
    except Exception:
        git_command("fetch", "origin", ISSUE_BRANCH_BASE)
        run_process(["git", "switch", "-c", branch_name, "--no-track", f"origin/{ISSUE_BRANCH_BASE}"], timeout=120)

    flow = get_github_flow(loop_state)
    flow.update(
        {
            "issue_number": issue_number,
            "issue_url": issue_url,
            "issue_title": issue_title,
            "branch": branch_name,
            "base_branch": ISSUE_BRANCH_BASE,
            "pr_number": 0,
            "pr_url": "",
            "release_pr_number": 0,
            "release_pr_url": "",
            "status": "issue_branch_ready",
            "source_trigger_id": trigger["id"],
        }
    )
    write_github_automation_status(loop_state, f"Issue #{issue_number}와 작업 브랜치 `{branch_name}` 를 준비했다.")
    return GitHubFlowResult(True, f"Issue #{issue_number}와 브랜치 `{branch_name}` 를 준비했다.", issue_number=issue_number, issue_url=issue_url, branch=branch_name)


def build_commit_message(trigger: dict[str, Any], changed_files: list[str]) -> str:
    scope = "omx" if any(path.startswith("scripts/") or path.startswith("omx_discord_bridge/") for path in changed_files) else "auto"
    summary = slugify(summarize_trigger_for_title(trigger)).replace("-", " ").strip()
    summary = summary[:48].strip() or "autonomous update"
    return f"fix({scope}): {summary}"


def build_pr_title(flow: dict[str, Any], trigger: dict[str, Any]) -> str:
    issue_number = flow.get("issue_number")
    summary = summarize_trigger_for_title(trigger)
    prefix = f"#{issue_number} " if issue_number else ""
    return f"{prefix}{summary}"


def build_pr_body(flow: dict[str, Any], trigger: dict[str, Any], role_outputs: list[dict[str, Any]], verify_log: str) -> str:
    executor_output = next((item for item in role_outputs if item.get("role") == "executor"), {})
    verifier_output = next((item for item in role_outputs if item.get("role") == "verifier"), {})
    changed_files = executor_output.get("changed_files", [])
    issue_line = f"- relates #{flow['issue_number']}" if flow.get("issue_number") else "- autonomous change"
    return textwrap.dedent(
        f"""\
        ## What Changed
        - {executor_output.get('summary', 'executor summary unavailable')}
        - changed files: {', '.join(changed_files) if changed_files else 'none'}

        ## Why
        - trigger: {trigger['label']}
        - {issue_line}

        ## Review
        - critic: {next((item.get('summary') for item in role_outputs if item.get('role') == 'critic'), 'n/a')}
        - verifier: {verifier_output.get('summary', 'n/a')}

        ## Validation
        ```text
        {verify_log.strip() or 'none'}
        ```
        """
    ).strip()


def run_codex_review_gate(role_outputs: list[dict[str, Any]], verify_ok: bool | None, verify_log: str, trigger: dict[str, Any]) -> tuple[bool, str]:
    critic_output = next((item for item in role_outputs if item.get("role") == "critic"), {})
    verifier_output = next((item for item in role_outputs if item.get("role") == "verifier"), {})
    executor_output = next((item for item in role_outputs if item.get("role") == "executor"), {})
    blocking = verify_ok is False or critic_output.get("status") in {"blocked", "fail"} or verifier_output.get("status") in {"blocked", "fail"}
    review_note = "blocking issues 있음" if blocking else "blocking issues 없음"
    review_md = textwrap.dedent(
        f"""\
        # Codex Code Review

        - trigger: {trigger['label']}
        - result: {review_note}

        ## Critic
        - status: {critic_output.get('status', 'n/a')}
        - summary: {critic_output.get('summary', 'n/a')}
        - risks: {' / '.join(critic_output.get('risks', [])) or 'none'}

        ## Executor
        - status: {executor_output.get('status', 'n/a')}
        - changed_files: {', '.join(executor_output.get('changed_files', [])) or 'none'}

        ## Verifier
        - status: {verifier_output.get('status', 'n/a')}
        - summary: {verifier_output.get('summary', 'n/a')}

        ## Verify Log
        ```text
        {verify_log.strip() or 'none'}
        ```
        """
    ).strip() + "\n"
    write_text(CODE_REVIEW_FILE, review_md)
    return (not blocking), review_note


def find_open_pr(head: str, base: str) -> dict[str, Any] | None:
    payload = gh_json("pr", "list", "--head", head, "--base", base, "--state", "open", "--json", "number,url,title,headRefName,baseRefName")
    if isinstance(payload, list) and payload:
        return payload[0]
    return None


def publish_issue_branch(
    loop_state: dict[str, Any],
    trigger: dict[str, Any],
    contract: AgentsContract,
    role_outputs: list[dict[str, Any]],
    verify_ok: bool | None,
    verify_log: str,
) -> GitHubFlowResult:
    if not contract.enable_github_automation:
        return GitHubFlowResult(True, "GitHub 자동화 비활성", branch=get_current_branch())
    current_branch = get_current_branch()
    if current_branch in PROTECTED_BRANCHES:
        return GitHubFlowResult(False, f"현재 브랜치 `{current_branch}` 는 보호 브랜치라 PR 출고를 생략한다.", branch=current_branch)

    executor_output = next((item for item in role_outputs if item.get("role") == "executor"), {})
    changed_files = [normalize_repo_path(path) for path in executor_output.get("changed_files", []) if normalize_repo_path(path)]
    if not changed_files:
        return GitHubFlowResult(False, "executor가 보고한 실제 변경 파일이 없어 PR 출고를 생략한다.", branch=current_branch)
    if verify_ok is not True:
        return GitHubFlowResult(False, "검증 게이트가 통과하지 않아 PR 출고를 생략한다.", branch=current_branch)

    review_ok, review_note = run_codex_review_gate(role_outputs, verify_ok, verify_log, trigger)
    if not review_ok:
        flow = get_github_flow(loop_state)
        flow["status"] = "review_blocked"
        write_github_automation_status(loop_state, f"Codex review gate 차단: {review_note}")
        return GitHubFlowResult(False, f"Codex review gate 차단: {review_note}", branch=current_branch)

    run_process(["git", "add", "--", *changed_files], timeout=120)
    staged = [line for line in git_command("diff", "--cached", "--name-only").splitlines() if line.strip()]
    if not staged:
        return GitHubFlowResult(False, "staged diff가 없어 PR 출고를 생략한다.", branch=current_branch)

    commit_message = build_commit_message(trigger, changed_files)
    run_process(["git", "commit", "-m", commit_message], timeout=300)
    run_process(["git", "push", "-u", "origin", current_branch], timeout=1200)

    flow = get_github_flow(loop_state)
    if not contract.auto_create_issue_pr:
        flow.update(
            {
                "branch": current_branch,
                "status": "issue_branch_pushed",
                "last_commit_message": commit_message,
            }
        )
        write_github_automation_status(loop_state, f"브랜치 `{current_branch}` 를 push했고 PR 자동 생성은 비활성화 상태다.")
        return GitHubFlowResult(
            True,
            f"브랜치 `{current_branch}` 를 push했고 PR 자동 생성은 비활성화 상태다.",
            issue_number=flow.get("issue_number"),
            issue_url=str(flow.get("issue_url", "")),
            branch=current_branch,
        )

    pr = find_open_pr(current_branch, ISSUE_BRANCH_BASE)
    if pr is None:
        pr_body = build_pr_body(flow, trigger, role_outputs, verify_log)
        pr_url = gh_command(
            "pr",
            "create",
            "--base",
            ISSUE_BRANCH_BASE,
            "--head",
            current_branch,
            "--title",
            build_pr_title(flow, trigger),
            "--body",
            pr_body,
            timeout=600,
        ).splitlines()[-1].strip()
        pr_number = extract_trailing_number(pr_url)
    else:
        pr_number = int(pr["number"])
        pr_url = str(pr["url"])

    if pr_number is None:
        raise RuntimeError("생성된 PR 번호를 파싱하지 못했다.")

    if CODE_REVIEW_FILE.exists():
        gh_command("pr", "comment", str(pr_number), "--body-file", str(CODE_REVIEW_FILE), timeout=300)
    gh_command("pr", "merge", str(pr_number), "--auto", "--squash", "--delete-branch", timeout=300)
    flow.update(
        {
            "branch": current_branch,
            "pr_number": pr_number,
            "pr_url": pr_url,
            "status": "issue_pr_open",
            "last_commit_message": commit_message,
        }
    )
    write_github_automation_status(loop_state, f"PR #{pr_number} 를 만들고 {ISSUE_BRANCH_BASE} 자동 병합을 걸었다.")
    return GitHubFlowResult(True, f"PR #{pr_number} 를 만들고 자동 병합을 설정했다.", issue_number=flow.get("issue_number"), issue_url=str(flow.get("issue_url", "")), branch=current_branch, pr_number=pr_number, pr_url=pr_url)


def sync_release_pr(loop_state: dict[str, Any], contract: AgentsContract) -> GitHubFlowResult:
    flow = get_github_flow(loop_state)
    if not contract.enable_github_automation or not contract.auto_create_release_pr or not release_policy_creates_pr(contract.release_to_main_policy):
        return GitHubFlowResult(True, "release 자동화 비활성", status="release_disabled")
    auto_merge_release = release_policy_auto_merges(contract.release_to_main_policy)
    existing_release_pr_number = int(flow.get("release_pr_number") or 0)
    if existing_release_pr_number > 0:
        release_view = gh_json("pr", "view", str(existing_release_pr_number), "--json", "state,mergedAt,url")
        if isinstance(release_view, dict) and release_view.get("state") == "MERGED":
            flow["status"] = "release_merged"
            write_github_automation_status(loop_state, f"Release PR #{existing_release_pr_number} 가 main에 병합되었다.")
            return GitHubFlowResult(
                False,
                f"Release PR #{existing_release_pr_number} 가 main에 병합되었다.",
                release_pr_number=existing_release_pr_number,
                release_pr_url=str(release_view.get("url", flow.get("release_pr_url", ""))),
                status="release_merged",
                record_in_journal=True,
            )
        if isinstance(release_view, dict) and release_view.get("state") == "OPEN" and not auto_merge_release:
            release_pr_url = str(release_view.get("url", flow.get("release_pr_url", "")))
            flow.update(
                {
                    "release_pr_number": existing_release_pr_number,
                    "release_pr_url": release_pr_url,
                    "status": "release_pr_open",
                }
            )
            waiting_message = f"Release PR #{existing_release_pr_number} 가 열려 있고 main 병합은 사용자 대기다."
            write_github_automation_status(loop_state, waiting_message)
            return GitHubFlowResult(
                False,
                waiting_message,
                release_pr_number=existing_release_pr_number,
                release_pr_url=release_pr_url,
                status="release_pr_open",
                record_in_journal=True,
            )
    pr_number = int(flow.get("pr_number") or 0)
    if pr_number <= 0:
        return GitHubFlowResult(False, "issue branch PR이 없어 release PR을 만들지 않는다.", status="issue_pr_missing")

    pr_view = gh_json("pr", "view", str(pr_number), "--json", "state,mergedAt,url")
    if not isinstance(pr_view, dict) or pr_view.get("state") != "MERGED":
        flow["status"] = "issue_pr_pending"
        write_github_automation_status(loop_state, "issue branch PR 병합을 기다리는 중이다.")
        return GitHubFlowResult(False, "issue branch PR 병합 대기 중", status="issue_pr_pending")

    git_command("fetch", "origin", "main", "develop")
    ahead_count = int(git_command("rev-list", "--count", "origin/main..origin/develop") or "0")
    if ahead_count <= 0:
        flow["status"] = "develop_synced_to_main"
        write_github_automation_status(loop_state, "develop와 main 사이에 release할 차이가 없다.")
        return GitHubFlowResult(False, "release할 차이가 없다.", status="develop_synced_to_main")

    release_pr = find_open_pr("develop", "main")
    if release_pr is None:
        body_lines = [
            "## Release Scope",
            "Sync `develop` into `main`.",
            "",
            "## Why",
            "- develop에 반영된 자동 작업을 main까지 승격한다.",
        ]
        if flow.get("issue_number"):
            body_lines.extend(["", "## Issue", f"- closes #{flow['issue_number']}"])
        release_pr_url = gh_command(
            "pr",
            "create",
            "--base",
            "main",
            "--head",
            "develop",
            "--title",
            "release: sync develop into main",
            "--body",
            "\n".join(body_lines),
            timeout=600,
        ).splitlines()[-1].strip()
        release_pr_number = extract_trailing_number(release_pr_url)
    else:
        release_pr_number = int(release_pr["number"])
        release_pr_url = str(release_pr["url"])
        flow.update(
            {
                "release_pr_number": release_pr_number,
                "release_pr_url": release_pr_url,
                "status": "release_pr_open",
            }
        )
        if not auto_merge_release:
            waiting_message = f"Release PR #{release_pr_number} 가 이미 열려 있고 main 병합은 사용자 대기다."
            write_github_automation_status(loop_state, waiting_message)
            return GitHubFlowResult(
                False,
                waiting_message,
                release_pr_number=release_pr_number,
                release_pr_url=release_pr_url,
                status="release_pr_open",
                record_in_journal=True,
            )

    if release_pr_number is None:
        raise RuntimeError("release PR 번호를 파싱하지 못했다.")

    flow.update(
        {
            "release_pr_number": release_pr_number,
            "release_pr_url": release_pr_url,
            "status": "release_pr_open",
        }
    )
    if auto_merge_release:
        gh_command("pr", "merge", str(release_pr_number), "--auto", "--merge", timeout=300)
        write_github_automation_status(loop_state, f"Release PR #{release_pr_number} 를 만들고 main 자동 병합을 설정했다.")
        return GitHubFlowResult(
            True,
            f"Release PR #{release_pr_number} 를 만들고 main 자동 병합을 설정했다.",
            release_pr_number=release_pr_number,
            release_pr_url=release_pr_url,
            status="release_pr_created",
            report_to_discord=True,
            record_in_journal=True,
        )
    write_github_automation_status(loop_state, f"Release PR #{release_pr_number} 를 만들었고 main 병합은 사용자 대기다.")
    return GitHubFlowResult(
        True,
        f"Release PR #{release_pr_number} 를 만들었고 main 병합은 사용자 대기다.",
        release_pr_number=release_pr_number,
        release_pr_url=release_pr_url,
        status="release_pr_created",
        report_to_discord=True,
        record_in_journal=True,
    )


def handle_release_pr_result(
    release_result: GitHubFlowResult,
    meeting_id: str,
    trigger: dict[str, Any],
    github_notes: list[str],
) -> None:
    if release_result.detail and release_result.record_in_journal:
        github_notes.append(release_result.detail)
    if release_result.report_to_discord and release_result.release_pr_number:
        post_message(
            "coordinator",
            f"{release_result.detail} {release_result.release_pr_url}".strip(),
            meeting_id,
            "github_release_pr",
            trigger["id"],
            trigger.get("thread_id"),
        )
        return
    if release_result.detail:
        emit_console("github", trim(release_result.detail, 140))


def sync_and_report_release_pr(
    loop_state: dict[str, Any],
    contract: AgentsContract,
    *,
    meeting_id: str,
    trigger: dict[str, Any],
    github_notes: list[str] | None = None,
) -> GitHubFlowResult:
    release_result = sync_release_pr(loop_state, contract)
    handle_release_pr_result(
        release_result,
        meeting_id,
        trigger,
        github_notes if github_notes is not None else [],
    )
    return release_result


def build_context_excerpt() -> str:
    items = [
        ("DISCORD_IMPORTANT.md", DISCORD_IMPORTANT_FILE, 1000),
        ("TASK.md", TASK_FILE, 1200),
        ("STATE.md", STATE_FILE, 1000),
        ("BACKLOG.md", BACKLOG_FILE, 1000),
        ("NEXT_PROMPT.md", NEXT_PROMPT_FILE, 900),
        ("VERIFY_LAST_FAILURE.md", VERIFY_FAILURE_FILE, 700),
        ("DISCORD_STATUS.md", DISCORD_STATUS_FILE, 900),
    ]
    return "\n\n".join(f"## {label}\n{trim(read_text(path), limit)}" for label, path, limit in items)


def build_docs_excerpt(contract: AgentsContract) -> str:
    excerpts: list[str] = []
    for raw_path in contract.required_docs[:4]:
        doc_path = ROOT / raw_path
        title = raw_path
        if not doc_path.exists():
            excerpts.append(f"## {title}\n- 파일이 아직 없다.")
            continue
        excerpts.append(f"## {title}\n{trim(read_text(doc_path), 900)}")
    return "\n\n".join(excerpts) or "- 참고 문서 없음"


def build_recent_excerpt() -> str:
    recent = load_jsonl(TEAM_CONVERSATION_LOG)[-RECENT_CONVERSATION_LIMIT:]
    if not recent:
        return "- 최근 대화 없음"
    return "\n".join(
        f"- {item.get('role') or item.get('author') or item.get('source')}: {trim(str(item.get('content', '')), 180)}"
        for item in recent
    )


def build_trigger_context(trigger: dict[str, Any]) -> str:
    lines = [
        f"- kind: {trigger['kind']}",
        f"- label: {trigger['label']}",
    ]
    author = str(trigger.get("author", "")).strip()
    if author:
        lines.append(f"- author: {author}")
    content = trim(str(trigger.get("content", "")).strip(), 600)
    if content:
        lines.append(f"- content: {content}")
    superseded = [item for item in trigger.get("superseded_message_ids", []) if str(item).strip()]
    if superseded:
        lines.append(f"- superseded_message_ids: {', '.join(superseded)}")
    thread_id = str(trigger.get("thread_id", "") or "").strip()
    if thread_id:
        lines.append(f"- thread_id: {thread_id}")
    return "\n".join(lines)


def build_focus_note(trigger: dict[str, Any]) -> str:
    if trigger["kind"] == "discord_user":
        return "사용자 질문에 바로 답하면서 역할 간 이견과 우려를 드러내는 회의형 대화를 만든다."
    if trigger["kind"] == "verify_failure":
        return "실패한 검증을 우선 복구하고 같은 실패를 반복하지 않는 우회책을 합의한다."
    if trigger["kind"] == "followup":
        return "직전 회의의 다음 액션을 실제 구현 가능한 가장 작은 단계로 축소한다."
    return "현재 저장소 상태에서 가장 가치가 큰 다음 행동을 정하고 근거를 공유한다."


def build_coordinator_opening(trigger: dict[str, Any], context: MeetingContext, loop_state: dict[str, Any]) -> str:
    if trigger["kind"] != "discord_user":
        return "\n".join(
            [
                f"이번 회의는 `{trigger['label']}` 를 처리합니다.",
                "사용자가 빠르게 읽을 수 있도록 짧고 분명하게 이어서 말하겠습니다.",
                f"초점: {context.focus_note}",
            ]
        )

    lines = ["읽은 메시지를 기준으로 지금부터 역할별로 짧게 보겠습니다."]
    pending_followup = str((loop_state.get("pending_followup") or {}).get("content", "")).strip()
    if pending_followup:
        lines.append(f"직전 후속 작업 `{pending_followup}` 는 잠시 보류하고 이 질문부터 먼저 처리합니다.")
    superseded_count = len([item for item in trigger.get("superseded_message_ids", []) if str(item).strip()])
    if superseded_count:
        lines.append(f"직전 미처리 메시지 {superseded_count}건은 최신 메시지 기준으로 함께 정리합니다.")
    lines.append(f"초점: {context.focus_note}")
    return "\n".join(lines)


def build_meeting_context(trigger: dict[str, Any], contract: AgentsContract) -> MeetingContext:
    return MeetingContext(
        started_at=iso_now(),
        focus_note=build_focus_note(trigger),
        trigger_context=build_trigger_context(trigger),
        state_excerpt=build_context_excerpt(),
        docs_excerpt=build_docs_excerpt(contract),
        related_summary=build_recent_excerpt(),
    )


def build_role_prompt(
    role: RoleSpec,
    trigger: dict[str, Any],
    meeting_id: str,
    prior_outputs: list[dict[str, Any]],
    contract: AgentsContract,
    context: MeetingContext,
) -> str:
    prior = "\n".join(
        textwrap.dedent(
            f"""\
            ### {item['role']}
            - status: {item['status']}
            - summary: {item['summary']}
            - team_message: {item.get('team_message', '')}
            - reply_to: {', '.join(item.get('reply_to', [])) or '없음'}
            - question_for_next: {item.get('question_for_next', '') or '없음'}
            - proposed_action: {item['proposed_action']}
            - risks: {' / '.join(item.get('risks', [])) or '없음'}
            """
        ).strip()
        for item in prior_outputs
    ) or "- 아직 다른 역할 발언이 없다."
    docs = "\n".join(f"- {item}" for item in contract.required_docs) or "- 없음"
    write_gate = ""
    if role.writable:
        write_gate = textwrap.dedent(
            f"""\

            쓰기 안전 게이트
            - 현재 role은 실제 파일 수정이 가능하다.
            - 보호 브랜치 `{', '.join(sorted(PROTECTED_BRANCHES))}` 에서는 수정하지 말고 blocked로 응답한다.
            - `.omx/` 밖 dirty 파일이 있더라도 모두 허용 범위 안이면 같은 작업을 이어받아 계속할 수 있다.
            - `.omx/` 밖 dirty 파일 중 허용 범위를 벗어나거나 민감 경로가 섞여 있으면 수정하지 말고 blocked로 응답한다.
            - 허용 경로: {', '.join(EXECUTOR_ALLOWED_PREFIXES)}
            - 허용 단일 파일: {', '.join(sorted(EXECUTOR_ALLOWED_FILES))}
            - 허용 파일 패턴: {', '.join(EXECUTOR_ALLOWED_GLOBS)}
            - 금지 경로: {', '.join(EXECUTOR_FORBIDDEN_PREFIXES)}
            - 금지 파일 패턴: {', '.join(EXECUTOR_FORBIDDEN_GLOBS)}
            - 금지 예외 패턴: {', '.join(EXECUTOR_FORBIDDEN_GLOB_EXCEPTIONS)}
            - 수정했다면 `changed_files`에는 실제 바꾼 파일만 적는다.
            - 기존 dirty 파일을 이어받더라도 범위를 넓히지 말고 이번 trigger에 필요한 최소 수정만 한다.
            - 구현을 했다면 즉시 끝내지 말고, 어떤 검증을 다음 게이트에 넘길지 분명히 적는다.
            """
        ).rstrip()
    return textwrap.dedent(
        f"""\
        당신은 OMX 역할 `{role.name}`이다.
        목표: {role.goal}

        이 회의의 초점
        - started_at: {context.started_at}
        - focus_note: {context.focus_note}

        현재 회의 메타데이터
        - meeting_id: {meeting_id}
        - trigger_kind: {trigger['kind']}
        - trigger_label: {trigger['label']}
        - trigger_context:
        {context.trigger_context}

        최상위 계약
        - PRIMARY_TASK: {contract.primary_task}
        - MIN_EXIT_CONDITION: {contract.min_exit_condition}
        - AUTO_CONTINUE_POLICY: {contract.auto_continue_policy}
        - RELEASE_TO_MAIN_POLICY: {contract.release_to_main_policy}
        - MULTI_AGENT_CONSENSUS: {' -> '.join(contract.consensus_order)}

        규칙
        - 최신 Discord 사용자 지시 1건만 우선한다.
        - superseded_message_ids는 다시 읽지 않는다.
        - 질문은 정말 막힌 경우에만 최소화한다.
        - Discord에 바로 올라갈 문장이므로 보고서체보다 대화체를 우선한다.
        - `team_message`는 실제 회의 발언처럼 자연스러운 한국어 2~4문장으로 쓴다.
        - 이전 역할이 있다면 `reply_to`에 최소 한 명 이상을 넣고, 그 의견을 받아서 찬성/보완/반박 중 하나를 분명히 한다.
        - 이전 역할이 없다면 `reply_to`는 `["user"]`로 두고 사용자 메시지에 직접 반응한다.
        - `question_for_next`는 정말 필요한 질문이나 다음 역할에게 넘길 논점을 한 문장으로 적고, 없으면 빈 문자열로 둔다.
        - `summary`, `rationale`, `proposed_action`은 각각 한두 문장으로 짧고 구체적으로 쓴다.
        - `reply_to`, `risks`, `verification`, `changed_files`, `followups`는 문자열 배열이다.
        - `??` 같은 플레이스홀더나 raw unicode escape를 쓰지 않는다.
        - 비밀, 토큰, webhook URL, env 값은 출력하지 않는다.
        - 출처 없는 가격, 뉴스, 점수를 만들지 않는다.
        - 응답은 JSON schema를 만족해야 하며 핵심 문장은 한국어로 쓴다.
        - read-only 역할은 changed_files를 비운다.
        - needs_human은 외부 권한이나 비밀 부족 때문에 지금 진행할 수 없을 때만 true다.
        {write_gate}

        필수 참고 문서
        {docs}

        상태 요약
        {context.state_excerpt}

        참고 문서 발췌
        {context.docs_excerpt}

        최근 대화
        {context.related_summary}

        이전 역할 출력
        {prior}

        출력 힌트
        - 팀이 Discord에서 읽을 첫 문장은 바로 `team_message`다.
        - 다른 역할의 우려를 그대로 반복하지 말고, 무엇을 보완하거나 뒤집는지 분명히 적는다.
        - 근거 없는 낙관 대신 현재 저장소에서 확인한 사실과 다음 검증 단계를 함께 적는다.
        """
    ).strip()


def normalize_role_output(role: RoleSpec, payload: dict[str, Any]) -> dict[str, Any]:
    payload = sanitize_value(payload)
    payload["role"] = role.name
    for key in ("reply_to", "risks", "verification", "changed_files", "followups"):
        if not isinstance(payload.get(key), list):
            payload[key] = []
        payload[key] = [str(item).strip() for item in payload[key] if str(item).strip()]
    if not role.writable:
        payload["changed_files"] = []
    for key in ("summary", "rationale", "proposed_action", "status", "team_message", "question_for_next"):
        payload[key] = str(payload.get(key, "")).strip()
    if not payload["status"]:
        payload["status"] = "continue"
    if not payload["team_message"]:
        payload["team_message"] = payload["summary"] or payload["proposed_action"] or f"{role.name} 의견을 정리 중이다."
    try:
        payload["confidence"] = float(payload.get("confidence", 0))
    except Exception:
        payload["confidence"] = 0.0
    payload["needs_human"] = bool(payload.get("needs_human", False))
    return payload

def run_role(
    role: RoleSpec,
    trigger: dict[str, Any],
    meeting_id: str,
    prior_outputs: list[dict[str, Any]],
    contract: AgentsContract,
    context: MeetingContext,
) -> dict[str, Any]:
    omx_exec = find_omx_exec()
    output_file = RUNTIME_DIR / f"{meeting_id}-{role.name}-output.json"
    log_file = RUNTIME_DIR / f"{meeting_id}-{role.name}.log"
    args = [
        omx_exec,
        "exec",
        "--cd",
        OMX_WORKSPACE_ROOT,
        "--ephemeral",
        "--color",
        "never",
        "--output-schema",
        str(ROLE_SCHEMA_FILE),
        "-o",
        str(output_file),
        "-",
    ]
    if role.writable:
        args[2:2] = ["--sandbox", "danger-full-access"]
    else:
        args[2:2] = ["--sandbox", role.sandbox]

    emit_console(role.name, f"run start trigger={trim(trigger['label'], 100)}")
    write_runtime_status(status="role_running", detail=trim(trigger['label'], 160), meeting_id=meeting_id, role=role.name, trigger=trigger["kind"])
    gate_result = WriteGateResult(True, "", "")
    if role.writable:
        gate_result = check_executor_write_gate()
        if not gate_result.ok:
            emit_console(role.name, f"write blocked: {trim(gate_result.reason, 140)}")
            write_runtime_status(status="role_blocked", detail=trim(gate_result.reason, 200), meeting_id=meeting_id, role=role.name, trigger=trigger["kind"])
            return build_write_gate_output(role, gate_result.reason, branch=gate_result.branch)
    sync_discord_replies()
    prompt = build_role_prompt(role, trigger, meeting_id, prior_outputs, contract, context)
    with log_file.open("w", encoding="utf-8") as handle:
        completed = subprocess.run(
            args,
            input=prompt.encode("utf-8"),
            cwd=ROOT,
            stdout=handle,
            stderr=subprocess.STDOUT,
            timeout=ROLE_TIMEOUT_SECONDS,
            check=False,
        )
    if completed.returncode != 0:
        raise RuntimeError(f"{role.name} failed with exit={completed.returncode}: {trim(read_text(log_file), 1200)}")
    payload = load_json(output_file, {})
    if not isinstance(payload, dict):
        raise RuntimeError(f"{role.name} returned non-object payload")
    normalized = normalize_role_output(role, payload)
    if role.writable and gate_result.reason:
        normalized.setdefault("verification", []).append(gate_result.reason)
    if role.writable:
        reported_files = list(normalized.get("changed_files", []))
        gate_ok, actual_changed, gate_reason = validate_executor_changes(role, gate_result.branch)
        normalized["changed_files"] = actual_changed
        if actual_changed and reported_files != actual_changed:
            normalized.setdefault("verification", []).append("executor changed_files를 실제 git 변경 파일 기준으로 보정했다.")
        if not actual_changed and normalized.get("status") not in {"blocked", "fail"}:
            normalized.setdefault("verification", []).append("executor writable mode였지만 `.omx/` 밖 실제 파일 변경은 없었다.")
        if not gate_ok:
            write_verify_failure(
                "active",
                "executor write safety gate",
                "executor changed disallowed files",
                gate_reason,
                "허용되지 않은 변경 파일을 정리하고 issue branch의 깨끗한 작업트리에서 다시 실행한다.",
            )
            emit_console(role.name, f"write gate failed: {trim(gate_reason, 140)}")
            write_runtime_status(status="role_failed", detail=trim(gate_reason, 200), meeting_id=meeting_id, role=role.name, trigger=trigger["kind"])
            return build_write_gate_output(role, gate_reason, branch=gate_result.branch, status="fail", changed_files=actual_changed)
    emit_console(role.name, f"done status={normalized['status']} next={trim(normalized['proposed_action'], 100)}")
    return normalized



def format_role_message(payload: dict[str, Any], meeting_id: str, trigger: dict[str, Any]) -> str:
    _ = meeting_id, trigger
    raw_targets = [sanitize_text(str(item)) for item in payload.get("reply_to", []) if str(item).strip()]
    display_targets = ["사용자" if item == "user" else item for item in raw_targets] or ["사용자"]
    opener = (
        "사용자 요청부터 바로 이어갈게요."
        if display_targets == ["사용자"]
        else f"{', '.join(display_targets)} 의견 받아서 이어갈게요."
    )
    team_message = sanitize_text(str(payload.get("team_message", "")).strip())
    lines = [opener]
    if team_message:
        lines.append(team_message)
    return "\n".join(lines)


def run_command(command: list[str], log_name: str, timeout: int) -> tuple[int, str]:
    log_file = RUNTIME_DIR / log_name
    completed = subprocess.run(
        command,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        check=False,
    )
    log_text = decode_text_bytes(completed.stdout or b"")
    write_text(log_file, log_text)
    return completed.returncode, trim(log_text, 2000)


def write_verify_failure(status: str, failing_command: str, symptom: str, likely_cause: str, next_fix: str) -> None:
    write_text(
        VERIFY_FAILURE_FILE,
        textwrap.dedent(
            f"""\
            # 최근 검증 실패

            status: {status}
            failing_command: {failing_command}
            symptom: {symptom}
            likely_cause: {likely_cause}
            remediation_owner: current iteration
            next_fix: {next_fix}
            """
        ),
    )


def run_verify_gate() -> tuple[bool, str]:
    steps = [
        ([sys.executable, "scripts/no_secrets_guard.py"], "python scripts/no_secrets_guard.py", "no-secrets-guard.log", 300),
        ([sys.executable, "scripts/verify_minimal.py"], "python scripts/verify_minimal.py", "verify-last.log", VERIFY_TIMEOUT_SECONDS),
    ]
    logs: list[str] = []
    for command, label, log_name, timeout in steps:
        try:
            returncode, log_text = run_command(command, log_name, timeout)
        except Exception as exc:
            write_verify_failure("active", label, "verification setup failed", str(exc), "검증 스크립트 실행 환경을 먼저 복구한다.")
            return False, f"$ {label}\n{exc}"
        logs.append(f"$ {label}\n{log_text}")
        if returncode != 0:
            write_verify_failure("active", label, "verification command returned non-zero", f"inspect .omx/runtime/{log_name}", "실패한 명령을 먼저 통과시키고 같은 명령부터 다시 실행한다.")
            return False, "\n\n".join(logs)
    write_verify_failure("clear", "", "", "", "")
    return True, "\n\n".join(logs)


def build_verifier_output(executor_output: dict[str, Any] | None, verify_ok: bool | None, verify_log: str) -> dict[str, Any]:
    if executor_output is None:
        return {
            "role": "verifier",
            "status": "blocked",
            "summary": "executor 전에 회의가 중단되어 검증 단계에 진입하지 못했다.",
            "rationale": "executor 결과가 없다.",
            "proposed_action": "막힌 역할의 사유를 먼저 해소한다.",
            "team_message": "executor까지 회의가 이어지지 못해서 아직 검증 단계에 들어가지 못했습니다. 먼저 어디에서 막혔는지부터 정리해야 합니다.",
            "question_for_next": "어떤 역할의 차단 사유를 먼저 풀어야 하는가?",
            "reply_to": ["executor"],
            "risks": ["구현 상태를 검증하지 못했다."],
            "verification": ["verify gate skipped"],
            "changed_files": [],
            "followups": ["막힌 역할 원인 해소"],
            "confidence": 0.2,
            "needs_human": False,
        }
    if executor_output.get("needs_human") or executor_output.get("status") in {"blocked", "fail"}:
        return {
            "role": "verifier",
            "status": "blocked",
            "summary": "executor가 차단 상태라 guard/verify gate를 생략했다.",
            "rationale": executor_output.get("summary", "executor blocked"),
            "proposed_action": "executor 차단 원인을 해결하고 같은 작업을 다시 검증한다.",
            "team_message": "executor가 아직 막혀 있어서 지금 검증을 돌려도 의미가 없습니다. executor 쪽 차단 원인을 먼저 푼 뒤 같은 흐름을 다시 검증해야 합니다.",
            "question_for_next": "executor 차단 원인을 지금 바로 해소할 수 있는가?",
            "reply_to": ["executor"],
            "risks": ["구현 결과가 검증되지 않았다."],
            "verification": ["executor blocked; verify gate skipped"],
            "changed_files": [],
            "followups": ["executor 차단 원인 해결"],
            "confidence": 0.35,
            "needs_human": bool(executor_output.get("needs_human", False)),
        }
    if verify_ok is None:
        return {
            "role": "verifier",
            "status": "done",
            "summary": "회의형 executor가 실행 계획까지만 정리했고 실제 코드 변경은 아직 수행하지 않았다.",
            "rationale": trim(verify_log, 400) or "회의 단계라 guard/verify를 생략했다.",
            "proposed_action": "다음 구현 iteration에서 executor 액션을 실제 코드 변경과 검증으로 이어간다.",
            "team_message": "이번 executor는 회의용 정리까지만 끝냈고 실제 코드 변경은 아직 없습니다. 다음 iteration에서 이 액션을 구현과 검증으로 바로 이어가면 됩니다.",
            "question_for_next": "다음 iteration에서 가장 먼저 구현할 한 단계는 무엇인가?",
            "reply_to": ["executor"],
            "risks": ["실제 코드 변경 전이라 기능 상태는 아직 바뀌지 않았을 수 있다."],
            "verification": ["meeting-only executor; verify gate skipped"],
            "changed_files": [],
            "followups": list(executor_output.get("followups", [])) or ["executor 액션을 실제 구현으로 이어간다."],
            "confidence": 0.62,
            "needs_human": False,
        }
    if verify_ok:
        executor_scope = trim(str(executor_output.get("summary", "")).strip(), 220)
        executor_proposed = trim(str(executor_output.get("proposed_action", "")).strip(), 220)
        executor_followup = next(
            (trim(str(item).strip(), 220) for item in executor_output.get("followups", []) if str(item).strip()),
            "",
        )
        summary = "executor가 정리한 범위 기준으로 guard/verify gate를 통과했다."
        rationale = "no secrets guard와 standard verify가 모두 성공했다."
        team_message = "executor 이후 검증 게이트는 통과했습니다. 이제 같은 맥락에서 가치가 높은 후속 구현이나 QA로 이어가면 됩니다."
        proposed_action = executor_followup or executor_proposed or "다음 가치 작업, 후속 구현, 또는 QA 범위로 진행한다."
        question_for_next = "후속 구현과 QA 중 어디가 지금 더 가치가 큰가?"
        if executor_scope:
            summary = f"executor가 정리한 범위({executor_scope}) 기준으로 guard/verify gate를 통과했다."
            rationale = f"{executor_scope} 범위에서 no secrets guard와 standard verify가 모두 성공했다."
            team_message = f"이번 확인은 {executor_scope} 범위에서 닫혔고 guard/verify gate도 통과했습니다."
            if executor_proposed:
                team_message += f" {executor_proposed}"
            elif executor_followup:
                team_message += f" 다음에는 {executor_followup}로 이어가면 됩니다."
            question_for_next = executor_followup or question_for_next
        return {
            "role": "verifier",
            "status": "pass",
            "summary": summary,
            "rationale": rationale,
            "proposed_action": proposed_action,
            "team_message": team_message,
            "question_for_next": question_for_next,
            "reply_to": ["executor"],
            "risks": [],
            "verification": ["python scripts/no_secrets_guard.py: pass", "python scripts/verify_minimal.py: pass"],
            "changed_files": [],
            "followups": list(executor_output.get("followups", [])),
            "confidence": 0.86,
            "needs_human": False,
        }
    return {
        "role": "verifier",
        "status": "fail",
        "summary": "executor 이후 guard/verify gate에서 실패가 발생했다.",
        "rationale": trim(verify_log, 400),
        "proposed_action": "VERIFY_LAST_FAILURE.md에 적힌 실패 명령부터 복구한다.",
        "team_message": "executor 뒤 검증 게이트에서 실패가 났습니다. 이 상태로 넘기면 회귀를 품고 가게 되니 실패한 명령부터 바로 복구해야 합니다.",
        "question_for_next": "실패 로그에서 가장 먼저 고쳐야 할 한 줄은 무엇인가?",
        "reply_to": ["executor"],
        "risks": ["실패한 검증을 무시하면 회귀나 비밀 문제가 남을 수 있다."],
        "verification": ["guard/verify gate failed"],
        "changed_files": [],
        "followups": ["실패한 검증 명령 복구"],
        "confidence": 0.28,
        "needs_human": False,
    }


def compute_next_action(role_outputs: list[dict[str, Any]], contract: AgentsContract) -> str:
    for output in reversed(role_outputs):
        for candidate in list(output.get("followups", [])) + [output.get("proposed_action", "")]:
            candidate = str(candidate).strip()
            if candidate:
                return candidate
    return contract.primary_task or "최상위 계약의 다음 P0를 다시 고른다."


def schedule_followup(loop_state: dict[str, Any], role_outputs: list[dict[str, Any]], next_action: str, meeting_id: str) -> None:
    loop_state["last_next_action"] = next_action.strip()
    if not role_outputs or role_outputs[-1].get("needs_human") or not next_action.strip():
        loop_state["pending_followup"] = {}
        return
    loop_state["pending_followup"] = {"content": next_action.strip(), "source_meeting_id": meeting_id, "created_at": iso_now()}


def write_iteration_journal(
    iteration: int,
    started_at: str,
    meeting_id: str,
    trigger: dict[str, Any] | None,
    role_outputs: list[dict[str, Any]],
    verify_ok: bool | None,
    verify_log: str,
    next_action: str,
    note: str,
) -> None:
    changed_files: list[str] = []
    verification_lines: list[str] = []
    for output in role_outputs:
        for path in output.get("changed_files", []):
            if path not in changed_files:
                changed_files.append(path)
        for item in output.get("verification", []):
            if item not in verification_lines:
                verification_lines.append(item)
    if verify_ok is True:
        for item in ("python scripts/no_secrets_guard.py: pass", "python scripts/verify_minimal.py: pass"):
            if item not in verification_lines:
                verification_lines.append(item)
    journal = textwrap.dedent(
        f"""\
        # Loop Iteration {iteration}

        - started_at: {started_at}
        - meeting_id: {meeting_id}
        - trigger: {trigger['label'] if trigger else 'idle'}
        - note: {note}
        - verify_result: {"pass" if verify_ok is True else "fail" if verify_ok is False else "skipped"}

        ## Role Summary
        {chr(10).join(f"- {item['role']}: {item.get('team_message') or item['summary']}" for item in role_outputs) or '- no role output'}

        ## Changed Files
        {chr(10).join(f"- {item}" for item in changed_files) or '- none'}

        ## Verification
        {chr(10).join(f"- {item}" for item in verification_lines) or '- none'}

        ## Verify Log
        ```text
        {verify_log.strip() or 'none'}
        ```

        ## Next Action
        - {next_action}
        """
    ).strip() + "\n"
    write_text(JOURNAL_DIR / f"loop-{iteration:04d}.md", journal)



def write_ralph_progress(
    contract: AgentsContract,
    *,
    iteration: int,
    meeting_id: str,
    trigger: dict[str, Any] | None,
    next_action: str,
    verify_ok: bool | None,
) -> None:
    lines = [
        "# Ralph Progress",
        "",
        f"- project: {contract.project_name or ROOT.name}",
        f"- iteration: {iteration}",
        f"- meeting_id: {meeting_id}",
        f"- trigger: {trigger['label'] if trigger else 'idle'}",
        f"- verify_result: {'pass' if verify_ok is True else 'fail' if verify_ok is False else 'skipped'}",
        f"- next_action: {next_action or 'none'}",
        "",
        "## Goal",
        contract.primary_task or "- none",
        "",
        "## Minimum Done",
    ]
    if contract.minimum_done:
        lines.extend(f"- {item}" for item in contract.minimum_done)
    else:
        lines.append("- none")
    write_text(RALPH_PROGRESS_FILE, "\n".join(lines).strip() + "\n")


def clear_failure_streak(loop_state: dict[str, Any]) -> None:
    loop_state["last_failure_signature"] = ""
    loop_state["failure_streak"] = 0



def update_failure_streak(loop_state: dict[str, Any], trigger: dict[str, Any] | None) -> None:
    signature = f"{trigger['kind']}::{trigger['id']}" if trigger else "idle"
    if loop_state.get("last_failure_signature") == signature:
        loop_state["failure_streak"] = int(loop_state.get("failure_streak", 0)) + 1
    else:
        loop_state["last_failure_signature"] = signature
        loop_state["failure_streak"] = 1


def maybe_report_repeated_failure(loop_state: dict[str, Any], trigger: dict[str, Any]) -> None:
    streak = int(loop_state.get("failure_streak", 0))
    if streak < REPEATED_FAILURE_THRESHOLD:
        return
    post_message("watchdog", f"같은 실패가 {streak}회 반복되었습니다. 같은 방법 반복을 중단하고 우회책을 먼저 고르겠습니다.", loop_state.get("last_meeting_id", "watchdog"), "failure_streak", trigger["id"], trigger.get("thread_id"))


def mark_trigger_done(loop_state: dict[str, Any], trigger: dict[str, Any]) -> None:
    if trigger["kind"] == "discord_user":
        handled = loop_state.setdefault("handled_discord_message_ids", [])
        handled.extend(trigger.get("superseded_message_ids", []))
        handled.append(trigger["message_id"])
    if trigger["kind"] == "followup":
        loop_state["pending_followup"] = {}
    loop_state["last_autonomous_cycle_at"] = iso_now()


def run_meeting(
    loop_state: dict[str, Any],
    trigger: dict[str, Any],
    contract: AgentsContract,
    context: MeetingContext,
) -> tuple[list[dict[str, Any]], bool | None, str, str]:
    loop_state["meeting_counter"] = int(loop_state.get("meeting_counter", 0)) + 1
    meeting_id = f"{utc_now().strftime('%Y%m%d-%H%M%S')}-{loop_state['meeting_counter']:04d}"
    loop_state["last_meeting_id"] = meeting_id
    if trigger["kind"] == "discord_user":
        update_important_discord_notes()

    trigger_metadata = build_trigger_metadata(trigger)
    emit_console("meeting", f"start id={meeting_id} trigger={trim(trigger['label'], 120)}")
    post_message(
        "coordinator",
        build_coordinator_opening(trigger, context, loop_state),
        meeting_id,
        "meeting_start",
        trigger["id"],
        trigger.get("thread_id"),
        metadata=trigger_metadata,
    )

    role_outputs: list[dict[str, Any]] = []
    executor_output: dict[str, Any] | None = None
    verify_ok: bool | None = None
    verify_log = ""
    for role_name in ROLE_ORDER:
        output = run_role(ROLE_SPECS[role_name], trigger, meeting_id, role_outputs, contract, context)
        role_outputs.append(output)
        post_message(
            role_name,
            format_role_message(output, meeting_id, trigger),
            meeting_id,
            role_name,
            trigger["id"],
            trigger.get("thread_id"),
            metadata=merge_metadata(trigger_metadata, output),
        )
        if role_name != "executor" and output.get("needs_human"):
            break
        if role_name == "executor":
            executor_output = output
            if output.get("needs_human") or output.get("status") in {"blocked", "fail"}:
                verify_log = "executor가 차단 상태라 verify gate를 생략했다."
            elif ROLE_SPECS[role_name].writable:
                verify_ok, verify_log = run_verify_gate()
            else:
                verify_log = "회의형 executor는 실행 계획만 정리하므로 guard/verify를 생략했다."
            break

    verifier_output = build_verifier_output(executor_output, verify_ok, verify_log)
    role_outputs.append(verifier_output)
    post_message(
        "verifier",
        format_role_message(verifier_output, meeting_id, trigger),
        meeting_id,
        "verifier",
        trigger["id"],
        trigger.get("thread_id"),
        metadata=merge_metadata(trigger_metadata, verifier_output),
    )

    next_action = compute_next_action(role_outputs, contract)
    post_message(
        "scribe",
        textwrap.dedent(
            f"""\
            회의를 여기서 정리합니다.
            역할 요약:
            {chr(10).join(f"- {item['role']}: {item['summary']}" for item in role_outputs) or '- 없음'}
            다음 액션: {next_action}
            """
        ).strip(),
        meeting_id,
        "meeting_end",
        trigger["id"],
        trigger.get("thread_id"),
        metadata=trigger_metadata,
    )
    emit_console("meeting", f"end id={meeting_id} roles={len(role_outputs)} next={trim(next_action, 120)}")
    return role_outputs, verify_ok, verify_log, meeting_id


def write_idle_journal(iteration: int, started_at: str, loop_state: dict[str, Any], contract: AgentsContract) -> None:
    write_iteration_journal(
        iteration,
        started_at,
        loop_state.get("last_meeting_id", f"idle-{iteration:04d}"),
        None,
        [],
        None,
        "",
        contract.primary_task or "Discord 최신 지시를 기다린다.",
        "새 트리거가 없어 대기한다.",
    )



def main() -> int:
    ensure_dirs()
    repair_state_logs()
    contract = parse_agents_contract()
    apply_contract_runtime_overrides(contract)
    sync_discord_replies()

    control_state = load_control_state()
    contract = apply_control_overrides(contract, control_state)
    loop_state = load_loop_state()

    command = str(control_state.get("command", "")).strip().lower()
    if command == "stop":
        write_runtime_status(status="stopped", detail="discord stop requested", trigger="control")
        write_ralph_progress(
            contract,
            iteration=int(loop_state.get("iteration", 0)),
            meeting_id=str(loop_state.get("last_meeting_id", "")),
            trigger=None,
            next_action="stopped by discord command",
            verify_ok=None,
        )
        save_loop_state(loop_state)
        return 2

    if command == "pause":
        write_runtime_status(status="paused", detail="discord pause requested", trigger="control")
        write_ralph_progress(
            contract,
            iteration=int(loop_state.get("iteration", 0)),
            meeting_id=str(loop_state.get("last_meeting_id", "")),
            trigger=None,
            next_action="paused by discord command",
            verify_ok=None,
        )
        save_loop_state(loop_state)
        return 0

    if command == "resume":
        control_state["command"] = ""
        save_control_state(control_state)

    nudge = str(control_state.get("nudge", "")).strip()
    if nudge:
        loop_state["pending_followup"] = {
            "content": nudge,
            "source_meeting_id": "discord-control",
            "created_at": iso_now(),
        }
        control_state["nudge"] = ""
        save_control_state(control_state)

    started_at = iso_now()
    emit_console("contract", f"primary={trim(contract.primary_task, 140)}")
    emit_console("contract", f"exit={trim(contract.min_exit_condition, 140)}")
    emit_console("contract", f"auto_continue={trim(contract.auto_continue_policy, 140)}")
    if contract.enable_github_automation:
        try:
            sync_and_report_release_pr(
                loop_state,
                contract,
                meeting_id="github-release-sync",
                trigger={"id": "loop-startup-release-sync", "thread_id": None},
            )
        except Exception as exc:
            github_note = trim(str(exc), 600)
            write_github_automation_status(loop_state, f"release sync error: {github_note}")
            emit_console("github", f"release sync error: {github_note}")
    iteration = int(os.getenv("OMX_LOOP_ITERATION", "0") or "0") or int(loop_state.get("iteration", 0)) + 1
    loop_state["iteration"] = iteration
    write_json(RALPH_STATE_FILE, {"enabled": True, "iteration": iteration, "updated_at": iso_now()})
    write_runtime_status(status="running", detail=f"iteration={iteration}", trigger="loop")
    emit_console("loop", f"iteration={iteration} workspace={OMX_WORKSPACE_ROOT}")

    trigger = select_trigger(loop_state, contract)
    if not trigger:
        emit_console("idle", "no trigger")
        write_idle_journal(iteration, started_at, loop_state, contract)
        write_ralph_progress(contract, iteration=iteration, meeting_id=loop_state.get("last_meeting_id", ""), trigger=None, next_action=contract.primary_task or "idle", verify_ok=None)
        write_runtime_status(status="idle", detail="no trigger", trigger="idle")
        save_loop_state(loop_state)
        return 0

    note = "Discord 최신 사용자 지시 처리" if trigger["kind"] == "discord_user" else "자율 또는 복구 작업 처리"
    emit_console("trigger", f"kind={trigger['kind']} label={trim(trigger['label'], 140)}")
    if contract.enable_github_automation:
        try:
            bootstrap = ensure_issue_branch(loop_state, trigger, contract)
            if bootstrap.detail:
                emit_console("github", trim(bootstrap.detail, 140))
            if bootstrap.issue_number and bootstrap.branch:
                post_message(
                    "coordinator",
                    f"GitHub 이슈 #{bootstrap.issue_number} 를 만들고 작업 브랜치 `{bootstrap.branch}` 로 전환했습니다.",
                    loop_state.get("last_meeting_id", f"github-{iteration:04d}"),
                    "github_issue_branch",
                    trigger["id"],
                    trigger.get("thread_id"),
                )
        except Exception as exc:
            github_note = trim(str(exc), 600)
            write_github_automation_status(loop_state, f"issue/branch bootstrap error: {github_note}")
            emit_console("github", f"issue/branch bootstrap error: {github_note}")
    try:
        context = build_meeting_context(trigger, contract)
        role_outputs, verify_ok, verify_log, meeting_id = run_meeting(loop_state, trigger, contract, context)
        next_action = compute_next_action(role_outputs, contract)
        github_notes: list[str] = []
        if contract.enable_github_automation:
            try:
                publish_result = publish_issue_branch(loop_state, trigger, contract, role_outputs, verify_ok, verify_log)
                if publish_result.ok and publish_result.pr_number:
                    github_notes.append(publish_result.detail)
                    post_message(
                        "coordinator",
                        f"PR #{publish_result.pr_number} 를 만들고 `{ISSUE_BRANCH_BASE}` 자동 병합을 설정했습니다. {publish_result.pr_url}",
                        meeting_id,
                        "github_pr_open",
                        trigger["id"],
                        trigger.get("thread_id"),
                    )
                elif publish_result.detail:
                    emit_console("github", trim(publish_result.detail, 140))
            except Exception as exc:
                github_note = trim(str(exc), 600)
                github_notes.append(f"GitHub publish error: {github_note}")
                write_github_automation_status(loop_state, f"publish error: {github_note}")
                emit_console("github", f"publish error: {github_note}")
            try:
                sync_and_report_release_pr(
                    loop_state,
                    contract,
                    meeting_id=meeting_id,
                    trigger=trigger,
                    github_notes=github_notes,
                )
            except Exception as exc:
                github_note = trim(str(exc), 600)
                github_notes.append(f"GitHub release error: {github_note}")
                write_github_automation_status(loop_state, f"release error: {github_note}")
                emit_console("github", f"release error: {github_note}")
        if verify_ok is False:
            update_failure_streak(loop_state, trigger)
            maybe_report_repeated_failure(loop_state, trigger)
        else:
            clear_failure_streak(loop_state)
        mark_trigger_done(loop_state, trigger)
        schedule_followup(loop_state, role_outputs, next_action, meeting_id)
        journal_note = note if not github_notes else f"{note} / {' / '.join(github_notes)}"
        write_iteration_journal(iteration, started_at, meeting_id, trigger, role_outputs, verify_ok, verify_log, next_action, journal_note)
        write_ralph_progress(contract, iteration=iteration, meeting_id=meeting_id, trigger=trigger, next_action=next_action, verify_ok=verify_ok)
        loop_state["last_result"] = role_outputs[-1]["status"] if role_outputs else "idle"
        save_loop_state(loop_state)
        write_runtime_status(status="completed", detail=trim(next_action, 160), meeting_id=meeting_id, role="scribe", trigger=trigger["kind"])
        emit_console("loop", f"iteration={iteration} completed result={loop_state['last_result']}")
        return 0
    except Exception as exc:
        failure_note = trim(str(exc), 1500)
        emit_console("error", failure_note)
        write_verify_failure("active", "scripts/omx_autonomous_loop.py", "meeting execution failed", failure_note, "최신 role log를 확인하고 가장 작은 실패 단계부터 다시 실행한다.")
        write_iteration_journal(
            iteration,
            started_at,
            loop_state.get("last_meeting_id", f"failed-{iteration:04d}"),
            trigger,
            [],
            False,
            failure_note,
            "OMX role 실행 오류를 먼저 복구한다.",
            "회의 실행 중 예외가 발생했다.",
        )
        write_ralph_progress(
            contract,
            iteration=iteration,
            meeting_id=loop_state.get("last_meeting_id", f"failed-{iteration:04d}"),
            trigger=trigger,
            next_action="복구 가능한 가장 작은 실패 단계부터 다시 실행한다.",
            verify_ok=False,
        )
        loop_state["last_result"] = "failed"
        update_failure_streak(loop_state, trigger)
        maybe_report_repeated_failure(loop_state, trigger)
        if trigger["kind"] in {"discord_user", "followup"} and int(loop_state.get("failure_streak", 0)) >= REPEATED_FAILURE_THRESHOLD:
            mark_trigger_done(loop_state, trigger)
        save_loop_state(loop_state)
        write_runtime_status(status="failed", detail=failure_note, meeting_id=loop_state.get("last_meeting_id", ""), role="watchdog", trigger=trigger["kind"])
        post_message("watchdog", f"회의 실행이 실패했습니다: {failure_note}", loop_state.get("last_meeting_id", f"failed-{iteration:04d}"), "loop_error", trigger["id"], trigger.get("thread_id"))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
