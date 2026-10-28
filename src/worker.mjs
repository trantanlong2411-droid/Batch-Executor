import {NETWORK,DEFAULTS,validateOptions,makeActions,buildMulticall,decodeAggregate,
 resultFor,summarize} from './core.mjs';
import {HTML} from './page.mjs';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','access-control-allow-origin':'same-origin'}});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let requestId=100;
async function rpcFetch(body){
 let err;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(NETWORK.rpc,{
    method:'POST',headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(14000)});
   if(response.status===429){
    const error=Error('Pharos Atlantic RPC rate limited (HTTP 429)');
    error.code='RATE_LIMIT';throw error;
   }
   if(!response.ok)throw Error('Pharos Atlantic RPC HTTP '+response.status);
   const raw=await response.text();
   let result;
   try{result=JSON.parse(raw)}catch{throw Error('Pharos RPC returned non-JSON: '+raw.slice(0,120))}
   return result;
  }catch(e){
   err=e;
   if(attempt===2)break;
   await pause(e.code==='RATE_LIMIT'?2300*(attempt+1):650*(attempt+1));
  }
 }
 throw err;
}
const item=(method,params=[])=>({jsonrpc:'2.0',id:++requestId,method,params});
async function rpc(method,params=[]){
 const request=item(method,params);
 const response=await rpcFetch(request);
 if(!response||Array.isArray(response)||response.id!==request.id)throw Error('Malformed Pharos JSON-RPC response');
 if(response.error)throw Error(method+': '+String(response.error.message||'RPC error'));
 if(response.result===null||response.result===undefined)throw Error(method+' returned empty result');
 return response.result;
}
async function rpcBatch(requests){
 const response=await rpcFetch(requests);
 if(!Array.isArray(response))throw Error('RPC provider does not support a JSON-RPC request batch; refusing to present sequential calls as a batch');
 const byId=new Map();
 for(const x of response){
  if(byId.has(x.id))throw Error('Duplicate JSON-RPC id');
  byId.set(x.id,x);
 }
 return requests.map(x=>{
  const v=byId.get(x.id);
  if(!v)throw Error('Missing batched JSON-RPC response for '+x.id);
  return v;
 });
}
function readResult(action,resp){return resultFor(action,resp)}
async function perform(options){
 const cfg=validateOptions(options);
 const chain=await rpc('eth_chainId');
 if(Number(BigInt(chain))!==NETWORK.chainId)throw Error('RPC chain mismatch: expected Pharos Atlantic 688689');
 const [block,contractCode]=await Promise.all([
  rpc('eth_blockNumber'),rpc('eth_getCode',[cfg.contract,'latest'])
 ]);
 if(typeof contractCode!=='string'||contractCode==='0x')throw Error('Specified SagaPlayground contract not deployed');
 const actions=makeActions(cfg);
 const calls=actions.map(a=>item('eth_call',[{to:a.target,data:a.callData},block]));
 // Three distinct baseline RPC requests. This is for comparative verification, NOT actual transactions.
 const individual=[];
 for(let i=0;i<calls.length;i++){
  if(i)await pause(250);
  const response=await rpcFetch(calls[i]);
  if(!response||Array.isArray(response)||response.id!==calls[i].id)
   throw Error('Invalid standalone JSON-RPC response at '+i);
  individual.push(readResult(actions[i],response));
 }
 // Detect whether true on-chain Multicall3 was deployed before choosing strategy.
 let code;
 try{code=await rpc('eth_getCode',[DEFAULTS.multicall3,block]);}
 catch(e){throw Error('Unable to verify Multicall3 deployment (fail closed): '+e.message)}
 let batch,mode,batchedRequest;
 if(typeof code==='string'&&code!=='0x'&&code!=='0x0'){
  mode='MULTICALL3';
  const calldata=buildMulticall(actions);
  batchedRequest=item('eth_call',[{to:DEFAULTS.multicall3,data:calldata},block]);
  const response=await rpcFetch(batchedRequest);
  if(response?.id!==batchedRequest.id||response.error)
   throw Error('Deployed Multicall3 aggregate3 failed: '+String(response.error?.message||'invalid response'));
  batch=decodeAggregate(actions,response.result);
 }else{
  mode='JSON_RPC_BATCH';
  const requests=actions.map(a=>item('eth_call',[{to:a.target,data:a.callData},block]));
  batchedRequest=requests;
  const responses=await rpcBatch(requests);
  batch=responses.map((r,i)=>readResult(actions[i],r));
 }
 const result=summarize(actions,individual,batch,{
  pinnedBlock:BigInt(block).toString(),contract:cfg.contract,account:cfg.account,mode
 });
 result.multicall3Address=mode==='MULTICALL3'?DEFAULTS.multicall3:null;
 result.multicall3CodePresent=mode==='MULTICALL3';
 result.gasEstimates=null;
 result.gasCostsClaimed=false;
 result.warning=mode==='MULTICALL3'?
  'One eth_call aggregates 3 EVM view operations using on-chain Multicall3; results are simulations, not mined transactions. Call overhead and gas are not claimed as savings.':
  'JSON-RPC HTTP array batches 3 independent eth_call methods into 1 HTTP request, not one EVM transaction. This demonstrates request/step reduction only; no gas saving is asserted.';
 return result;
}
export default{
 async fetch(req){
  const url=new URL(req.url);
  if(req.method==='GET'&&url.pathname==='/')
   return new Response(HTML,{headers:{'content-type':'text/html;charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff'}});
  if(req.method==='GET'&&url.pathname==='/api/health')
   return json({ok:true,service:'batch-executor',chainId:NETWORK.chainId,
    network:NETWORK.name,readOnly:true,transactionBroadcast:false,
    availableModes:['MULTICALL3','JSON_RPC_BATCH'],
    verifiedMulticallDeploymentAtStartup:false,
    backend:'Pharos Atlantic read-only JSON-RPC'});
  if(req.method!=='POST'||url.pathname!=='/api/execute')
   return json({ok:false,error:'Not found'},404);
  if(Number(req.headers.get('content-length')||0)>4000)
   return json({ok:false,error:'Request too large'},413);
  let options;
  try{
   const body=await req.text();
   if(body.length>4000)throw Error('JSON request too large');
   options=JSON.parse(body);
  }catch(e){return json({ok:false,error:'Invalid JSON: '+e.message},400)}
  try{
   const result=await perform(options);
   if(!result.verified)return json({ok:false,decision:result.decision,report:result,
    error:'Standalone and batch calls disagreed at pinned block; failing closed'},409);
   return json({ok:true,report:result});
  }catch(e){
   return json({ok:false,decision:'ERROR_NO_EXECUTION',source:'PHAROS_ATLANTIC_LIVE_JSON_RPC',
    transactionBroadcast:false,error:String(e.message||e).slice(0,420)},502);
  }
 }
};
