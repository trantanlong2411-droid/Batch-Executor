import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=(process.env.BATCH_URL||'https://batch-executor.trantanlong2411.workers.dev').replace(/\/$/,'');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function call(path,payload){
 const r=await fetch(base+path,{method:payload?'POST':'GET',
  headers:payload?{'content-type':'application/json'}:{},
  body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(60000)});
 const raw=await r.text();let body;
 try{body=JSON.parse(raw)}catch{throw Error(path+' HTTP '+r.status+' non-JSON '+raw.slice(0,200))}
 if(!r.ok||!body.ok)throw Error(path+' HTTP '+r.status+' '+JSON.stringify(body).slice(0,450));
 return body;
}
let health;
for(let i=0;i<24;i++){
 try{
  health=await call('/api/health');
  if(health.service==='batch-executor'&&health.chainId===688689)break;
 }catch{}
 await sleep(4500);
}
assert.equal(health?.readOnly,true,'Connected Worker has not deployed');
assert.equal(health?.transactionBroadcast,false);
const cases=[];
async function check(failMiddle){
 let response,err;
 for(let i=0;i<3;i++){
  try{
   response=await call('/api/execute',{failMiddle});break;
  }catch(e){err=e;console.log('TESTNET LIVE RPC RETRY',i+1,e.message);
   if(i<2)await sleep(14000);
  }
 }
 if(!response)throw Error('Live batch unavailable: '+err?.message);
 const a=response.report;
 assert.equal(a.chainId,688689);assert.equal(a.totalActions,3);
 assert.equal(a.verified,true);assert.equal(a.comparisonMatch,true);
 assert.equal(a.transactionBroadcast,false);
 assert.equal(a.requestsForIndependentCalls,3);
 assert.equal(a.requestsForBatchedCalls,1);
 assert.equal(a.rpcHttpRequestReduction,2);
 assert.equal(a.rpcHttpRequestReductionPercent,66.67);
 assert.equal(a.gasSavingsClaim,'NONE');
 assert.ok(['MULTICALL3','JSON_RPC_BATCH'].includes(a.mode));
 assert.equal(a.source,'PHAROS_ATLANTIC_LIVE_JSON_RPC');
 assert.ok(BigInt(a.pinnedBlock)>0n);
 if(failMiddle){
  assert.equal(a.decision,'PARTIAL_FAILURE_HANDLED');
  assert.equal(a.successCount,2);assert.equal(a.failureCount,1);
  assert.deepEqual(a.failedActionIds,['invalid']);
  assert.deepEqual(a.completedOthers,['pending','tokenA']);
  assert.deepEqual(a.actions.map(x=>x.batched.status),['SUCCESS','FAILED','SUCCESS']);
 }else{
  assert.equal(a.decision,'BATCH_COMPLETED');
  assert.equal(a.successCount,3);assert.equal(a.failureCount,0);
  assert.ok(a.actions.every(x=>x.individual.value===x.batched.value));
 }
 cases.push(a);
 console.log('LIVE BATCH PROOF',JSON.stringify({failedDemo:failMiddle,block:a.pinnedBlock,mode:a.mode,
  decision:a.decision,individual:a.requestsForIndependentCalls,batch:a.requestsForBatchedCalls,
  reduction:a.rpcHttpRequestReductionPercent,actionOutcomes:a.actions.map(x=>({id:x.id,status:x.batched.status,value:x.batched.value})),
  broadcast:false}));
}
await check(false);
await sleep(2000);
await check(true);
await mkdir('proof',{recursive:true});
const evidence={schema:'pharos-batch-ci-proof-v1',verifiedAt:new Date().toISOString(),
 url:base,chainId:688689,readOnly:true,transactionBroadcast:false,
 evidenceStatement:'Real Pharos Atlantic read-only RPC. Calls verified at the same block. No gas saving or on-chain submission claimed.',
 results:cases};
await writeFile('proof/ci-live-batch.json',JSON.stringify(evidence,null,2)+'\n');
console.log('BATCH EXECUTOR REAL RPC EVIDENCE VERIFIED proof/ci-live-batch.json');
