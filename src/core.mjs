import {Interface,getAddress,isAddress} from 'ethers';
export const NETWORK=Object.freeze({name:'Pharos Atlantic Testnet',chainId:688689,rpc:'https://atlantic.dplabs-internal.com'});
export const DEFAULTS=Object.freeze({
  contract:'0x934403227468426b33c26536dABC33b066B73f73',
  account:'0x74B2c2E4E4B771F0C75dcE44f40787468E323f79',
  multicall3:'0xcA11bde05977b3631167028862bE2a173976CA11'
});
export const sagaAbi=new Interface([
 'function pending(address) view returns (uint256)',
 'function deposited(address) view returns (uint256)',
 'function tokenA() view returns (address)'
]);
export const multicallAbi=new Interface([
 'function aggregate3(tuple(address target,bool allowFailure,bytes callData)[] calls) payable returns (tuple(bool success,bytes returnData)[] returnData)'
]);
const hex=(value,label)=>{
 if(typeof value!=='string'||!/^0x[0-9a-fA-F]*$/.test(value)||value.length%2!==0)
  throw Error('Invalid '+label);
 return value;
};
export function validateOptions(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Options must be a JSON object');
 const contract=getAddress(raw.contract??DEFAULTS.contract);
 const account=getAddress(raw.account??DEFAULTS.account);
 if(!isAddress(contract)||!isAddress(account))throw Error('Invalid address');
 return {contract,account,failMiddle:raw.failMiddle===true};
}
export function makeActions(options){
 const cfg=validateOptions(options);
 return [
  {id:'pending',name:'Read pending test-B credits',target:cfg.contract,method:'pending',
   callData:sagaAbi.encodeFunctionData('pending',[cfg.account])},
  cfg.failMiddle
   ?{id:'invalid',name:'Intentionally invalid method selector (partial-failure demo)',
     target:cfg.contract,method:null,callData:'0xffffffff'}
   :{id:'deposited',name:'Read deposited vault shares',target:cfg.contract,method:'deposited',
     callData:sagaAbi.encodeFunctionData('deposited',[cfg.account])},
  {id:'tokenA',name:'Read vault token-A contract address',target:cfg.contract,method:'tokenA',
   callData:sagaAbi.encodeFunctionData('tokenA',[])}
 ];
}
export function decode(action,raw){
 const output=hex(raw,'return data');
 if(!action.method)throw Error('Intentionally invalid EVM selector');
 const result=sagaAbi.decodeFunctionResult(action.method,output);
 return action.method==='tokenA'?String(result[0]):result[0].toString();
}
const errMessage=e=>String(e?.message||e||'Unknown RPC error').slice(0,320);
export function resultFor(action,response){
 if(response?.error)return {id:action.id,name:action.name,status:'FAILED',value:null,
  reason:errMessage(response.error),returnData:null};
 if(typeof response?.result!=='string')return {id:action.id,name:action.name,status:'FAILED',
  value:null,reason:'Missing or malformed RPC result',returnData:null};
 try{
  return {id:action.id,name:action.name,status:'SUCCESS',value:decode(action,response.result),
   reason:null,returnData:response.result};
 }catch(e){
  return {id:action.id,name:action.name,status:'FAILED',value:null,
   reason:errMessage(e),returnData:response.result};
 }
}
export function decodeAggregate(actions,output){
 const decoded=multicallAbi.decodeFunctionResult('aggregate3',hex(output,'aggregate result'))[0];
 if(decoded.length!==actions.length)throw Error('Unexpected Multicall3 returned result count');
 return decoded.map((item,i)=>item.success?
   resultFor(actions[i],{result:item.returnData}):
   resultFor(actions[i],{error:{message:'Multicall3 subcall reverted; allowFailure=true'}}));
}
export function buildMulticall(actions){
 return multicallAbi.encodeFunctionData('aggregate3',[actions.map(a=>({
  target:a.target,allowFailure:true,callData:a.callData
 }))]);
}
export function compareResults(standalone,batched){
 if(standalone.length!==batched.length||standalone.length<3)throw Error('Need >=3 action results');
 const disagreements=[];
 for(let i=0;i<standalone.length;i++){
  if(standalone[i].id!==batched[i].id||
     standalone[i].status!==batched[i].status||
     (standalone[i].status==='SUCCESS'&&standalone[i].value!==batched[i].value))
   disagreements.push({index:i,individual:standalone[i],batch:batched[i]});
 }
 return disagreements;
}
export function summarize(actions,individual,batch,meta){
 const comparison=compareResults(individual,batch);
 const failed=batch.filter(a=>a.status==='FAILED');
 const succeeded=batch.filter(a=>a.status==='SUCCESS');
 const ok=comparison.length===0;
 return {
  schema:'pharos-batch-executor-v1',observedAt:new Date().toISOString(),
  network:NETWORK.name,chainId:NETWORK.chainId,
  pinnedBlock:meta.pinnedBlock,contract:meta.contract,account:meta.account,
  mode:meta.mode,modeDescription:meta.mode==='MULTICALL3'?
   'One EVM eth_call to deployed Multicall3.aggregate3 with per-call allowFailure=true':
   'One JSON-RPC HTTP batch containing three separate eth_call operations. Not atomic EVM execution.',
  actions:actions.map((a,i)=>({id:a.id,name:a.name,target:a.target,callData:a.callData,
   individual:individual[i],batched:batch[i]})),
  totalActions:actions.length,successCount:succeeded.length,failureCount:failed.length,
  failedActionIds:failed.map(x=>x.id),
  partialFailure:failed.length>0&&succeeded.length>0,
  completedOthers:succeeded.map(x=>x.id),
  comparisonMatch:ok,comparisonDisagreements:comparison,
  requestsForIndependentCalls:actions.length,requestsForBatchedCalls:1,
  rpcHttpRequestReduction:actions.length-1,
  rpcHttpRequestReductionPercent:Number(((1-1/actions.length)*100).toFixed(2)),
  gasSavingsClaim:'NONE',
  gasComparisonNote:'Read-only calls do not spend gas. This measures independent eth_call HTTP requests vs one batch execution/request, NOT paid gas savings.',
  execution:'READ_ONLY_ETH_CALL',transactionBroadcast:false,privateKeysUsed:false,
  decision:ok?(failed.length?'PARTIAL_FAILURE_HANDLED':'BATCH_COMPLETED'):'VERIFICATION_MISMATCH',
  verified:ok,
  failureSemantics:'Independent read calls. Failed subcalls return per-action errors; successful reads remain valid. No token transfers or writes.',
  source:'PHAROS_ATLANTIC_LIVE_JSON_RPC'
 };
}
