/**
 * Optional paid parser for PUBLIC Xiaohongshu note URLs.
 * EasyDown documentation: https://docs.easydown.org/zh/api/xiaohongshu
 * Disabled unless EASYDOWN_API_KEY secret is explicitly configured.
 * No Browser Run / user cookies required.
 */
const API='https://api.easydown.org/api/v1/platforms/xiaohongshu/parse';
export function safeMediaUrl(raw){
 if(typeof raw!=='string')return null;
 let u;try{u=new URL(raw.replace(/^http:\/\//i,'https://').replace(/^\/\//,'https://'))}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const host=u.hostname.toLowerCase();
 if(host==='xhscdn.com'||host.endsWith('.xhscdn.com')||
    host==='xhscdn.net'||host.endsWith('.xhscdn.net')||
    host==='rednotecdn.com'||host.endsWith('.rednotecdn.com')||
    host==='rednotecdn.net'||host.endsWith('.rednotecdn.net')||
    host==='ci.xiaohongshu.com')return u.toString();
 return null;
}
export function normalizeEasyDownNote(response,sourceUrl){
 const data=response?.data,platform=data?.platformData||{},media=data?.media||{};
 if(response?.status!==200||!data||typeof data!=='object')throw Error('XHS_EXTERNAL_INVALID_RESPONSE');
 const title=String(platform.title||media.title||'').trim().slice(0,180);
 const description=String(platform.desc||'').trim().slice(0,5500);
 const seen=new Set(),images=[];
 for(const item of (Array.isArray(platform.images_list)&&platform.images_list.length?platform.images_list:media.images||[]).slice(0,25)){
  const candidate=typeof item==='string'?item:(item?.original||item?.url_size_large||item?.url||item?.image_url);
  const url=safeMediaUrl(candidate);
  if(url&&!seen.has(url)){seen.add(url);images.push(url);if(images.length===9)break}
 }
 if(!title&&!description&&!images.length)throw Error('XHS_EXTERNAL_EMPTY');
 return {
  title,description,images,
  author:String(platform.user?.nickname||platform.user?.nick_name||'').slice(0,120),
  noteType:String(platform.type||'normal').slice(0,24),
  sourceUrl,partial:!description||!images.length,mode:'third-party-easydown'
 };
}
export async function parseWithEasyDown(env,url){
 if(!env.EASYDOWN_API_KEY)throw Error('XHS_EXTERNAL_NOT_CONFIGURED');
 let resp;
 try{
  resp=await fetch(API,{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(23000),
   headers:{authorization:'Bearer '+env.EASYDOWN_API_KEY,'content-type':'application/json','accept':'application/json'},
   body:JSON.stringify({url})
  });
 }catch(e){throw Error(e?.name==='TimeoutError'?'XHS_EXTERNAL_TIMEOUT':'XHS_EXTERNAL_NETWORK')}
 if(resp.status===429)throw Error('XHS_EXTERNAL_RATE_LIMIT');
 if(resp.status===401||resp.status===403)throw Error('XHS_EXTERNAL_AUTH');
 if(!resp.ok)throw Error('XHS_EXTERNAL_HTTP_'+resp.status);
 const contentType=String(resp.headers.get('content-type')||'');
 if(!contentType.includes('json'))throw Error('XHS_EXTERNAL_BAD_FORMAT');
 let json;try{json=await resp.json()}catch{throw Error('XHS_EXTERNAL_BAD_JSON')}
 return normalizeEasyDownNote(json,url);
}
