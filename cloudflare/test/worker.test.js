import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../src/worker.js';

const env = { OANOR_API_KEY: 'test-only-key' };
async function rpc(worker, method, params, bindings = env) {
  const r = await worker.fetch(new Request('https://example.workers.dev/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }), bindings);
  assert.equal(r.status, 200);
  return r.json();
}
test('MCP initialize and four read-only tools', async () => {
  const w = createWorker();
  const init = await rpc(w, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'Oanor ATHEX');
  const list = await rpc(w, 'tools/list', {});
  assert.deepEqual(list.result.tools.map(t => t.name).sort(), ['athex_index','athex_meta','athex_quote','athex_screener']);
  assert.ok(list.result.tools.every(t=>t.annotations.readOnlyHint));
});
test('all routes, normalization, defaults, original payload and server-side key', async () => {
  let seen;
  const payload={meta:{timestamp:'2026-09-24T10:00:00Z'},data:{price:1}};
  const w=createWorker(async (url, options)=>{seen={url,options};return Response.json(payload);});
  for (const [name,args,path,query] of [
    ['athex_quote',{codes:[' ote ','ppc']},'/v1/quote','codes=OTE%2CPPC'],
    ['athex_screener',{},'/v1/screener','screen=active&limit=20'],
    ['athex_index',{},'/v1/index','name=GD'],
    ['athex_meta',{},'/v1/meta',''],
  ]) {
    const r=await rpc(w,'tools/call',{name,arguments:args});
    assert.deepEqual(JSON.parse(r.result.content[0].text),payload);
    assert.equal(seen.url.pathname,'/athex-api'+path);
    assert.equal(seen.url.searchParams.toString(),query);
    assert.equal(seen.options.headers['x-oanor-key'],env.OANOR_API_KEY);
    assert.equal(seen.options.redirect,'error');
  }
});
test('invalid inputs never call Oanor', async()=>{
  const w=createWorker(()=>{throw new Error('must not call');});
  for(const [name,args] of [['athex_quote',{codes:''}],['athex_quote',{codes:Array(51).fill('OTE')}],['athex_screener',{limit:0}],['athex_screener',{limit:1.5}],['athex_index',{name:'invalid'}]]) {
    const r=await rpc(w,'tools/call',{name,arguments:args});
    assert.ok(r.error || r.result.isError);
  }
});
test('configuration and upstream errors are sanitized',async()=>{
  const missing=await rpc(createWorker(),'tools/call',{name:'athex_meta',arguments:{}},{});
  assert.ok(missing.result.isError);
  for(const status of [401,403,429,500]) {
    const r=await rpc(createWorker(async()=>new Response('test-only-key',{status})),'tools/call',{name:'athex_meta',arguments:{}});
    assert.ok(r.result.isError);
    assert.ok(!JSON.stringify(r).includes('test-only-key'));
  }
});
test('health, unknown paths, methods, origin and optional token',async()=>{
  const w=createWorker();
  assert.equal((await w.fetch(new Request('https://example.workers.dev/health'),env)).status,200);
  assert.equal((await w.fetch(new Request('https://example.workers.dev/unknown'),env)).status,404);
  assert.equal((await w.fetch(new Request('https://example.workers.dev/mcp'),env)).status,405);
  assert.equal((await w.fetch(new Request('https://example.workers.dev/mcp',{method:'POST',headers:{origin:'https://other.example'}}),env)).status,403);
  assert.equal((await w.fetch(new Request('https://example.workers.dev/mcp'),{...env,MCP_ACCESS_TOKEN:'test-token'})).status,401);
});
