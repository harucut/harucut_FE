from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

import yaml


DEFAULT_BRIDGE_HOST = "127.0.0.1"
DEFAULT_BRIDGE_PORT = 8787
AUTO_PORT_BASE = 8800
AUTO_PORT_SPAN = 700
WINDOWS_DRIVE_POOL = "XYZWVUTSRQPONMLKJIHGFEDCBA"


def load_ralph_config(repo_root: Path) -> dict[str, Any]:
    config_path = repo_root / ".ralph-loop.yml"
    if not config_path.exists():
        return {}
    try:
        payload = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def stable_number(value: str) -> int:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return int(digest[:12], 16)


def parse_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def pick_bridge_port(repo_root: Path, runtime_cfg: dict[str, Any]) -> int:
    raw_value = runtime_cfg.get("bridge_port")
    if raw_value not in (None, ""):
        return parse_int(raw_value, DEFAULT_BRIDGE_PORT)
    return AUTO_PORT_BASE + (stable_number(str(repo_root.resolve())) % AUTO_PORT_SPAN)


def pick_ascii_drive(repo_root: Path, runtime_cfg: dict[str, Any]) -> str:
    raw_value = str(runtime_cfg.get("ascii_workspace_drive", "") or "").strip()
    if raw_value:
        return raw_value.upper()
    raw_root = str(repo_root.resolve())
    if os.name != "nt" or raw_root.isascii():
        return ""
    letter = WINDOWS_DRIVE_POOL[stable_number(raw_root) % len(WINDOWS_DRIVE_POOL)]
    return f"{letter}:"


def resolve_workspace_root(repo_root: Path, ascii_drive: str) -> str:
    raw_root = str(repo_root.resolve())
    if os.name != "nt" or raw_root.isascii():
        return raw_root

    drive = ascii_drive.strip().upper()
    if re.fullmatch(r"[A-Z]:", drive):
        try:
            subprocess.run(
                ["subst", drive, raw_root],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
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


def build_runtime(repo_root: Path) -> dict[str, Any]:
    resolved_root = repo_root.resolve()
    config = load_ralph_config(resolved_root)
    runtime_cfg = config.get("runtime", {}) if isinstance(config.get("runtime"), dict) else {}
    project_cfg = config.get("project", {}) if isinstance(config.get("project"), dict) else {}

    bridge_host = str(runtime_cfg.get("bridge_host", DEFAULT_BRIDGE_HOST) or DEFAULT_BRIDGE_HOST).strip() or DEFAULT_BRIDGE_HOST
    bridge_port = pick_bridge_port(resolved_root, runtime_cfg)
    ascii_drive = pick_ascii_drive(resolved_root, runtime_cfg)
    workspace_root = resolve_workspace_root(resolved_root, ascii_drive)

    return {
        "project_name": str(project_cfg.get("name", resolved_root.name) or resolved_root.name).strip() or resolved_root.name,
        "repo_root": str(resolved_root),
        "workspace_root": workspace_root,
        "bridge_host": bridge_host,
        "bridge_port": bridge_port,
        "ascii_workspace_drive": ascii_drive,
        "state_dir": str(resolved_root / ".omx" / "state"),
        "runtime_dir": str(resolved_root / ".omx" / "runtime"),
        "journal_dir": str(resolved_root / ".omx" / "journal"),
        "progress_dir": str(resolved_root / ".ralph"),
        "progress_file": str(resolved_root / ".ralph" / "progress.md"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve Ralph loop runtime settings for a repository.")
    parser.add_argument("mode", nargs="?", default="json", choices=("json", "env"))
    parser.add_argument("--repo-root", default=".")
    args = parser.parse_args()

    runtime = build_runtime(Path(args.repo_root))
    if args.mode == "env":
        for key, value in runtime.items():
            print(f"{key}={value}")
        return 0

    print(json.dumps(runtime, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
