from __future__ import annotations

import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import httpx
import yaml

ROOT = Path(__file__).resolve().parents[1]
RALPH_LOOP_FILE = ROOT / '.ralph-loop.yml'
DEFAULT_ENV_FILE = ROOT / 'omx_discord_bridge' / '.env.discord'
REQUIRED_KEYS = (
    'DISCORD_GUILD_ID',
    'DISCORD_PARENT_CHANNEL_ID',
    'DISCORD_WEBHOOK_URL',
    'ALLOWED_DISCORD_USER_IDS',
    'DISCORD_BOT_TOKEN',
)
DISCORD_API_BASE = 'https://discord.com/api/v10'
CONVERSATION_LOG = ROOT / '.omx' / 'state' / 'TEAM_CONVERSATION.jsonl'
DISCORD_INBOX_LOG = ROOT / '.omx' / 'state' / 'DISCORD_INBOX.jsonl'
DISCORD_INBOX_SUMMARY = ROOT / '.omx' / 'state' / 'DISCORD_INBOX.md'
DISCORD_REPLY_STATE = ROOT / '.omx' / 'state' / 'DISCORD_REPLY_STATE.json'
BRIDGE_RUNTIME_STATUS = ROOT / '.omx' / 'runtime' / 'discord-bridge-status.json'
LOOP_RUNTIME_STATUS = ROOT / '.omx' / 'runtime' / 'omx-loop-status.json'
WATCHER_STATE = ROOT / '.omx' / 'state' / 'DISCORD_WATCHER_STATE.json'
RALPH_CONTROL_STATE = ROOT / '.omx' / 'state' / 'RALPH_CONTROL_STATE.json'
OMX_LOOP_STATE = ROOT / '.omx' / 'state' / 'OMX_LOOP_STATE.json'
RALPH_PROGRESS_FILE = ROOT / '.ralph' / 'progress.md'
CONTROL_CHAR_RE = re.compile(r'[\x00-\x08\x0B\x0C\x0E-\x1F]')
RAW_UNICODE_ESCAPE_RE = re.compile(r'\\u[0-9a-fA-F]{4}')
DOUBLE_QUESTION_RE = re.compile(r'\?\?')
MAX_TRACKED_ACK_IDS = 400
HANGUL_RE = re.compile(r'[가-힣]')


def ensure_state_dirs() -> None:
    (ROOT / '.omx' / 'state').mkdir(parents=True, exist_ok=True)
    (ROOT / '.omx' / 'runtime').mkdir(parents=True, exist_ok=True)


def load_ralph_loop_config() -> dict[str, Any]:
    if not RALPH_LOOP_FILE.exists():
        return {}
    try:
        payload = yaml.safe_load(RALPH_LOOP_FILE.read_text(encoding='utf-8'))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def resolve_bridge_host_port() -> tuple[str, int]:
    config = load_ralph_loop_config()
    runtime_cfg = config.get('runtime', {}) if isinstance(config.get('runtime'), dict) else {}

    host = str(runtime_cfg.get('bridge_host', '127.0.0.1') or '127.0.0.1').strip() or '127.0.0.1'
    try:
        port = int(runtime_cfg.get('bridge_port', 8787) or 8787)
    except (TypeError, ValueError):
        port = 8787

    env_host = os.getenv('DISCORD_BRIDGE_HOST', '').strip()
    env_port = os.getenv('DISCORD_BRIDGE_PORT', '').strip()
    if env_host:
        host = env_host
    if env_port:
        try:
            port = int(env_port)
        except ValueError:
            port = 8787
    return host, max(port, 1)


def sanitize_text(value: str) -> str:
    text = value.replace('\r\n', '\n').replace('\r', '\n')
    text = CONTROL_CHAR_RE.sub('', text).strip()
    question_count = text.count('?')
    if question_count >= 3 and not HANGUL_RE.search(text):
        ascii_letters = sum(1 for ch in text if ch.isascii() and ch.isalpha())
        if ascii_letters < 8:
            return '[인코딩 손상으로 원문을 보존하지 못함]'
    text = DOUBLE_QUESTION_RE.sub('?', text)
    text = RAW_UNICODE_ESCAPE_RE.sub('[유니코드 이스케이프 제거]', text)
    return text


def sanitize_value(value: Any) -> Any:
    if isinstance(value, str):
        return sanitize_text(value)
    if isinstance(value, list):
        return [sanitize_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): sanitize_value(item) for key, item in value.items()}
    return value


def write_runtime_status(*, status: str, detail: str = '', imported: int = 0, responded: int = 0) -> None:
    BRIDGE_RUNTIME_STATUS.write_text(
        json.dumps(
            {
                'status': status,
                'detail': detail,
                'imported': imported,
                'responded': responded,
                'updated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            },
            ensure_ascii=False,
            indent=2,
        )
        + '\n',
        encoding='utf-8',
    )


def load_env_values(env_path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not env_path.exists():
        return values
    for line in env_path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip()
    return values


def load_env_keys(env_path: Path) -> dict[str, bool]:
    values = load_env_values(env_path)
    return {key: bool(values.get(key)) for key in REQUIRED_KEYS}


def parse_allowed_user_ids(raw: str) -> set[str]:
    return {item.strip() for item in raw.split(',') if item.strip()}


def normalize_discord_mode(value: str) -> str:
    normalized = value.strip().lower()
    if normalized in {'all', 'signal-only', 'local-only'}:
        return normalized
    return 'all'


def resolve_discord_mode(env_values: dict[str, str]) -> str:
    explicit = os.getenv('OMX_DISCORD_MODE', '').strip()
    from_file = str(env_values.get('OMX_DISCORD_MODE', '')).strip()
    return normalize_discord_mode(explicit or from_file or 'all')


def build_webhook_url(webhook_url: str, thread_id: str | None) -> str:
    if not thread_id:
        return webhook_url
    parsed = urlparse(webhook_url)
    query = parse_qs(parsed.query)
    query['thread_id'] = [thread_id]
    return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(sanitize_value(payload), ensure_ascii=False) + '\n')


CONVERSATION_RESERVED_KEYS = {
    'source',
    'role',
    'content',
    'thread_id',
    'meeting_id',
    'phase',
    'trigger_id',
    'created_at',
}


def build_conversation_entry(
    *,
    source: str,
    role: str,
    content: str,
    thread_id: str | None,
    meeting_id: str,
    phase: str,
    trigger_id: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        'source': source,
        'role': role,
        'content': content,
        'thread_id': thread_id or '',
        'meeting_id': meeting_id,
        'phase': phase,
        'trigger_id': trigger_id,
        'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }
    if isinstance(metadata, dict):
        for key, value in sanitize_value(metadata).items():
            normalized_key = str(key).strip()
            if not normalized_key or normalized_key in CONVERSATION_RESERVED_KEYS:
                continue
            entry[normalized_key] = value
    return entry


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if not path.exists():
        return items
    for raw in path.read_text(encoding='utf-8').splitlines():
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


def rewrite_jsonl(path: Path, items: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as handle:
        for item in items:
            handle.write(json.dumps(sanitize_value(item), ensure_ascii=False) + '\n')


def repair_state_logs() -> None:
    for path in (DISCORD_INBOX_LOG, CONVERSATION_LOG):
        if not path.exists():
            continue
        rewrite_jsonl(path, [sanitize_value(item) for item in load_jsonl(path)])


def write_inbox_summary(imported: list[dict[str, Any]]) -> None:
    lines = ['# Discord Inbox', '']
    if not imported:
        lines.append('- 새로 들어온 Discord 메시지 없음')
    else:
        for item in imported[-20:]:
            author = item.get('author', 'unknown')
            content = item.get('content', '').strip() or '[빈 메시지]'
            lines.append(f'- {author}: {content}')
    DISCORD_INBOX_SUMMARY.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def load_reply_state() -> dict[str, str]:
    if not DISCORD_REPLY_STATE.exists():
        return {'last_message_id': ''}
    try:
        return json.loads(DISCORD_REPLY_STATE.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return {'last_message_id': ''}


def save_reply_state(last_message_id: str) -> None:
    DISCORD_REPLY_STATE.write_text(
        json.dumps({'last_message_id': last_message_id}, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )


def load_watcher_state() -> dict[str, Any]:
    if not WATCHER_STATE.exists():
        return {'acked_message_ids': []}
    try:
        payload = json.loads(WATCHER_STATE.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return {'acked_message_ids': []}
    if not isinstance(payload, dict):
        return {'acked_message_ids': []}
    acked = payload.get('acked_message_ids', [])
    if not isinstance(acked, list):
        acked = []
    payload['acked_message_ids'] = [str(item).strip() for item in acked if str(item).strip()]
    return payload


def save_watcher_state(payload: dict[str, Any]) -> None:
    acked = payload.get('acked_message_ids', [])
    if isinstance(acked, list):
        payload['acked_message_ids'] = [str(item).strip() for item in acked if str(item).strip()][-MAX_TRACKED_ACK_IDS:]
    WATCHER_STATE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def load_control_state() -> dict[str, Any]:
    if not RALPH_CONTROL_STATE.exists():
        return {'command': '', 'nudge': '', 'goal_override': '', 'done_overrides': []}
    try:
        payload = json.loads(RALPH_CONTROL_STATE.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return {'command': '', 'nudge': '', 'goal_override': '', 'done_overrides': []}
    if not isinstance(payload, dict):
        return {'command': '', 'nudge': '', 'goal_override': '', 'done_overrides': []}
    if not isinstance(payload.get('done_overrides'), list):
        payload['done_overrides'] = []
    return payload


def save_control_state(payload: dict[str, Any]) -> None:
    RALPH_CONTROL_STATE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def load_loop_runtime_status() -> dict[str, Any]:
    if not LOOP_RUNTIME_STATUS.exists():
        return {}
    try:
        payload = json.loads(LOOP_RUNTIME_STATUS.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def load_loop_state() -> dict[str, Any]:
    if not OMX_LOOP_STATE.exists():
        return {}
    try:
        payload = json.loads(OMX_LOOP_STATE.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def parse_ralph_command(content: str) -> dict[str, str] | None:
    normalized = sanitize_text(content).strip()
    if not normalized.lower().startswith('/ralph'):
        return None
    rest = normalized[len('/ralph') :].strip()
    if not rest:
        return {'action': 'status', 'value': ''}
    parts = rest.split(maxsplit=1)
    action = parts[0].strip().lower()
    value = parts[1].strip() if len(parts) > 1 else ''
    return {'action': action, 'value': value}


def build_status_reply() -> str:
    runtime = load_loop_runtime_status()
    loop_state = load_loop_state()
    control = load_control_state()
    github_flow = loop_state.get('github_flow', {}) if isinstance(loop_state.get('github_flow'), dict) else {}
    branch = str(github_flow.get('branch', '')).strip() or 'unknown'
    pr_url = str(github_flow.get('pr_url', '')).strip() or '-'
    return '\n'.join(
        [
            f"[ralph:{ROOT.name}] status",
            f"- runtime: {runtime.get('status', 'unknown')}",
            f"- detail: {runtime.get('detail', '') or '-'}",
            f"- role: {runtime.get('role', '') or '-'}",
            f"- branch: {branch}",
            f"- pr: {pr_url}",
            f"- control: {control.get('command', '') or 'running'}",
        ]
    )


def build_logs_reply() -> str:
    if RALPH_PROGRESS_FILE.exists():
        text = RALPH_PROGRESS_FILE.read_text(encoding='utf-8').strip()
        lines = text.splitlines()
        if len(lines) > 18:
            lines = lines[-18:]
        return '\n'.join(lines)
    runtime = load_loop_runtime_status()
    return '\n'.join(
        [
            f"[ralph:{ROOT.name}] logs",
            f"- runtime: {runtime.get('status', 'unknown')}",
            f"- detail: {runtime.get('detail', '') or '-'}",
        ]
    )


def build_pr_reply() -> str:
    github_flow = load_loop_state().get('github_flow', {})
    if not isinstance(github_flow, dict):
        github_flow = {}
    pr_url = str(github_flow.get('pr_url', '')).strip()
    release_pr_url = str(github_flow.get('release_pr_url', '')).strip()
    if pr_url:
        return f"[ralph:{ROOT.name}] current PR\n- {pr_url}"
    if release_pr_url:
        return f"[ralph:{ROOT.name}] current release PR\n- {release_pr_url}"
    return f"[ralph:{ROOT.name}] 아직 열린 PR이 없습니다."


def handle_ralph_control_command(command: dict[str, str], payload: dict[str, Any], env_values: dict[str, str]) -> bool:
    action = str(command.get('action', '')).strip().lower()
    value = str(command.get('value', '')).strip()
    control = load_control_state()
    message_id = str(payload.get('message_id', '')).strip()
    response = ''

    if action == 'status':
        response = build_status_reply()
    elif action == 'logs':
        response = build_logs_reply()
    elif action == 'pr':
        response = build_pr_reply()
    elif action == 'pause':
        control['command'] = 'pause'
        response = f"[ralph:{ROOT.name}] pause 설정됨"
    elif action == 'resume':
        control['command'] = 'resume'
        response = f"[ralph:{ROOT.name}] resume 설정됨"
    elif action == 'stop':
        control['command'] = 'stop'
        response = f"[ralph:{ROOT.name}] stop 설정됨"
    elif action == 'nudge':
        control['nudge'] = value
        response = f"[ralph:{ROOT.name}] nudge 반영: {value or '(empty)'}"
    elif action == 'goal':
        control['goal_override'] = value
        response = f"[ralph:{ROOT.name}] goal override 반영"
    elif action == 'done':
        done_overrides = control.get('done_overrides', [])
        if not isinstance(done_overrides, list):
            done_overrides = []
        if value and value not in done_overrides:
            done_overrides.append(value)
        control['done_overrides'] = done_overrides
        response = f"[ralph:{ROOT.name}] done 조건 추가됨"
    else:
        response = "[ralph] 지원하지 않는 명령입니다. status, pause, resume, stop, nudge, goal, done, logs, pr 중 하나를 사용하세요."

    control['updated_at'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    control['message_id'] = message_id
    save_control_state(control)

    append_jsonl(
        CONVERSATION_LOG,
        build_conversation_entry(
            source='discord_control',
            role='user',
            content=str(payload.get('content', '')).strip(),
            thread_id=str(payload.get('thread_id', '')).strip() or None,
            meeting_id=f'control-{message_id or "manual"}',
            phase=f'control_{action or "unknown"}',
            trigger_id=f'control-{message_id or "manual"}',
            metadata={'author': payload.get('author', 'unknown')},
        ),
    )

    if response and resolve_discord_mode(env_values) != 'local-only':
        webhook_url = env_values.get('DISCORD_WEBHOOK_URL', '').strip()
        if webhook_url:
            send_discord_message(
                webhook_url=webhook_url,
                content=response,
                username='coordinator',
                thread_id=str(payload.get('thread_id', '')).strip() or None,
                source='discord_control',
                meeting_id=f'control-{message_id or "manual"}',
                phase=f'control_{action or "unknown"}',
                trigger_id=f'control-{message_id or "manual"}',
            )
    return True


def send_discord_message(
    *,
    webhook_url: str,
    content: str,
    username: str,
    thread_id: str | None = None,
    source: str = 'agent',
    meeting_id: str = '',
    phase: str = '',
    trigger_id: str = '',
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    content = sanitize_text(content)
    username = sanitize_text(username)
    target_url = build_webhook_url(webhook_url, thread_id)
    payload = {
        'content': content,
        'username': username,
        'allowed_mentions': {'parse': []},
    }
    response = httpx.post(target_url, json=payload, timeout=15.0)
    response.raise_for_status()
    append_jsonl(
        CONVERSATION_LOG,
        build_conversation_entry(
            source=source,
            role=username,
            content=content,
            thread_id=thread_id,
            meeting_id=meeting_id,
            phase=phase,
            trigger_id=trigger_id,
            metadata=metadata,
        ),
    )
    write_runtime_status(status='event_sent', detail=f'{username} -> discord', responded=1)
    return {'ok': True, 'status_code': response.status_code}


def build_watcher_ack_message(latest: dict[str, Any], superseded_count: int, runtime_status: dict[str, Any]) -> str:
    status = str(runtime_status.get('status', '')).strip()
    role = str(runtime_status.get('role', '')).strip()
    if status == 'role_running':
        opener = '읽었습니다. 지금 진행 중인 역할 단계를 짧게 마무리한 뒤 이 메시지를 최우선으로 이어서 보겠습니다.'
    elif status == 'running':
        opener = '읽었습니다. 현재 루프를 확인했고 이 메시지를 최우선으로 회의에 올리겠습니다.'
    else:
        opener = '읽었습니다. 이 메시지를 최우선으로 회의에 올리겠습니다.'

    details: list[str] = []
    if role and status == 'role_running' and role not in {'coordinator', 'scribe', 'watchdog'}:
        details.append(f'현재는 {role} 단계까지 진행된 상태입니다.')
    if superseded_count > 0:
        details.append(f'바로 앞의 미처리 메시지 {superseded_count}건은 최신 메시지 기준으로 함께 정리하겠습니다.')
    return ' '.join([opener, *details]).strip()


def maybe_send_import_ack(imported: list[dict[str, Any]], env_values: dict[str, str]) -> int:
    if not imported:
        return 0
    if resolve_discord_mode(env_values) == 'local-only':
        return 0
    webhook_url = env_values.get('DISCORD_WEBHOOK_URL', '').strip()
    if not webhook_url:
        return 0

    latest = imported[-1]
    message_id = str(latest.get('message_id', '')).strip()
    if not message_id:
        return 0

    watcher_state = load_watcher_state()
    acked = set(watcher_state.get('acked_message_ids', []))
    if message_id in acked:
        return 0

    send_discord_message(
        webhook_url=webhook_url,
        content=build_watcher_ack_message(latest, max(len(imported) - 1, 0), load_loop_runtime_status()),
        username='coordinator',
        thread_id=str(latest.get('thread_id', '')).strip() or None,
        source='watcher_ack',
        meeting_id=f'watcher-{message_id}',
        phase='watcher_ack',
        trigger_id=f'discord-{message_id}',
    )
    watcher_state.setdefault('acked_message_ids', [])
    watcher_state['acked_message_ids'].append(message_id)
    save_watcher_state(watcher_state)
    return 1


def fetch_channel_messages(*, channel_id: str, bot_token: str, after: str | None = None, limit: int = 25) -> list[dict[str, Any]]:
    params: dict[str, Any] = {'limit': min(max(limit, 1), 100)}
    if after:
        params['after'] = after
    response = httpx.get(
        f'{DISCORD_API_BASE}/channels/{channel_id}/messages',
        headers={'Authorization': f'Bot {bot_token}'},
        params=params,
        timeout=15.0,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        return []
    return list(reversed(payload))


def import_discord_replies(*, env_values: dict[str, str]) -> dict[str, Any]:
    channel_id = env_values.get('DISCORD_PARENT_CHANNEL_ID', '').strip()
    bot_token = env_values.get('DISCORD_BOT_TOKEN', '').strip()
    allowed_user_ids = parse_allowed_user_ids(env_values.get('ALLOWED_DISCORD_USER_IDS', ''))
    if not channel_id or not bot_token:
        return {'ok': False, 'imported': 0, 'detail': 'DISCORD_PARENT_CHANNEL_ID 또는 DISCORD_BOT_TOKEN 누락'}

    state = load_reply_state()
    messages = fetch_channel_messages(
        channel_id=channel_id,
        bot_token=bot_token,
        after=state.get('last_message_id') or None,
    )
    imported: list[dict[str, Any]] = []
    last_seen = state.get('last_message_id', '')
    for message in messages:
        author = message.get('author') or {}
        author_id = str(author.get('id', '')).strip()
        if allowed_user_ids and author_id not in allowed_user_ids:
            continue
        if author.get('bot'):
            continue
        payload = {
            'source': 'discord_user',
            'message_id': str(message.get('id', '')).strip(),
            'author_id': author_id,
            'author': sanitize_text(str(author.get('username', 'unknown'))),
            'content': sanitize_text(str(message.get('content', '')).strip()),
            'channel_id': channel_id,
            'thread_id': '',
            'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        }
        if not payload['message_id'] or not payload['content']:
            continue
        control_command = parse_ralph_command(payload['content'])
        if control_command is not None:
            handle_ralph_control_command(control_command, payload, env_values)
            last_seen = payload['message_id'] or last_seen
            continue
        append_jsonl(DISCORD_INBOX_LOG, payload)
        append_jsonl(CONVERSATION_LOG, payload)
        imported.append(payload)
        last_seen = payload['message_id'] or last_seen

    if last_seen:
        save_reply_state(last_seen)
    write_inbox_summary(imported)
    acked = 0
    if imported:
        try:
            acked = maybe_send_import_ack(imported, env_values)
        except Exception as exc:
            write_runtime_status(status='watcher_ack_error', detail=str(exc), imported=len(imported))
    detail = 'reply sync complete'
    if acked:
        detail = f'{detail}; watcher ack sent'
    write_runtime_status(status='reply_sync_ok', detail=detail, imported=len(imported), responded=acked)
    return {'ok': True, 'imported': len(imported), 'responded': acked, 'detail': detail}


def start_reply_poller(env_path: Path) -> threading.Thread:
    interval = int(os.getenv('DISCORD_POLL_INTERVAL_SECONDS', '10'))

    def loop() -> None:
        while True:
            try:
                env_values = load_env_values(env_path)
                if env_values:
                    import_discord_replies(env_values=env_values)
            except Exception as exc:
                write_runtime_status(status='poll_error', detail=str(exc))
            time.sleep(max(interval, 5))

    thread = threading.Thread(target=loop, daemon=True, name='discord-reply-poller')
    thread.start()
    return thread


class BridgeHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path != '/health':
            self.send_response(404)
            self.end_headers()
            return
        payload = {
            'ok': True,
            'bridge': 'discord-omx-bridge',
            'runtime': json.loads(BRIDGE_RUNTIME_STATUS.read_text(encoding='utf-8')) if BRIDGE_RUNTIME_STATUS.exists() else {},
        }
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in {'/event', '/sync-replies'}:
            self.send_response(404)
            self.end_headers()
            return

        bridge_env_file = Path(os.getenv('DISCORD_ENV_FILE', str(DEFAULT_ENV_FILE)))
        env_values = load_env_values(bridge_env_file)
        if self.path == '/sync-replies':
            try:
                result = import_discord_replies(env_values=env_values)
                self.send_response(200 if result.get('ok') else 503)
            except Exception as exc:
                result = {'ok': False, 'detail': str(exc)}
                write_runtime_status(status='sync_error', detail=str(exc))
                self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
            return

        length = int(self.headers.get('Content-Length', '0'))
        raw_body = self.rfile.read(length).decode('utf-8') if length else '{}'
        payload = json.loads(raw_body or '{}')
        webhook_url = env_values.get('DISCORD_WEBHOOK_URL', '')
        if not webhook_url:
            self.send_response(503)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': False, 'detail': 'DISCORD_WEBHOOK_URL missing'}).encode('utf-8'))
            return

        content = str(payload.get('content', '')).strip()
        username = str(payload.get('username', 'executor')).strip() or 'executor'
        raw_thread_id = payload.get('thread_id', '')
        thread_id_text = '' if raw_thread_id is None else str(raw_thread_id).strip()
        thread_id = None if thread_id_text.lower() in {'', 'none', 'null'} else thread_id_text
        meeting_id = str(payload.get('meeting_id', '')).strip()
        phase = str(payload.get('phase', '')).strip()
        trigger_id = str(payload.get('trigger_id', '')).strip()
        source = str(payload.get('source', 'agent')).strip() or 'agent'
        metadata = payload.get('metadata')
        if not content:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': False, 'detail': 'content required'}).encode('utf-8'))
            return

        try:
            result = send_discord_message(
                webhook_url=webhook_url,
                content=content,
                username=username,
                thread_id=thread_id,
                source=source,
                meeting_id=meeting_id,
                phase=phase,
                trigger_id=trigger_id,
                metadata=metadata if isinstance(metadata, dict) else None,
            )
        except Exception as exc:
            write_runtime_status(status='event_error', detail=str(exc))
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': False, 'detail': str(exc)}).encode('utf-8'))
            return

        self.send_response(202)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode('utf-8'))

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return


def main() -> int:
    ensure_state_dirs()
    repair_state_logs()
    env_path = Path(os.getenv('DISCORD_ENV_FILE', str(DEFAULT_ENV_FILE)))
    key_status = load_env_keys(env_path)
    host, port = resolve_bridge_host_port()
    write_runtime_status(status='starting', detail='bridge boot')
    print(json.dumps({'env_file_exists': env_path.exists(), 'keys': key_status}, ensure_ascii=False))
    if env_path.exists():
        start_reply_poller(env_path)
    server = HTTPServer((host, port), BridgeHandler)
    write_runtime_status(status='listening', detail=f'{host}:{port}')
    server.serve_forever()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
