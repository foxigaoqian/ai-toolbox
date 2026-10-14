import {generateImage,remakeImage,providerStatus} from './provider.js';
import {getSession,reserveQuota,refundQuota,sendJson} from './generation.js';

// Paid external image calls are off until the image-group token is configured.
// Public beta: max 20 image requests/day site-wide, 6 per browser; no automatic retries.
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
 if(!await reserveQuota(env.DB,'global:images',20))return sendJson({error:'IMAGE_GLOBAL_DAILY_LIMIT',message:'今天公共图片试用额度已用完'},429);
 let owner=null,reserved=false;
 try{
  owner=await getSession(req,env,true);
  reserved=await reserveQuota(env.DB,'session:images:'+owner.id,6);
  if(!reserved){await refundQuota(env.DB,'global:images');return sendJson({error:'IMAGE_BROWSER_DAILY_LIMIT',message:'每个浏览器每天最多生成6张图片（含复刻图片）'},429,owner.cookie);}
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

/** Reference-image remake. No client-provided remote URLs are fetched here. */
async function remix(req,env){
 const mime=(req.headers.get('content-type')||'').toLowerCase();
 if(!mime.startsWith('multipart/form-data'))return sendJson({error:'IMAGE_EDIT_MULTIPART_REQUIRED'},415);
 const contentLength=Number(req.headers.get('content-length')||0);
 if(contentLength>4700000)return sendJson({error:'IMAGE_REFERENCE_TOO_LARGE',message:'参考图请压缩至 4MB 以下'},413);
 if(!providerStatus(env).imageConfigured)return sendJson({error:'IMAGE_KEY_REQUIRED',message:'图片组 Key 未配置'},503);
 if(!env.DB||!env.ASSETS)return sendJson({error:'STORAGE_NOT_READY'},503);
 let input;try{input=await req.formData()}catch{return sendJson({error:'IMAGE_EDIT_INVALID_FORM'},400)}
 const file=input.get('reference');
 const prompt=String(input.get('prompt')||'').trim(),size=String(input.get('size')||'1024x1536');
 const mode=input.get('mode')==='background'?'background':'full';
 if(!file||typeof file.arrayBuffer!=='function'||!file.size||file.size>4194304)
  return sendJson({error:'IMAGE_REFERENCE_REQUIRED',message:'请上传小于4MB的参考图片'},422);
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))
  return sendJson({error:'IMAGE_REFERENCE_FORMAT',message:'参考图仅支持 PNG/JPG/WebP'},415);
 if(prompt.length<10||prompt.length>1800)
  return sendJson({error:'IMAGE_INVALID_PROMPT',message:'图片复刻要求需为10–1800字'},422);
 if(!['1024x1024','1024x1536','1536x1024'].includes(size))
  return sendJson({error:'IMAGE_INVALID_SIZE'},422);
 // Verify MIME corresponds to actual image header, not just uploaded extension.
 const header=new Uint8Array((await file.arrayBuffer()).slice(0,16));
 let type;try{type=sniff(header)}catch{return sendJson({error:'IMAGE_REFERENCE_INVALID'},422)}
 if(type.mime!==file.type)return sendJson({error:'IMAGE_REFERENCE_FORMAT_MISMATCH'},422);
 if(!await reserveQuota(env.DB,'global:images',20))
  return sendJson({error:'IMAGE_GLOBAL_DAILY_LIMIT',message:'今天图片生成额度已用完'},429);
 let owner=null,reserved=false;
 try{
  owner=await getSession(req,env,true);
  reserved=await reserveQuota(env.DB,'session:images:'+owner.id,6);
  if(!reserved){
   await refundQuota(env.DB,'global:images');
   return sendJson({error:'IMAGE_BROWSER_DAILY_LIMIT',message:'每个浏览器每天最多生成6张图片（含普通生图）'},429,owner.cookie);
  }
  const enhancedPrompt=mode==='background'
    ? '你正在制作【纯视觉底图】，后续前端 Canvas 会单独绘制所有中文标题和正文。严格禁止任何文字、字母、数字、字幕、Logo、水印、标语或看似文字的字符；尤其要清除原图中已有的所有文字，不能保留原文。参考输入图片的配色、图形元素、留白和信息布局，生成一张全新的原创无字竖版底图。把画面下半部留成干净、低纹理、浅色的中文排版空白区，画面上部使用精致的主题插画或装饰，整体统一、耐看且方便后续叠字。不复制原图人物、标识。视觉要求：'+prompt
    : '参考输入图片的版式、色彩和视觉层次，创作原创图文，避免复制水印与商标。文字部分需准确但可能需要编辑器纠错。用户要求：'+prompt;
  const img=await remakeImage(env,file,enhancedPrompt,{size});
  if(img.kind==='url')return sendJson({ok:true,kind:'temporary-external-url',url:img.url,saved:false,mode,model:img.model,warning:'图片模型返回临时图片外链，建议下载后再导入编辑器'},200,owner.cookie);
  const bytes=decodeImage(img.data),format=sniff(bytes),id=crypto.randomUUID(),key=owner.id+'/'+id+'.'+format.ext;
  await env.ASSETS.put(key,bytes,{httpMetadata:{contentType:format.mime}});
  try{await env.DB.prepare('INSERT INTO assets(id,owner,object_key,mime,size) VALUES(?,?,?,?,?)').bind(id,owner.id,key,format.mime,bytes.length).run();}
  catch(e){await env.ASSETS.delete(key).catch(()=>{});throw e}
  return sendJson({ok:true,kind:'private-asset',id,url:'/api/assets/'+id,model:img.model,mode,saved:true},201,owner.cookie);
 }catch(e){
  if(reserved&&owner)await refundQuota(env.DB,'session:images:'+owner.id);
  await refundQuota(env.DB,'global:images');
  const detail=String(e?.message||e);
  const upstreamStatus=Number(detail.match(/^IMAGE_EDIT_HTTP_(\d{3})$/)?.[1]||0);
  const gatewayFail=[500,502,503,504].includes(upstreamStatus);
  const message=upstreamStatus===502?'图片中转站返回502。该请求未获得有效图像，可能是上游通道暂时故障或当前参考图处理失败；已停止建议的后续批量请求，请稍后只试1张。':
    gatewayFail?'中转站图片通道暂时不可用，请稍后仅尝试1张，或查中转站调用日志。':
    upstreamStatus===429?'中转站图片模型限流，稍后再试。':
    upstreamStatus===401||upstreamStatus===403?'图片模型 Key 权限有误，请检查中转站分组和模型权限。':
    upstreamStatus===404?'图片模型或 /images/edits 接口不存在，请核对中转站支持情况。':
    '图片 AI 复刻失败，请检查模型权限和请求格式。';
  return sendJson({error:gatewayFail?'IMAGE_UPSTREAM_UNAVAILABLE':'IMAGE_EDIT_FAILED',detail:detail.startsWith('IMAGE_')?detail:'IMAGE_SERVICE_UNAVAILABLE',
    message,retryable:false,upstreamStatus:upstreamStatus||undefined},
    gatewayFail?502:upstreamStatus===429?429:503,owner?.cookie||'');
 }
}

export async function handleImageApi(req,env){
 const p=new URL(req.url).pathname;
 if(p==='/api/images/generate'&&req.method==='POST')return create(req,env);
 if(p==='/api/images/remix'&&req.method==='POST')return remix(req,env);
 return null;
}
