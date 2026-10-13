import {generateImage,providerStatus} from './provider.js';
import {getSession,reserveQuota,refundQuota,sendJson} from './generation.js';

// Paid external image calls are off until the image-group token is configured.
// Public beta: max 10 requests/day site-wide and 2 requests/day per browser.
const MAX_IMAGE_BYTES=6*1024*1024;
function sniff(bytes){
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return {mime:'image/png',ext:'png'};
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {mime:'image/jpeg',ext:'jpg'};
 if(bytes.length>=12&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return {mime:'image/webp',ext:'webp'};
 throw Error('IMAGE_FORMAT_UNKNOWN');
}
function decodeImage(base64){
 const input=base64.includes(',')?base64.slice(base64.indexOf(',')+1):base64;
 if(input.length>(MAX_IMAGE_BYTES*4/3)+32)throw Error('IMAGE_TOO_LARGE');
 let bin;try{bin=atob(input.replace(/\s+/g,''));}catch{throw Error('IMAGE_INVALID_BASE64');}
 if(bin.length<30||bin.length>MAX_IMAGE_BYTES)throw Error('IMAGE_TOO_LARGE');
 const arr=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
 return arr;
}
async function create(req,env){
 if(!(req.headers.get('content-type')||'').includes('application/json'))return sendJson({error:'INVALID_CONTENT_TYPE'},415);
 let body;try{body=await req.json();}catch{return sendJson({error:'INVALID_JSON'},400);}
 const prompt=typeof body.prompt==='string'?body.prompt.trim():'';
 const toolId=String(body.tool_id||'tool-18');
 if(!['tool-18'].includes(toolId))return sendJson({error:'IMAGE_TOOL_NOT_ENABLED'},422);
 if(prompt.length<3||prompt.length>1300)return sendJson({error:'INVALID_PROMPT',message:'图片描述需为3–1300字'},422);
 if(!providerStatus(env).imageConfigured)return sendJson({error:'IMAGE_KEY_REQUIRED',message:'请在 Cloudflare 配置 AI_IMAGE_API_KEY 及 AI_BASE_URL'},503);
 if(!env.DB||!env.ASSETS)return sendJson({error:'STORAGE_NOT_READY'},503);
 if(!await reserveQuota(env.DB,'global:images',10))return sendJson({error:'IMAGE_GLOBAL_DAILY_LIMIT',message:'今天公共图片试用额度已用完'},429);
 let owner=null,reserved=false;
 try{
  owner=await getSession(req,env,true);
  reserved=await reserveQuota(env.DB,'session:images:'+owner.id,2);
  if(!reserved){await refundQuota(env.DB,'global:images');return sendJson({error:'IMAGE_BROWSER_DAILY_LIMIT',message:'每个浏览器每天最多生成2张图片'},429,owner.cookie);}
  const img=await generateImage(env,prompt,{size:body.size});
  if(img.kind==='url')return sendJson({ok:true,kind:'temporary-external-url',url:img.url,model:img.model,size:img.size,saved:false,warning:'此服务返回临时外链，请及时下载。'},200,owner.cookie);
  const bytes=decodeImage(img.data),format=sniff(bytes),id=crypto.randomUUID(),key=owner.id+'/'+id+'.'+format.ext;
  await env.ASSETS.put(key,bytes,{httpMetadata:{contentType:format.mime}});
  try{
   await env.DB.prepare('INSERT INTO assets(id,owner,object_key,mime,size) VALUES (?,?,?,?,?)').bind(id,owner.id,key,format.mime,bytes.length).run();
  }catch(e){await env.ASSETS.delete(key).catch(()=>{});throw e;}
  return sendJson({ok:true,kind:'private-asset',id,url:'/api/assets/'+id,model:img.model,size:img.size,saved:true},201,owner.cookie);
 }catch(e){
  if(reserved&&owner)await refundQuota(env.DB,'session:images:'+owner.id);
  await refundQuota(env.DB,'global:images');
  const err=String(e?.message||e);
  return sendJson({error:'IMAGE_GENERATION_FAILED',detail:err.startsWith('IMAGE_')?err:'IMAGE_SERVICE_UNAVAILABLE',message:'图片生成失败，检查模型权限、分组及网关接口'},503,owner?.cookie||'');
 }
}
export async function handleImageApi(req,env){
 const p=new URL(req.url).pathname;
 if(p==='/api/images/generate'&&req.method==='POST')return create(req,env);
 return null;
}
