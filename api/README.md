# Vitti SQL Formatter — API

Tiny zero-dependency Node HTTP service that wraps the shared `sqlfmt.js` engine.
Runs on `127.0.0.1:8787` behind nginx; exposed at **`https://identar.lucas.mat.br/api/`**.

## Endpoints

| method | path | notes |
|--------|------|-------|
| GET  | `/health` | `{ok:true}` liveness |
| GET  | `/` | service info + usage JSON |
| GET  | `/format?sql=…` | format from query string; add `&format=text` for raw output |
| POST | `/format` | body = JSON `{sql, options}` **or** raw SQL text; returns `{formatted}` (or `text/plain` when `Accept: text/plain`) |

Options (query params or JSON `.options`):
`keywordCase`,`functionCase` (`lower|upper|preserve`); booleans `useTabs`,`where11`,
`bannerComments`,`blankBetweenClauses`,`alignAliases`; ints `tabWidth`,`riverWidth`,
`aliasColumn`,`bannerWidth`. CORS is open (`*`). Max body 2 MB.

## Examples

```bash
# quick GET, raw output
curl "https://identar.lucas.mat.br/api/format?sql=select%20a,b%20from%20t%20where%20x=1&format=text"

# POST JSON with options
curl -X POST https://identar.lucas.mat.br/api/format \
  -H 'Content-Type: application/json' \
  -d '{"sql":"select a, count(1) qt from t group by a","options":{"keywordCase":"upper","aliasColumn":40}}'

# POST a whole file, get plain text back
curl -X POST https://identar.lucas.mat.br/api/format \
  -H 'Content-Type: text/plain' -H 'Accept: text/plain' \
  --data-binary @query.sql
```

```python
import requests
r = requests.post("https://identar.lucas.mat.br/api/format",
                  json={"sql": open("query.sql").read(), "options": {"aliasColumn": 48}})
print(r.json()["formatted"])
```

## Run locally
```bash
cp ../sqlfmt/sqlfmt.js ./sqlfmt.js   # sync engine
PORT=8799 node server.js
```

## Deploy (VPS)
Files live in `/opt/vitti-sqlfmt/` (`server.js` + `sqlfmt.js`); runs via the
`vitti-sqlfmt.service` systemd unit; nginx adds a `location /api/` proxy to the
`identar.lucas.mat.br` vhost. Re-deploy after editing:
```bash
cp sqlfmt/sqlfmt.js api/sqlfmt.js
tar -C api -czf - server.js sqlfmt.js \
  | ssh vps "tar xzf - -C /opt/vitti-sqlfmt && systemctl restart vitti-sqlfmt"
```
