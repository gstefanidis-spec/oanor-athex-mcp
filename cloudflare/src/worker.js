import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

const UPSTREAM = 'https://api.oanor.com/athex-api';
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export function createServer(env, upstreamFetch = fetch) {
  const server = new McpServer({ name: 'Oanor ATHEX', version: '1.1.0' });
  async function get(path, params = {}) {
    if (!env.OANOR_API_KEY?.trim()) return error('OANOR_API_KEY is not configured on the server.');
    const url = new URL(UPSTREAM + path);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    try {
      const response = await upstreamFetch(url, {
        headers: { 'x-oanor-key': env.OANOR_API_KEY.trim(), accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      if (response.status === 429) return error('Oanor rate limit/quota exceeded (HTTP 429).');
      if ([401, 403].includes(response.status)) return error(`Oanor authentication failed (HTTP ${response.status}). Check the server-side key and subscription.`);
      if (!response.ok) return error(`Oanor API error HTTP ${response.status}.`);
      const data = await response.json();
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch {
      // Never return raw upstream errors, which could contain credentials.
      return error('Oanor request failed: timeout, network error, redirect, or invalid JSON response.');
    }
  }
  server.registerTool('athex_quote', {
    description: 'Get Oanor ATHEX quotes. Returns upstream JSON unchanged. meta.timestamp is retrieval time, not necessarily exchange last-trade time; do not invent VWAP or freshness.',
    inputSchema: { codes: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1).max(50)]) }, annotations,
  }, ({ codes }) => get('/v1/quote', { codes: (Array.isArray(codes) ? codes : [codes]).map(c => c.trim().toUpperCase()).join(',') }));
  server.registerTool('athex_screener', {
    description: 'Run the Oanor ATHEX ranked market screener.',
    inputSchema: { screen: z.enum(['gainers', 'losers', 'active', 'marketcap']).default('active'), limit: z.number().int().min(1).max(100).default(20) }, annotations,
  }, args => get('/v1/screener', args));
  server.registerTool('athex_index', {
    description: 'Get GD (ATHEX General Index) or FTSE (FTSE/ATHEX Large Cap).',
    inputSchema: { name: z.enum(['GD', 'FTSE']).default('GD') }, annotations,
  }, args => get('/v1/index', args));
  server.registerTool('athex_meta', {
    description: 'Return Oanor service metadata and endpoint catalog. Use first to diagnose upstream connectivity.',
    inputSchema: {}, annotations,
  }, () => get('/v1/meta'));
  return server;
}
function error(text) { return { isError: true, content: [{ type: 'text', text }] }; }

export function createWorker(upstreamFetch = fetch) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === '/' || url.pathname === '/health') {
        return Response.json({ service: 'Oanor ATHEX MCP', status: 'ok', endpoint: '/mcp' });
      }
      if (url.pathname !== '/mcp') return new Response('Not found', { status: 404 });
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return new Response('Forbidden origin', { status: 403 });
      // Optional protection for clients that support an Authorization header.
      if (env.MCP_ACCESS_TOKEN && request.headers.get('authorization') !== `Bearer ${env.MCP_ACCESS_TOKEN}`) {
        return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
      }
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
      const server = createServer(env, upstreamFetch);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 65536 });
      try {
        await server.connect(transport);
        return await transport.handleRequest(request);
      } finally { await server.close(); }
    },
  };
}
export default createWorker();
