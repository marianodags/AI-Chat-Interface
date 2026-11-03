# AI Chat Interface — Supervised Agent

A Windows-friendly Flask dashboard with **separate AI chat and safe terminal panels** plus an opt-in **Level 2 Supervised Agent**.

## Features

- FreeLLMAPI chat and ready-only model dropdown (only `execution_status: ready`)
- Independent terminal with read-only built-ins such as `help`, `pwd`, `dir`, `cd`; no arbitrary CMD/PowerShell execution
- Agent can `list_files`, `read_file`, and `check_python` automatically
- **Approval required** for `write_file` (with unified diff preview) and `run_tests`
- Explicit Reject and Approve buttons, per-session pending tokens, and activity log
- Restricted workspace, path traversal/symlink checks, hidden/sensitive file exclusions, file-size caps, bounded agent steps, 25-second test timeout
- API keys stay on the Python server; no key fields in the browser

## Start on Windows

```powershell
git clone https://github.com/marianodags/AI-Chat-Interface.git
cd AI-Chat-Interface
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env; configure FREELLMAPI_BASE_URL and FREELLMAPI_API_KEY
python app.py
```

Open **http://127.0.0.1:5000**. For an existing clone, run `git pull origin main` first.

The default workspace is the app's directory. To point the agent at another trusted project, set `AGENT_WORKSPACE` in `.env` to its absolute directory path and restart the server. The terminal's `cd` command is independent of the agent workspace.

```dotenv
AGENT_WORKSPACE=C:\\Users\\YourName\\Projects\\MyApp
```

## Agent workflow

1. Select a ready FreeLLMAPI model that can reliably follow JSON instructions.
2. Type a task in **Supervised Agent**, such as “Inspect app.py for syntax problems.”
3. Read-only tools run automatically inside the configured workspace.
4. If the agent proposes a file edit, review the complete diff preview. Click **Approve action** or **Reject**.
5. Test execution always needs separate approval, even though the command is fixed: `python -m pytest -q`.
6. Inspect the activity log and final result. Every resumed task has a total tool budget.

**Important security limitations:** This is a *supervised local tool runner, not an OS sandbox*. Python tests are executable project code and may access your network or files, so approve them **only for trusted projects**. The app deliberately does not allow unrestricted shell commands, package installation, file deletion, or automatic Git pushes. Keep the Flask app bound to localhost. Approval state and agent history are held in memory and disappear on server restart. Files read by the agent may be sent to the selected external model/provider; do not target projects containing confidential content. Do not allow untrusted users access to this dashboard.

The model may produce invalid JSON or unsupported tool names; in that case the agent reports an error without executing an unapproved operation. A ready gateway status is not a guarantee of tool-use ability or provider reliability.

## Tests

```powershell
python -m pip install pytest
python -m pytest -q tests
```

Tests verify path restrictions, read tools, required approvals, token validation, rejection, stale-file conflict prevention, and blocked shell commands.

## VS Code-inspired dashboard

The interface now has a desktop editor workbench with an activity bar, restricted file explorer, read-only code preview, welcome actions, docked safe terminal, AI chat/agent tabs, model selector, approvals, and a blue status bar. It is inspired by the arrangement of VS Code, but is **not VS Code** or a full code editor.

- Click files in Explorer for a safe text preview (sensitive files and unsupported extensions are hidden).
- Use the activity bar to switch Explorer, Chat, Agent and Terminal views; smaller displays show one primary view at a time.
- Click **Welcome** to return to the start page, or use the agent/chat buttons.
- Press **Ctrl+K** to focus AI chat.
- Use the terminal collapse button to make more editor space.
- File previews are read-only. Agent edits still require explicit diff approval; the safe terminal remains restricted.

UI changes add `GET /api/workspace/list` and `GET /api/workspace/read`, which reuse the agent's restricted workspace and path checks. They do not enable arbitrary file browsing or shell execution.
