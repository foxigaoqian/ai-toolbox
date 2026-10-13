/**
 * Secure multi-key model routing.
 * Group permissions are determined by the user's upstream API token, not a group parameter.
 *
 * Text token:  AI_TEXT_API_KEY (legacy: AI_API_KEY)
 * Image token: AI_IMAGE_API_KEY
 * Shared gateway root: AI_BASE_URL, optional image override: AI_IMAGE_BASE_URL
 *
 * Secrets are never returned to the client, logged, or placed in URLs.
 */
const FALLBACK_MODEL='@cf/meta/llama-3.1-8b-instruct-fast';
export const DEFAULT_TEXT_MODEL='deepseek-v4.1-flash';
export const DEFAULT_IMAGE_MODEL='gpt-image-2.5';

function textKey(env){return env.AI_TEXT_API_KEY||env.AI_API_KEY||'';}
function imageKey(env){return env.AI_IMAGE_API_KEY||'';}
function textModel(env){return String(env.AI_TEXT_MODEL||DEFAULT_TEXT_MODEL);}
function imageModel(env){return String(env.AI_IMAGE_MODEL||DEFAULT_IMAGE_MODEL);}
function textBase(env){return String(env.AI_TEXT_BASE_URL||env.AI_BASE_URL||'');}
function imageBase(env){return String(env.AI_IMAGE_BASE_URL||env.AI_BASE_URL||'');}

export function providerStatus(env){
 const tk=!!textKey(env),ib=!!imageBase(env),ik=!!imageKey(env),tb=!!textBase(env);
 return {
  provider:tk?'openai-compatible':'workers-ai',
  gatewayConfigured:tk&&tb,
  textConfigured:tk&&tb,
  imageConfigured:ik&&ib,
  textModel:tk?textModel(env):FALLBACK_MODEL,
  imageModel:imageModel(env),
  needsBaseUrl:tk&&!tb,
  needsImageBaseUrl:ik&&!ib,
  textProvider:tk?'openai-compatible':'workers-ai',
  imageProvider:ik?'openai-compatible':'not-configured'
 };
}
function validEndpoint(base,part){
 let u;try{u=new URL(String(base||''));}catch{throw Error('GATEWAY_INVALID_BASE_URL');}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||!u.hostname)throw Error('GATEWAY_INVALID_BASE_URL');
 const hostname=u.hostname.toLowerCase();
 if(hostname==='localhost'||hostname==='0.0.0.0'||hostname.endsWith('.localhost')||
    hostname.endsWith('.local')||hostname.endsWith('.internal')||
    hostname==='127.0.0.1'||hostname.startsWith('127.')||hostname.startsWith('10.')||
    hostname.startsWith('192.168.')||hostname.startsWith('172.')||
    hostname==='[::1]'||hostname.includes('%'))throw Error('GATEWAY_INVALID_BASE_URL');
 let path=u.pathname.replace(/\/+$/,'');
 if(path==='')path='/v1';
 if(path.split('/').includes('..'))throw Error('GATEWAY_INVALID_BASE_URL');
 u.pathname=path.endsWith(part)?path:path+part;
 return u.toString();
}
export function chatEndpoint(base){return validEndpoint(base,'/chat/completions');}
export function imageEndpoint(base){return validEndpoint(base,'/images/generations');}


export function decodeGatewayText(payload){
 if(payload&&typeof payload==='object'){
  const content=payload.choices?.[0]?.message?.content;
  if(typeof content==='string'&&content.trim())return content;
  if(Array.isArray(content)){const joined=content.filter(x=>x&&typeof x.text==='string').map(x=>x.text).join('');if(joined.trim())return joined;}
  if(typeof payload.output_text==='string'&&payload.output_text.trim())return payload.output_text;
 }
 throw Error('GATEWAY_EMPTY_RESPONSE');
}
export function decodeGatewaySSE(text){
 if(typeof text!=='string'||text.length>1048576)throw Error('GATEWAY_STREAM_TOO_LARGE');
 let fragments='',complete='',saw=false;
 for(const line of text.split(/\r?\n/)){
  const trimmed=line.trimStart();if(!trimmed.startsWith('data:'))continue;
  const v=trimmed.slice(5).trim();if(!v||v==='[DONE]')continue;
  let event;try{event=JSON.parse(v);}catch{continue;}
  saw=true;
  if(event.error)throw Error('GATEWAY_STREAM_ERROR');
  const delta=event.choices?.[0]?.delta?.content;
  if(typeof delta==='string')fragments+=delta;
  else if(Array.isArray(delta))fragments+=delta.map(x=>x.text||'').join('');
  const message=event.choices?.[0]?.message?.content;
  if(typeof message==='string')complete=message;
  if(event.type==='response.output_text.delta'&&typeof event.delta==='string')fragments+=event.delta;
  if(event.type==='response.output_text.done'&&typeof event.text==='string')complete=event.text;
 }
 if(fragments.trim())return fragments;
 if(complete.trim())return complete;
 if(!saw)throw Error('GATEWAY_STREAM_INVALID');
 throw Error('GATEWAY_STREAM_EMPTY');
}
async function readGatewayText(reply){
 const mime=String(reply.headers?.get?.('content-type')||'').toLowerCase();
 if(mime.includes('text/event-stream'))return decodeGatewaySSE(await reply.text());
 if(mime.includes('application/json')||!mime){
  let data;try{data=await reply.json();}catch{throw Error('GATEWAY_BAD_JSON');}
  return decodeGatewayText(data);
 }
 const text=await reply.text();
 if(text.length>1048576)throw Error('GATEWAY_RESPONSE_TOO_LARGE');
 if(text.trimStart().startsWith('data:'))return decodeGatewaySSE(text);
 if(text.trimStart().startsWith('{')){try{return decodeGatewayText(JSON.parse(text));}catch{}}
 throw Error('GATEWAY_UNSUPPORTED_RESPONSE_'+mime.split(';')[0].replace(/[^a-z0-9/+-]/g,'').slice(0,40));
}

export async function generateText(env,system,user,options={}){
 const status=providerStatus(env);
 const max_tokens=Math.max(256,Math.min(1400,Number(options.max_tokens)||1000));
 const temperature=Math.max(0,Math.min(1.4,Number(options.temperature)||0.65));
 if(status.provider==='openai-compatible'){
  if(!status.gatewayConfigured)throw Error('GATEWAY_CONFIG_INCOMPLETE');
  const url=chatEndpoint(textBase(env));
  let reply;
  try{
   reply=await fetch(url,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(40000),
    headers:{authorization:'Bearer '+textKey(env),'content-type':'application/json'},
    body:JSON.stringify({model:textModel(env),messages:[{role:'system',content:system},{role:'user',content:user}],
       max_tokens,temperature,stream:false})});
   }catch(e){
   const name=String(e?.name||'Error').replace(/[^a-zA-Z]/g,'').slice(0,28);
   throw Error(name==='TimeoutError'||name==='AbortError'?'GATEWAY_TIMEOUT':'GATEWAY_NETWORK_FAILED_'+name);
  }
  if(reply.status>=300&&reply.status<400)throw Error('GATEWAY_REDIRECT_REJECTED');
  if(!reply.ok)throw Error('GATEWAY_HTTP_'+reply.status);
  const output=await readGatewayText(reply);
  return {response:output,provider:'openai-compatible',model:textModel(env)};
 }
 if(!env.AI)throw Error('WORKERS_AI_NOT_BOUND');
 const response=await env.AI.run(FALLBACK_MODEL,{messages:[{role:'system',content:system},{role:'user',content:user}],
    max_tokens,temperature});
 return {response:response?.response||response?.choices?.[0]?.message?.content,
         provider:'workers-ai',model:FALLBACK_MODEL};
}
export async function generateImage(env,prompt,options={}){
 const status=providerStatus(env);
 if(!status.imageConfigured)throw Error('IMAGE_GATEWAY_NOT_CONFIGURED');
 if(typeof prompt!=='string'||prompt.trim().length<3||prompt.length>1300)throw Error('IMAGE_INVALID_PROMPT');
 const validSizes=new Set(['1024x1024','1024x1536','1536x1024']);
 const size=validSizes.has(options.size)?options.size:'1024x1024';
 let reply;
 try{
  reply=await fetch(imageEndpoint(imageBase(env)),{
    method:'POST',redirect:'manual',signal:AbortSignal.timeout(115000),
    headers:{authorization:'Bearer '+imageKey(env),'content-type':'application/json'},
    body:JSON.stringify({model:imageModel(env),prompt:prompt.trim(),size,n:1})
  });
 }catch{throw Error('IMAGE_NETWORK_FAILED');}
 if(reply.status>=300&&reply.status<400)throw Error('IMAGE_REDIRECT_REJECTED');
 if(!reply.ok)throw Error('IMAGE_HTTP_'+reply.status);
 let data;try{data=await reply.json();}catch{throw Error('IMAGE_BAD_JSON');}
 const first=data?.data?.[0];
 const base64=first?.b64_json||first?.image_base64;
 const url=first?.url;
 if(typeof base64==='string'&&base64.length>50)return {kind:'base64',data:base64,model:imageModel(env),size};
 if(typeof url==='string'){
  let link;try{link=new URL(url);}catch{throw Error('IMAGE_UNSAFE_URL');}
  if(link.protocol!=='https:'||link.username||link.password||link.port||!link.hostname||
     link.hostname==='localhost'||link.hostname.endsWith('.local')||link.hostname.endsWith('.internal')||
     link.hostname.startsWith('127.')||link.hostname.startsWith('10.')||link.hostname.startsWith('192.168.'))throw Error('IMAGE_UNSAFE_URL');
  return {kind:'url',url:link.toString(),model:imageModel(env),size};
 }
 throw Error('IMAGE_EMPTY_RESPONSE');
}
