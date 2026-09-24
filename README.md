# Oanor ATHEX MCP for ChatGPT

A small remote MCP server that exposes the Oanor Athens Stock Exchange API to ChatGPT as four read-only tools:

- `athex_quote(codes)`
- `athex_screener(screen, limit)`
- `athex_index(name)`
- `athex_meta()`

The Oanor API key stays **server-side** in `OANOR_API_KEY`. It is never passed as a ChatGPT tool argument and should never be placed in a prompt.

## 1. Oanor upstream

Base URL:

`https://api.oanor.com/athex-api`

The wrapper calls:

- `GET /v1/quote?codes=OTE,PPC,...`
- `GET /v1/screener?screen=gainers|losers|active|marketcap&limit=20`
- `GET /v1/index?name=GD|FTSE`
- `GET /v1/meta`

Every upstream request sends the API key in the `x-oanor-key` header.

## 2. Run locally

Python 3.10+ is required.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export OANOR_API_KEY='YOUR_KEY'
python server.py
```

The MCP endpoint is:

`http://127.0.0.1:8000/mcp`

ChatGPT cannot connect directly to localhost. For local testing, use MCP Inspector or OpenAI Secure MCP Tunnel if available to your workspace.

## 3. Deploy remotely

Deploy the included Dockerfile to any HTTPS-capable host (Render, Railway, Fly.io, Azure Container Apps, AWS, GCP, etc.).

Set this environment secret on the host:

`OANOR_API_KEY=...`

Do **not** commit the key to Git.

After deployment, your MCP URL will look like:

`https://YOUR-HOST/mcp`

### Render

This project includes `render.yaml`. Create a new Blueprint/Web Service from the repository, then add `OANOR_API_KEY` as a secret environment variable.

## 4. Add to ChatGPT

In a Business/Enterprise/Edu workspace with Developer Mode enabled:

1. Open **Workspace Settings → Apps → Create**.
2. Name: **Oanor ATHEX**.
3. MCP server URL: `https://YOUR-HOST/mcp`.
4. Authentication from ChatGPT to this wrapper: **No auth** is fine if the endpoint is private/unguessable or otherwise protected at the infrastructure layer. The Oanor API key itself is already stored server-side. For a public production deployment, add OAuth or an access layer in front of the MCP server.
5. Run **Scan Tools**.
6. You should see exactly these four tools:
   - `athex_quote`
   - `athex_screener`
   - `athex_index`
   - `athex_meta`
7. Create/publish the app according to your workspace policy.
8. In a chat, select **Oanor ATHEX** from Tools (or its exact @mention if your UI supports it).

## 5. First diagnostic test

Ask ChatGPT to call:

`athex_meta()`

Then:

`athex_quote(["OTE", "PPC", "TITC", "BELA"] )`

If `athex_meta()` works but quotes fail, the MCP connection is fine and the problem is likely the Oanor API key, subscription, endpoint parameter, or upstream API response.

If **Scan Tools shows zero tools**, the problem is between ChatGPT and the MCP endpoint (URL, HTTPS/TLS, transport, deployment, or MCP server startup), not Oanor.

## 6. Timestamp rule for portfolio scans

The wrapper deliberately returns Oanor JSON unchanged. In downstream investment scans:

- `meta.timestamp` must be treated as **API response/retrieval time**, not automatically as exchange last-trade time.
- Never fabricate VWAP or exchange last-trade age if the upstream payload does not provide it.
- For a BUY NOW / breakout / stop decision, cross-check a timestamped exchange-quality source when Oanor does not expose an exchange trade timestamp.

## 7. Security

- Never paste the Oanor API key into a ChatGPT prompt.
- Keep `OANOR_API_KEY` in your deployment platform's secret manager/environment settings.
- Rotate the key immediately if it is ever exposed.
- Consider protecting the public MCP endpoint with OAuth/access control before broad workspace publication.
