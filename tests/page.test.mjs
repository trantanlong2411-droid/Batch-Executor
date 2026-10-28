import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {HTML} from '../src/page.mjs';
test('Dashboard explains real on-chain multicall vs JSON-RPC batch without conflation',()=>{
 assert.match(HTML,/JSON-RPC HTTP batch/);
 assert.match(HTML,/not an atomic EVM transaction/i);
 assert.match(HTML,/No real gas is spent/);
 assert.match(HTML,/66\.67%/);
 assert.match(HTML,/SAGA|SagaPlayground/);
});
test('UI contains three-action and partial-failure scenario, JSON audit',()=>{
 for(const id of ['all','partial','contract','account','export','rows','trace'])
  assert.ok(HTML.includes('id="'+id+'"'),id);
});
test('Inline browser javascript parses successfully',()=>{
 const scripts=[...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 new Script(scripts[0][1]);
});
