"""Local AI chat dashboard. Arbitrary shell execution intentionally disabled."""
import os
import platform
import threading
from pathlib import Path
from collections import deque
from datetime import datetime, timezone
import requests
from flask import Flask, jsonify, render_template, request
import config

app = Flask(__name__)
app.secret_key = config.SECRET_KEY
sessions = {}
lock = threading.Lock()

def stamp():
    return datetime.now(timezone.utc).isoformat()

def messages(sid):
    with lock:
        return sessions.setdefault(sid, deque(maxlen=100))

def headers():
    value = {'Accept': 'application/json'}
    if config.FREELLMAPI_API_KEY:
        value['Authorization'] = f'Bearer {config.FREELLMAPI_API_KEY}'
    return value

@app.get('/')
def index():
    return render_template('index.html')

@app.get('/api/models')
def models():
    try:
        response = requests.get(config.FREELLMAPI_BASE_URL + '/models', headers=headers(), timeout=15)
        response.raise_for_status()
        items = response.json().get('data', [])
        if not isinstance(items, list):
            raise ValueError('Invalid model response')
        ready = sorted(
            [{'id': item['id']} for item in items
             if isinstance(item, dict) and item.get('execution_status') == 'ready'
             and isinstance(item.get('id'), str) and item['id'].strip()],
            key=lambda model: model['id'].lower()
        )
    except (requests.RequestException, ValueError, TypeError, AttributeError) as exc:
        app.logger.warning('Model discovery failed: %s', type(exc).__name__)
        return jsonify({'error': 'Cannot load models. Check gateway connection and provider credentials.'}), 502
    if not ready:
        return jsonify({'error': 'No ready models. Check quotas, cooldowns, or provider keys, then refresh.'}), 503
    return jsonify({'models': ready})

@app.get('/api/settings')
def settings():
    return jsonify({'model': config.FREELLMAPI_MODEL, 'base_url': config.FREELLMAPI_BASE_URL,
                    'shell_mode': 'safe allowlist only'})

@app.get('/api/history')
def history():
    return jsonify(list(messages(request.args.get('session', 'default')[:100])))

@app.post('/api/clear')
def clear():
    sid = str((request.get_json(silent=True) or {}).get('session', 'default'))[:100]
    with lock:
        messages_to_clear = messages(sid)
        messages_to_clear.clear()
    return jsonify({'ok': True})

@app.post('/api/command')
def command():
    data = request.get_json(silent=True) or {}
    raw = str(data.get('command', '')).strip()
    sid = str(data.get('session', 'default'))[:100]
    if len(raw) > 500:
        return jsonify({'error': 'Command too long'}), 400
    name = raw.lower()
    if name == 'help':
        output = 'Commands: help, clear, history, settings, pwd, date, whoami, dir, ls, ver.'
    elif name == 'clear':
        messages(sid).clear()
        return jsonify({'output': '', 'clear': True})
    elif name == 'history':
        output = '\n'.join(f"{m['role']}: {m['content'][:160]}" for m in messages(sid)) or 'No chat history.'
    elif name == 'settings':
        output = f'Model: {config.FREELLMAPI_MODEL}\nEndpoint: {config.FREELLMAPI_BASE_URL}\nShell: safe allowlist'
    elif name == 'pwd':
        output = str(Path.cwd())
    elif name == 'date':
        output = datetime.now().astimezone().strftime('%Y-%m-%d %H:%M:%S %Z')
    elif name == 'whoami':
        output = os.getenv('USERNAME') or os.getenv('USER') or 'local-user'
    elif name in ('dir', 'ls'):
        output = '\n'.join(sorted(p.name + ('/' if p.is_dir() else '') for p in Path.cwd().iterdir())[:100])
    elif name == 'ver':
        output = platform.platform()
    else:
        return jsonify({'error': 'Blocked: only built-in read-only commands are allowed.'}), 403
    return jsonify({'output': output})

@app.post('/api/chat')
def chat():
    data = request.get_json(silent=True) or {}
    message = str(data.get('message', '')).strip()
    sid = str(data.get('session', 'default'))[:100]
    model = data.get('model', config.FREELLMAPI_MODEL)
    if not message or len(message) > 8000:
        return jsonify({'error': 'Message must be 1–8000 characters'}), 400
    if not isinstance(model, str) or not model.strip() or len(model) > 200:
        return jsonify({'error': 'Invalid model ID'}), 400
    log = messages(sid)
    with lock:
        prior = [{'role': m['role'], 'content': m['content']} for m in log][-20:]
    payload = {'model': model.strip(), 'messages': prior + [{'role': 'user', 'content': message}], 'stream': False}
    try:
        response = requests.post(config.FREELLMAPI_BASE_URL + '/chat/completions',
                                 json=payload, headers={**headers(), 'Content-Type': 'application/json'}, timeout=90)
        response.raise_for_status()
        answer = response.json()['choices'][0]['message']['content']
        if not isinstance(answer, str):
            answer = str(answer)
    except (requests.RequestException, ValueError, KeyError, IndexError, TypeError) as exc:
        app.logger.warning('Provider request failed: %s', type(exc).__name__)
        return jsonify({'error': 'AI provider unavailable. Check gateway, selected model, and credentials.'}), 502
    with lock:
        log.append({'role': 'user', 'content': message, 'time': stamp()})
        log.append({'role': 'assistant', 'content': answer, 'time': stamp()})
    return jsonify({'reply': answer})

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.getenv('PORT', '5000')), debug=False, threaded=True)
