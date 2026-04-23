from __future__ import annotations

import argparse
import os
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


GROUPS: dict[str, list[list[str]]] = {
    "web": [
        ["pnpm", "test:web"],
        ["pnpm", "build:web"],
    ],
    "mobile": [
        ["pnpm", "lint:mobile"],
        ["pnpm", "typecheck:mobile"],
    ],
    "standard": [
        ["pnpm", "test:web"],
        ["pnpm", "build:web"],
        ["pnpm", "lint:mobile"],
        ["pnpm", "typecheck:mobile"],
    ],
}


def run_command(command: list[str]) -> None:
    print(f"[verify] {' '.join(command)}")
    executable = shutil.which(command[0]) or shutil.which(f"{command[0]}.cmd")
    if executable:
        command = [executable, *command[1:]]
        subprocess.run(command, cwd=ROOT, check=True)
        return

    if os.name == "nt":
        subprocess.run(" ".join(command), cwd=ROOT, check=True, shell=True)
        return

    subprocess.run(command, cwd=ROOT, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run grouped verification commands for Harucut.")
    parser.add_argument("--group", choices=sorted(GROUPS), required=True)
    args = parser.parse_args()

    for command in GROUPS[args.group]:
        run_command(command)

    print(f"[verify] group={args.group} ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
