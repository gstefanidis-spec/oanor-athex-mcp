# Cloudflare Workers Free deployment

This `cloudflare/` directory implements the same four Oanor ATHEX tools as the Python server, using the official MCP SDK's Web Standards Streamable HTTP transport. It needs no Docker container, database, paid bindings or custom domain. The endpoint is `/mcp`; `/health` is a basic process health check, not an upstream authentication test.

## Deployment from GitHub

1. Sign in to Cloudflare and open Workers & Pages → Create application → Import a repository.
2. Select `gstefanidis-spec/oanor-athex-mcp`, branch `main`.
3. Set root directory to `cloudflare` and Worker name to `oanor-athex-mcp`.
4. Install with `npm ci`. No separate build command is needed. Deploy command: `npm run deploy`.
5. Keep the Workers Free plan. Do not enable paid products.
6. In the Worker's Settings → Variables and Secrets, add `OANOR_API_KEY` as a Secret. Save/deploy the new version.
7. Copy the actual Workers URL shown by Cloudflare and append `/mcp` for your MCP client.
8. Verify tools/list returns `athex_quote`, `athex_screener`, `athex_index`, `athex_meta`; call `athex_meta` to test the real Oanor subscription.

Alternatively, from this directory:

```sh
npm ci
npm test
npm run build
npx wrangler login
npm run deploy
npx wrangler secret put OANOR_API_KEY
```

The secret command prompts privately. Never put a real key in Git, a command argument, documentation, screenshots or chat. The Render entry is not automatically transferred to Cloudflare.

## Access and limits

Without `MCP_ACCESS_TOKEN`, anyone with the endpoint can invoke these read-only tools and consume the Oanor quota. For clients supporting Authorization headers, set a separate `MCP_ACCESS_TOKEN` secret and send `Authorization: Bearer <token>`. Never reuse the Oanor upstream key for this purpose. For wider publication use OAuth/access control appropriate to your MCP client.

Cloudflare advertises Workers Free without a credit card, subject to platform eligibility. Free limits include 100,000 requests per day and 10 ms CPU per invocation. HTTP waiting is not CPU time. Real Worker CPU usage still needs verification after deployment. Upstream Oanor charges/quotas are independent of hosting.

Returned Oanor JSON is preserved. `meta.timestamp` is not automatically exchange last-trade time. No quote freshness or VWAP is invented. Upstream redirects are rejected to protect the key; raw error bodies are not returned.

## Validation performed

`npm test` tests MCP initialization/tool discovery, all four upstream mappings with mocked responses, defaults/normalization, input rejection, sanitized errors, origin checks and optional bearer protection. `npm run build` bundles the Worker without deploying. Live Oanor responses require the real server-side secret and a deployed endpoint; mock tests do not verify those.

Official references:
- https://www.cloudflare.com/products/workers/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/
