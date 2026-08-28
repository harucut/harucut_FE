#!/usr/bin/env python3
"""프론트가 부르는 것과 백엔드가 실제로 가진 것을 대조한다.

왜 있나 — 지금까지 이 대조는 사람이 손으로 했고, 그 결과를 docs/backend-contract.md 에
적어 뒀다. 손으로 한 대조는 백엔드가 한 번 나가면 그날로 낡는다. 실제로 그렇게 낡아서
`ComposeRequest.backgroundColor` 가 열린 걸 한동안 아무도 안 썼고, 서버에 존재하지 않는
에러코드 10개가 "처리하고 있다"는 얼굴로 남아 있었다.

무엇을 보나
  A. FE 프록시 라우트 → 백엔드에 그 경로/메서드가 실제로 있는가        (없으면 실패)
  B. FE 프록시 라우트를 부르는 곳이 있는가                              (없으면 경고)
  C. 백엔드 에러코드 ↔ FE 문구 표가 1:1 인가                            (누락은 실패)
  D. FE 가 부르는 엔드포인트의 필수 요청 필드 목록                       (참고 출력)

쓰는 법
  docs/local-backend.md 대로 백엔드를 띄운 뒤:
    python3 scripts/check_backend_contract.py
    python3 scripts/check_backend_contract.py --base-url http://localhost:8080

에러코드는 컨테이너가 떠 있으면 **실행 중인 jar 의 ErrorCode enum** 에서 뽑는다.
스웨거 응답 예시에만 의존하면 문서화되지 않은 코드(GEN-091 같은 5xx)를 죽은 항목으로
잘못 짚는다. 컨테이너가 없으면 스웨거 기준으로 낮춰 보고 그 사실을 함께 알린다.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(ROOT, "apps/web/app/api")
ERROR_MAP_FILES = [
    "packages/shared/src/api-error-messages.ts",
    "packages/shared/src/plan-errors.ts",
]
# 서버 코드가 아니라 클라이언트가 만들어 쓰는 코드(api-error-messages.ts 참고).
CLIENT_ONLY_CODES = {"CLIENT-001"}
CALLER_DIRS = [
    "apps/web/lib", "apps/web/app", "apps/web/components",
    "apps/web/hooks", "apps/web/tests", "packages",
]
METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")

problems: list[str] = []
warnings: list[str] = []


def fetch_spec(base_url: str) -> dict:
    url = f"{base_url.rstrip('/')}/v3/api-docs"
    try:
        with urllib.request.urlopen(url, timeout=10) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"✖ 백엔드 스펙을 못 읽었다: {url}\n  {exc}")
        print("  백엔드를 먼저 띄울 것 — docs/local-backend.md")
        raise SystemExit(2)


def normalize(path: str) -> str:
    """경로 변수 이름은 서로 달라도 같은 경로다. /a/{id} 와 /a/{X} 를 같게 본다."""
    return re.sub(r"\{[^}]*\}", "{}", path.rstrip("/"))


def collect_backend(spec: dict) -> dict[tuple[str, str], dict]:
    out = {}
    for path, ops in spec.get("paths", {}).items():
        for method, op in ops.items():
            if method.upper() in METHODS:
                out[(method.upper(), path)] = op
    return out


def collect_fe_routes() -> list[tuple[str, str, str]]:
    """(메서드, 백엔드경로, 라우트경로) 목록."""
    found = []
    for dirpath, _dirs, files in os.walk(API_DIR):
        if "route.ts" not in files:
            continue
        file = os.path.join(dirpath, "route.ts")
        src = open(file, encoding="utf-8").read()
        route = dirpath.replace(os.path.join(ROOT, "apps/web/app"), "")
        for m in re.finditer(
            r"export\s+(?:async\s+)?function\s+(" + "|".join(METHODS) + r")\s*\(", src
        ):
            method = m.group(1)
            tail = src[m.end():]
            nxt = re.search(
                r"export\s+(?:async\s+)?function\s+(?:" + "|".join(METHODS) + r")\s*\(", tail
            )
            block = tail[: nxt.start()] if nxt else tail
            for raw in re.findall(r"\$\{[A-Z_]*BASE_URL\}(/api/[^`\"']*)", block):
                target = re.sub(r"\$\{[^}]*\}", "{}", raw).split("?")[0].rstrip("/")
                found.append((method, target, route))
    return sorted(found, key=lambda x: (x[2], x[0]))


def jar_error_codes() -> set[str] | None:
    """실행 중인 컨테이너의 jar 에서 ErrorCode 상수를 뽑는다. 못 하면 None."""
    script = (
        "set -e; d=$(mktemp -d); "
        "unzip -o -q /app/app.jar -d $d 'BOOT-INF/classes/*'; "
        "find $d -name '*.class' | xargs strings -a 2>/dev/null | "
        "grep -oE '\\b(GEN|AUTH|SUBS|PAY|FRAME|TERMS|COUPON|NOTICE|STOR)-[0-9]{3}\\b' | sort -u; "
        "rm -rf $d"
    )
    try:
        res = subprocess.run(
            ["docker", "exec", "harucut-app", "sh", "-c", script],
            capture_output=True, text=True, timeout=120,
        )
        if res.returncode != 0:
            return None
        codes = {l.strip() for l in res.stdout.splitlines() if l.strip()}
        codes.discard("GEN-000")  # 성공 코드
        return codes or None
    except Exception:  # noqa: BLE001
        return None


def spec_error_codes(spec: dict) -> set[str]:
    codes: set[str] = set()
    for _path, ops in spec.get("paths", {}).items():
        for method, op in ops.items():
            if method.upper() not in METHODS:
                continue
            for _status, r in (op.get("responses") or {}).items():
                for _ct, v in (r.get("content") or {}).items():
                    for _n, ex in (v.get("examples") or {}).items():
                        code = (ex.get("value") or {}).get("code")
                        if code:
                            codes.add(code)
                codes |= set(re.findall(r"`([A-Z]+-\d{3})`", r.get("description") or ""))
    codes.discard("GEN-000")
    return codes


def fe_error_codes() -> set[str]:
    codes: set[str] = set()
    for rel in ERROR_MAP_FILES:
        src = open(os.path.join(ROOT, rel), encoding="utf-8").read()
        codes |= set(re.findall(r"'([A-Z]+-\d{3})'", src))
    return codes


def has_caller(route: str) -> bool:
    literal = route.split("[")[0].rstrip("/")
    if not literal:
        return True
    res = subprocess.run(
        ["grep", "-rl", "--include=*.ts", "--include=*.tsx", "-F", literal,
         *[os.path.join(ROOT, d) for d in CALLER_DIRS]],
        capture_output=True, text=True,
    )
    for line in res.stdout.splitlines():
        if "/app/api/" not in line:
            return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=os.environ.get("HARUCUT_API", "http://localhost:8080"))
    ap.add_argument("--show-required", action="store_true", help="D. 필수 요청 필드도 출력")
    args = ap.parse_args()

    spec = fetch_spec(args.base_url)
    backend = collect_backend(spec)
    backend_norm = {(m, normalize(p)): p for (m, p) in backend}
    fe_routes = collect_fe_routes()

    print(f"백엔드 {len(backend)}개 경로 · FE 프록시 {len(fe_routes)}개 핸들러\n")

    print("A. FE 프록시 → 백엔드 존재 확인")
    called: set[tuple[str, str]] = set()
    for method, target, route in fe_routes:
        key = (method, normalize(target))
        if key in backend_norm:
            called.add((method, backend_norm[key]))
        else:
            problems.append(f"A: {method} {target} (← {route}) 가 백엔드에 없다")
            print(f"   ✖ {method:<6} {target:<46} ← {route}")
    print(f"   {len(fe_routes) - len([p for p in problems if p.startswith('A:')])}/{len(fe_routes)} OK\n")

    print("B. 호출되지 않는 프록시 라우트")
    dead_routes = []
    for _m, _t, route in fe_routes:
        if route not in dead_routes and not has_caller(route):
            dead_routes.append(route)
    for route in dead_routes:
        warnings.append(f"B: {route} 를 부르는 곳이 없다")
        print(f"   ! {route}")
    print(f"   {'없음' if not dead_routes else str(len(dead_routes)) + '개'}\n")

    print("C. 에러코드 대조")
    jar = jar_error_codes()
    if jar is not None:
        server, source = jar, "실행 중인 jar 의 ErrorCode enum"
    else:
        server, source = spec_error_codes(spec), "스웨거 응답 예시(컨테이너를 못 읽어 낮춘 기준)"
        warnings.append("C: jar 를 못 읽어 스웨거 기준으로 대조했다 — 죽은 항목 판정이 부정확할 수 있다")
    fe = fe_error_codes()
    fe_server = fe - CLIENT_ONLY_CODES
    print(f"   기준: {source}")
    missing = sorted(server - fe_server)
    dead = sorted(fe_server - server)
    for code in missing:
        problems.append(f"C: {code} 를 서버가 내는데 FE 문구가 없다")
        print(f"   ✖ 누락 {code}")
    for code in dead:
        warnings.append(f"C: {code} 는 서버에 없는데 FE 표에 남아 있다")
        print(f"   ! 죽음 {code}")
    print(f"   서버 {len(server)} · FE {len(fe_server)}(+클라 {len(CLIENT_ONLY_CODES)}) "
          f"· 누락 {len(missing)} · 죽음 {len(dead)}\n")

    if args.show_required:
        print("D. FE 가 부르는 엔드포인트의 필수 요청 필드")
        schemas = spec.get("components", {}).get("schemas", {})
        for method, path in sorted(called):
            op = backend[(method, path)]
            body = op.get("requestBody")
            if not body:
                continue
            for _ct, v in body["content"].items():
                s = v["schema"]
                if "$ref" in s:
                    s = schemas.get(s["$ref"].split("/")[-1], {})
                req = s.get("required", [])
                if req:
                    print(f"   {method:<6} {path:<46} {req}")
        print()

    print("=" * 72)
    if problems:
        print(f"실패 {len(problems)}건")
        for p in problems:
            print(f"  ✖ {p}")
    if warnings:
        print(f"경고 {len(warnings)}건")
        for w in warnings:
            print(f"  ! {w}")
    if not problems and not warnings:
        print("계약 일치 ✓")
    elif not problems:
        print("치명적 불일치 없음 ✓ (경고만)")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
