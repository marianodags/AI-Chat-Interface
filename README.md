# AI Chat + Terminal Dashboard

Two independent panels: a **safe CMD/PowerShell-style terminal** and **FreeLLMAPI AI chat**.

The terminal supports only built-in commands (`help`, `clear`, `history`, `settings`, `pwd`, `date`, `whoami`, `dir`, `ls`, `ver`). It intentionally **does not** run arbitrary CMD or PowerShell commands.

## Windows setup

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env with your FreeLLMAPI API key and gateway endpoint
python app.py
```

Open http://127.0.0.1:5000 locally. Do not expose the Flask development server publicly.

## Ready-only FreeLLMAPI models

The dropdown fetches /api/models, which proxies the gateway's GET /v1/models with server-side credentials. Only IDs explicitly marked `execution_status: ready` appear. `exhausted`, `needsKey`, and unknown/missing statuses are excluded. Refresh to retrieve current availability.

If no models are ready, the dashboard displays an actionable error. Ready status may change before the request completes. This filtering affects the dropdown only: the backend accepts manually supplied model IDs and does not impose fallback routing.

Chat history is in server memory, and is lost on restart. Clear view clears the current display only.

Store secrets in .env (ignored by Git), never in the browser or repository. Rotate previously exposed keys.
