#!/usr/bin/env python3
"""check_backend_contract.py 의 판정 문구가 검사 범위를 넘겨 말하지 않는지 본다.

왜 있나 — 이 스크립트는 필수 요청 필드를 **검사하지 않는다**. 그런데 그 한계가 독스트링·
--help·소스 주석·문서에만 적혀 있던 동안, 기본 `pnpm check:contract` 를 돌린 화면에는
"계약 일치 ✓" 한 줄만 남았다. 필수 필드를 빠뜨린 채로도 통과처럼 읽혔다.
그래서 여기서 보는 것은 **판정이 나오는 화면에 한계가 같이 찍히는가** 하나다.

레포에 pytest 가 없고 scripts/ 에도 테스트 하네스가 없어서, 표준 라이브러리만 쓰고
직접 돌리는 형태로 둔다:

    python3 scripts/check_backend_contract_test.py

백엔드도 도커도 필요 없다 — 스펙·에러코드·라우트 수집을 전부 가짜로 갈아 끼운다.
"""
from __future__ import annotations

import contextlib
import importlib.util
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, "check_backend_contract.py")

_spec = importlib.util.spec_from_file_location("check_backend_contract", TARGET)
cbc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cbc)

COMPOSE = "/api/auth/user/media/compose"
FAKE_SPEC = {
    "paths": {
        COMPOSE: {
            "post": {
                "responses": {"200": {"description": "ok"}},
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/ComposeRequest"}
                        }
                    }
                },
            }
        }
    },
    "components": {
        "schemas": {
            "ComposeRequest": {
                "type": "object",
                # 프론트가 이 중 하나를 안 실어도 스크립트는 못 잡는다 — 그게 이 검사의 한계다.
                "required": ["frameId", "sourceKeys", "layers"],
            }
        }
    },
}


def run(argv: list[str], spec: dict = FAKE_SPEC, called: bool = True) -> tuple[int, str]:
    """실제 main() 을 돌리되 백엔드·도커·파일 스캔은 전부 가짜로 채운다."""
    cbc.problems.clear()
    cbc.warnings.clear()
    cbc.fetch_spec = lambda _base_url: spec
    cbc.collect_fe_routes = lambda: [("POST", COMPOSE, "/api/client/user/media/compose")]
    cbc.has_caller = lambda _route: called
    # C 를 깨끗하게 통과시켜 A·B·C 가 전부 OK 인 상태를 만든다.
    cbc.jar_error_codes = lambda: {"GEN-001"}
    cbc.fe_error_codes = lambda: {"GEN-001"} | cbc.CLIENT_ONLY_CODES

    sys.argv = ["check_backend_contract.py", *argv]
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = cbc.main()
    return code, buf.getvalue()


def last_line(out: str) -> str:
    return [l for l in out.splitlines() if l.strip()][-1]


def test_default_run_prints_the_limit_without_show_required() -> None:
    """--show-required 없이 돌려도 D 의 한계가 화면에 찍힌다."""
    code, out = run([])
    assert code == 0, out
    assert "D. 필수 요청 필드" in out, out
    assert "검사하지 않는다" in out, out


def test_verdict_does_not_claim_more_than_it_checked() -> None:
    """통과 문구가 A·B·C 범위를 밝힌다. 맨 마지막 줄이 곧 사람이 읽는 판정이다."""
    _code, out = run([])
    tail = last_line(out)
    assert tail != "계약 일치 ✓", tail
    assert tail.startswith("A·B·C 일치 ✓"), tail
    assert "필수 요청 필드는 검사 대상 아님" in tail, tail


def test_warning_verdict_is_scoped_too() -> None:
    """경고만 있는 경로(아무도 안 부르는 프록시)도 같은 범위 표시를 단다."""
    code, out = run([], called=False)
    tail = last_line(out)
    assert code == 0, out
    assert tail.startswith("A·B·C 치명적 불일치 없음 ✓"), tail
    assert "필수 요청 필드는 검사 대상 아님" in tail, tail


def test_show_required_still_prints_the_list() -> None:
    """참고 목록 자체는 그대로 나온다 — 한계를 적었다고 목록을 없앤 게 아니다."""
    _code, out = run(["--show-required"])
    assert "frameId" in out and "sourceKeys" in out and "layers" in out, out


def test_missing_backend_path_still_fails() -> None:
    """D 안내를 붙였다고 A 실패 판정이 무뎌지지 않는다."""
    code, out = run([], spec={"paths": {}, "components": {"schemas": {}}})
    assert code == 1, out
    assert "가 백엔드에 없다" in out, out
    assert "D. 필수 요청 필드" in out, out  # 실패한 실행에도 한계는 찍힌다


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"  ✓ {t.__name__}")
    print(f"{len(tests)}개 통과")
