/**
 * OpenAI-compatible API gateway. Secret keys stay in Worker bindings only.
 * If no third-party key is configured, use the existing Cloudflare Workers AI model.
 */
const FALLBACK_MODEL='@cf/meta/llama-3.1-8b-instruct-fast';
export function providerStatus(env){
  const key=!!env.AI_API_KEY;
  const base=!!env.AI_BASE_URL;
  const model=!!env.AI_TEXT_MODEL;
  return {provider:key?'openai-compatible':'workers-ai',gatewayConfigured:key&&base&&model,
          needsBaseUrl:key&&!base,needsModel:key&&!model,
          textModel:key?(model?String(env.AI_TEXT_MODEL):'not-configured'):FALLBACK_MODEL};
}
export function chatEndpoint(base){
  let u;
  try{u=new URL(base);}catch{throw new Error('GATEWAY_INVALID_BASE_URL');}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||!u.hostname||u.port)throw new Error('GATEWAY_INVALID_BASE_URL');
  const host=u.hostname.toLowerCase();
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
     host.endsWith('.internal')||host==='0.0.0.0'||host==='127.0.0.1'||host.startsWith('10.')||
     host.startsWith('192.168.')||host.startsWith('172.')||host==='[::1]')throw new Error('GATEWAY_INVALID_BASE_URL');
  if(u.pathname.includes('..'))throw new Error('GATEWAY_INVALID_BASE_URL');
  const path=u.pathname.replace(/\/+$/,'');
  const postfix='/chat/completions';
  u.pathname=path.endsWith(postfix)?path:path+postfix;
  return u.toString();
}
export async function generateText(env,system,user,options={}){
 const mode=providerStatus(env);
 const max_tokens=Math.max(256,Math.min(1400,Number(options.max_tokens)||1000));
 const temperature=Math.max(0,Math.min(1.4,Number(options.temperature)||0.65));
 if(mode.provider==='openai-compatible'){
   if(!mode.gatewayConfigured)throw new Error('GATEWAY_CONFIG_INCOMPLETE');
   const url=chatEndpoint(String(env.AI_BASE_URL));
   const timeout=AbortSignal.timeout(40000);
   let resp;
   try{resp=await fetch(url,{method:'POST',headers:{'authorization':'Bearer '+String(env.AI_API_KEY),
     'content-type':'application/json'},signal:timeout,body:JSON.stringify({
       model:String(env.AI_TEXT_MODEL),messages:[{role:'system',content:system},{role:'user',content:user}],
       max_tokens,temperature,stream:false
     })});}
   catch{throw new Error('GATEWAY_NETWORK_FAILED');}
   if(!resp.ok)throw new Error('GATEWAY_HTTP_'+resp.status);
   let payload;try{payload=await resp.json();}catch{throw new Error('GATEWAY_BAD_JSON');}
   const out=payload?.choices?.[0]?.message?.content;
   if(typeof out!=='string'||!out.trim())throw new Error('GATEWAY_EMPTY_RESPONSE');
   return {response:out,provider:'openai-compatible',model:String(env.AI_TEXT_MODEL)};
 }
 if(!env.AI)throw new Error('WORKERS_AI_NOT_BOUND');
 const raw=await env.AI.run(FALLBACK_MODEL,{messages:[{role:'system',content:system},{role:'user',content:user}],
   max_tokens,temperature});
 return {response:raw?.response||raw?.choices?.[0]?.message?.content,provider:'workers-ai',model:FALLBACK_MODEL};
}
