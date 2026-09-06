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
  D. FE 가 **실제로 보내는 본문**에 서버 필수 필드가 다 있는가          (빠지면 실패)

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
# 서버가 아니라 **프론트가 스스로 만드는** 코드. C 대조에서 "서버에 없다" 로 세면 안 된다.
#   CLIENT-001 재발급 자체가 불가능한 상태(clientApi)
#   CLIENT-002 NEXT_PUBLIC_BASE_URL 이 없거나 잘못됨(프록시가 백엔드 주소를 못 만든다)
#   CLIENT-003 백엔드에 닿지 못함(fetch 자체가 던졌다 — 서버는 아무 코드도 못 준다)
CLIENT_ONLY_CODES = {"CLIENT-001", "CLIENT-002", "CLIENT-003"}
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
        # Windows 에서는 os.walk 가 역슬래시를 준다. 이 문자열은 뒤에서 소스 코드의
        # "/api/client/..." 와 **문자 그대로** 비교되므로 항상 POSIX 로 맞춘다.
        # (안 맞추면 B 검사가 전부 "부르는 곳이 없다" 로 오답을 낸다.)
        route = dirpath.replace(os.path.join(ROOT, "apps/web/app"), "").replace(os.sep, "/")
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
    literal = route.replace(os.sep, "/").split("[")[0].rstrip("/")
    if not literal:
        return True
    res = subprocess.run(
        ["grep", "-rl", "--include=*.ts", "--include=*.tsx", "-F", literal,
         *[os.path.join(ROOT, d) for d in CALLER_DIRS]],
        capture_output=True, text=True,
    )
    for line in res.stdout.splitlines():
        # grep 이 돌려주는 경로도 플랫폼에 따라 구분자가 다르다.
        if "/app/api/" not in line.replace(os.sep, "/"):
            return True
    return False


# ──────────────────────────────────────────────────────────────────────────
# D. 필수 요청 필드 대조
#
# 예전에는 스웨거의 required 목록만 찍고 "대조는 사람이 한다" 로 뒀다. 사람이 하는 대조는
# 결국 안 한다 — presign 의 `fileSize` 와 compose 의 `sourceKeys` 가 실제로 그렇게 새어
# 나갔다. 여기서는 기계가 한다.
#
# 방법: 프론트가 부르는 프록시 경로 -> (A 검사가 만든 매핑) 백엔드 경로 -> 스웨거 required.
# 그다음 프론트 소스에서 그 경로로 보내는 **본문 객체의 최상위 키**를 뽑아 비교한다.
# 본문이 객체 리터럴이 아니거나(변수로 넘김) 전개 연산자가 있으면 키를 셀 수 없다 —
# 그건 "확인 못 함" 으로 남겨 사람이 보게 한다. 조용히 통과시키지 않는다.
# ──────────────────────────────────────────────────────────────────────────

# `clientApi.post<ApiEnvelope<Foo>>(` 처럼 제네릭이 **중첩**된다. `<[^>]*>` 는 첫 `>` 에서
# 끊겨 이런 호출을 통째로 놓친다 — 그러면 그 경로는 "못 찾음" 이 되어 조용히 넘어간다.
CALL_RE = re.compile(
    r"""clientApi\.(post|put|patch)\s*(?:<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>)?\s*\(\s*"""
    r"""(?:`([^`]*)`|"([^"]*)"|'([^']*)')""",
    re.S,
)


def _balanced(src: str, start: int):
    depth = 0
    for i in range(start, len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return src[start:i + 1]
    return None


def _top_level_keys(obj: str):
    """객체 리터럴의 최상위 키. 중첩 안쪽은 무시한다."""
    keys = set()
    depth = 0
    buf = []
    for c in obj:
        if c in "{[(":
            depth += 1
            if depth == 1:
                continue
        elif c in "}])":
            depth -= 1
            if depth == 0:
                continue
        if depth == 1:
            buf.append(c)
    inner = "".join(buf)
    depth = 0
    part = []
    parts = []
    for c in inner:
        if c in "{[(":
            depth += 1
        elif c in "}])":
            depth -= 1
        if c == "," and depth == 0:
            parts.append("".join(part))
            part = []
        else:
            part.append(c)
    parts.append("".join(part))
    for raw_part in parts:
        t = raw_part.strip()
        if not t:
            continue
        if t.startswith("..."):
            keys.add("...spread")
            continue
        m = re.match(r"""^["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*(?::|$)""", t)
        if m:
            keys.add(m.group(1))
    return keys


def collect_fe_payloads():
    """(메서드, 프록시경로) -> 최상위 키 집합. 못 읽으면 None."""
    out = {}
    for d in CALLER_DIRS:
        base = os.path.join(ROOT, d)
        for dirpath, _dirs, files in os.walk(base):
            norm_dir = dirpath.replace(os.sep, "/")
            if "/node_modules" in norm_dir or "/.next" in norm_dir:
                continue
            for f in files:
                if not f.endswith((".ts", ".tsx")) or ".test." in f:
                    continue
                src = open(os.path.join(dirpath, f), encoding="utf-8", errors="ignore").read()
                for m in CALL_RE.finditer(src):
                    method = m.group(1).upper()
                    path = (m.group(2) or m.group(3) or m.group(4) or "").split("?")[0]
                    if not path.startswith("/api/"):
                        continue
                    path = re.sub(r"\$\{[^}]*\}", "{}", path).rstrip("/")
                    key = (method, path)
                    rest = src[m.end():]
                    comma = rest.find(",")
                    close = rest.find(")")
                    if comma == -1 or (close != -1 and close < comma):
                        out[key] = set()          # 본문 없이 보낸다
                        continue
                    after = rest[comma + 1:]
                    if after.lstrip().startswith("{"):
                        obj = _balanced(after, after.index("{"))
                        out[key] = _top_level_keys(obj) if obj else None
                        continue
                    ident = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,)]", after)
                    if ident:
                        out[key] = _keys_from_identifier(src, ident.group(1))
                    else:
                        out[key] = None
    return out


def _type_body(src: str, name: str):
    """`type Name = { ... }` 또는 `interface Name { ... }` 의 본문."""
    m = re.search(r"(?:type\s+" + re.escape(name) + r"\s*=\s*|interface\s+" + re.escape(name) + r"\s*)\{", src)
    if not m:
        return None
    return _balanced(src, src.index("{", m.end() - 1))


def _required_keys_of_type(body: str):
    """타입 본문의 **필수** 최상위 키(`?` 가 붙은 건 뺀다)."""
    keys = set()
    depth = 0
    line = []
    lines = []
    for c in body[1:-1]:
        if c in "{[(":
            depth += 1
        elif c in "}])":
            depth -= 1
        if c in ";\n" and depth == 0:
            lines.append("".join(line))
            line = []
        else:
            line.append(c)
    lines.append("".join(line))
    for raw_line in lines:
        t = raw_line.strip()
        if not t or t.startswith("//") or t.startswith("*") or t.startswith("/*"):
            continue
        m = re.match(r"^(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)(\??)\s*:", t)
        if m and not m.group(2):
            keys.add(m.group(1))
    return keys


def _keys_from_identifier(src: str, ident: str):
    """식별자로 넘긴 본문의 키를 찾는다. 못 찾으면 None(사람이 본다)."""
    # (a) 같은 파일의 지역 변수: const ident = { ... }
    m = re.search(r"\bconst\s+" + re.escape(ident) + r"\s*(?::[^=]+)?=\s*\{", src)
    if m:
        obj = _balanced(src, src.index("{", m.end() - 1))
        if obj:
            return _top_level_keys(obj)
    # (b) 함수 파라미터의 타입 주석: (ident: SomeType) / (ident: { ... })
    m = re.search(re.escape(ident) + r"\s*:\s*\{", src)
    if m:
        obj = _balanced(src, src.index("{", m.end() - 1))
        if obj:
            return _required_keys_of_type(obj)
    m = re.search(re.escape(ident) + r"\s*:\s*([A-Za-z_][A-Za-z0-9_]*)", src)
    if m:
        name = m.group(1)
        body = _type_body(src, name)
        if body:
            return _required_keys_of_type(body)
        # 타입이 다른 파일에 있을 수 있다(api-types.ts 등). 저장소에서 한 번 더 찾는다.
        for d in CALLER_DIRS:
            for dirpath, _dirs, files in os.walk(os.path.join(ROOT, d)):
                nd = dirpath.replace(os.sep, "/")
                if "/node_modules" in nd or "/.next" in nd:
                    continue
                for f in files:
                    if not f.endswith((".ts", ".tsx")):
                        continue
                    other = open(os.path.join(dirpath, f), encoding="utf-8", errors="ignore").read()
                    body = _type_body(other, name)
                    if body:
                        return _required_keys_of_type(body)
    return None


def required_by_endpoint(spec, backend):
    schemas = spec.get("components", {}).get("schemas", {})
    out = {}
    for (method, path), op in backend.items():
        body = op.get("requestBody")
        if not body:
            continue
        for _ct, v in body.get("content", {}).items():
            sch = v.get("schema", {})
            if "$ref" in sch:
                sch = schemas.get(sch["$ref"].split("/")[-1], {})
            req = sch.get("required", [])
            if req:
                out[(method, path)] = req
    return out


def check_required_fields(spec, backend, fe_routes, backend_norm):
    need = required_by_endpoint(spec, backend)
    payloads = collect_fe_payloads()
    fails, unknown = [], []
    for method, target, route in fe_routes:
        real = backend_norm.get((method, normalize(target)))
        if not real:
            continue
        want = need.get((method, real))
        if not want:
            continue
        # 라우트 폴더는 `[frameId]`, 호출부는 `${frameId}` -> `{}` 다. 같은 표기로 맞춘다.
        key = (method, re.sub(r"\[[^\]]*\]", "{}", route.rstrip("/")))
        label = f"{method:<6} {route} -> {real}"
        if key not in payloads:
            unknown.append(f"{label}  필수 {want} · 프론트에서 이 경로를 부르는 곳을 못 찾음")
            continue
        sent = payloads[key]
        if sent is None:
            unknown.append(f"{label}  필수 {want} · 본문의 타입을 따라가지 못함")
            continue
        if "...spread" in sent:
            unknown.append(f"{label}  필수 {want} · 전개 연산자라 키를 못 셈")
            continue
        missing = [k for k in want if k not in sent]
        if missing:
            fails.append(f"{label}  빠진 필수 필드 {missing} (보내는 것: {sorted(sent)})")
    return fails, unknown


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=os.environ.get("HARUCUT_API", "http://localhost:8080"))
    ap.add_argument(
        "--show-required",
        action="store_true",
        help="D. 필수 요청 필드를 출력한다(검사가 아니라 참고용 목록이다)",
    )
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

    # ⚠️ D 는 **검사가 아니다.** 스웨거가 필수라고 적은 필드를 보여 줄 뿐,
    # 프론트가 실제로 그 값을 싣는지는 보지 않는다(요청 본문은 프록시가 아니라
    # apps/web/lib 에서 동적으로 만들어져 정적으로 읽기 어렵다). 빠뜨린 필드가 있어도
    # 여기서는 안 걸린다 — 대조는 사람이 한다.
    #
    # 이 한 줄은 --show-required 없이도 **항상** 찍는다. 예전에는 이 한계를 독스트링·--help·
    # 소스 주석·문서에만 적어 뒀는데, 그것들은 기본 `pnpm check:contract` 를 돌린 사람의
    # 화면에 하나도 나오지 않는다. 그래서 필수 필드를 빠뜨린 채로도 화면에는 "계약 일치 ✓"
    # 만 남았다. 한계는 판정이 나오는 그 화면에 적혀 있어야 읽힌다.
    print("D. 필수 요청 필드 대조")
    d_fails, d_unknown = check_required_fields(spec, backend, fe_routes, backend_norm)
    if d_fails:
        for f in d_fails:
            problems.append(f"D: {f}")
        print(f"   빠진 필수 필드 {len(d_fails)}건")
        for f in d_fails:
            print(f"   ✗ {f}")
    else:
        print("   빠진 필수 필드 없음")
    for u in d_unknown:
        warnings.append(f"D: {u}")
    if d_unknown:
        print(f"   본문을 못 읽은 곳 {len(d_unknown)}건 — 사람이 확인한다")
        for u in d_unknown:
            print(f"   ! {u}")
    if args.show_required:
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
    elif not d_unknown and not d_fails:
        print("   (스웨거 required 목록 전체는 --show-required)")
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
    # 판정 문구는 검사한 범위만큼만 말한다. 그냥 "계약 일치 ✓" 라고 쓰면
    # 본 적 없는 필수 요청 필드까지 맞춘 것처럼 읽힌다.
    if not problems and not warnings:
        print("A·B·C·D 일치 ✓")
    elif not problems:
        print("A·B·C·D 치명적 불일치 없음 ✓ (경고만)")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
