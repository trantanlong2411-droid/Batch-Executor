import test from 'node:test';
import assert from 'node:assert/strict';
import {multicallAbi,sagaAbi,validateOptions,makeActions,buildMulticall,decodeAggregate,
 resultFor,compareResults,summarize,NETWORK} from '../src/core.mjs';
const options=validateOptions();
const sample=makeActions(options);
const wei=1000000000000000000n;
const outputs=[
 sagaAbi.encodeFunctionResult('pending',[wei]),
 sagaAbi.encodeFunctionResult('deposited',[wei*2n]),
 sagaAbi.encodeFunctionResult('tokenA',['0x0000000000000000000000000000000000000001'])
];
test('requires 3 independent actions with same pinned contract',()=>{
 assert.equal(sample.length,3);
 assert.equal(new Set(sample.map(x=>x.id)).size,3);
 assert.ok(sample.every(x=>x.target===options.contract));
});
test('decodes three different ABI results independently',()=>{
 assert.deepEqual(sample.map((a,i)=>resultFor(a,{result:outputs[i]}).value),
 [wei.toString(),(wei*2n).toString(),'0x0000000000000000000000000000000000000001']);
});
test('aggregate3 supports individually failing subcalls',()=>{
 const failedActions=makeActions({...options,failMiddle:true});
 const aggregate=multicallAbi.encodeFunctionResult('aggregate3',[[
  {success:true,returnData:outputs[0]},{success:false,returnData:'0x08c379a0'},
  {success:true,returnData:outputs[2]}
 ]]);
 const a=decodeAggregate(failedActions,aggregate);
 assert.deepEqual(a.map(v=>v.status),['SUCCESS','FAILED','SUCCESS']);
 assert.deepEqual(a.map(v=>v.id),['pending','invalid','tokenA']);
});
test('standard aggregate matches independent results',()=>{
 const result=multicallAbi.encodeFunctionResult('aggregate3',[outputs.map(x=>({success:true,returnData:x}))]);
 const batch=decodeAggregate(sample,result);
 const singles=sample.map((x,i)=>resultFor(x,{result:outputs[i]}));
 assert.deepEqual(compareResults(singles,batch),[]);
 const r=summarize(sample,singles,batch,{mode:'MULTICALL3',pinnedBlock:'100',contract:options.contract,account:options.account});
 assert.equal(r.decision,'BATCH_COMPLETED');
 assert.equal(r.rpcHttpRequestReduction,2);
 assert.equal(r.rpcHttpRequestReductionPercent,66.67);
 assert.equal(r.transactionBroadcast,false);
});
test('partial failure preserves two successful actions',()=>{
 const actions=makeActions({...options,failMiddle:true});
 const individual=[
 resultFor(actions[0],{result:outputs[0]}),
 resultFor(actions[1],{error:{message:'execution reverted'}}),
 resultFor(actions[2],{result:outputs[2]})];
 const batch=[...individual];
 const r=summarize(actions,individual,batch,{mode:'JSON_RPC_BATCH',pinnedBlock:'101',contract:options.contract,account:options.account});
 assert.equal(r.decision,'PARTIAL_FAILURE_HANDLED');
 assert.equal(r.failureCount,1);
 assert.deepEqual(r.completedOthers,['pending','tokenA']);
 assert.equal(r.gasSavingsClaim,'NONE');
 assert.match(r.modeDescription,/Not atomic EVM/);
});
test('disagreement between batch and standalone fails closed',()=>{
 const individual=sample.map((a,i)=>resultFor(a,{result:outputs[i]}));
 const batch=sample.map((a,i)=>resultFor(a,{result:i===0?sagaAbi.encodeFunctionResult('pending',[2n]):outputs[i]}));
 const r=summarize(sample,individual,batch,{mode:'JSON_RPC_BATCH',pinnedBlock:'102',contract:options.contract,account:options.account});
 assert.equal(r.decision,'VERIFICATION_MISMATCH');assert.equal(r.verified,false);
});
test('input validation rejects missing and invalid addresses',()=>{
 assert.throws(()=>validateOptions({contract:'not-an-address'}));
 assert.throws(()=>validateOptions({account:'0x123'}));
 assert.equal(NETWORK.chainId,688689);
});
test('multicall calldata encodes allowFailure true for each action',()=>{
 const call=buildMulticall(sample);
 const data=multicallAbi.decodeFunctionData('aggregate3',call)[0];
 assert.equal(data.length,3);
 assert.ok(data.every(x=>x.allowFailure===true));
});
