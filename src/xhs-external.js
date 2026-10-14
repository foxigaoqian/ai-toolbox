/**
 * Optional parsers for PUBLIC Xiaohongshu note URLs.
 *
 * Preferred: a private, authenticated XHS-Downloader service controlled by
 * the site owner. Paid fallback: EasyDown. Both are disabled unless their
 * server-side secrets are explicitly configured.
 */
const API='https://api.easydown.org/api/v1/platforms/xiaohongshu/parse';
const PARSER_LIMIT=1200000;
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

function parserEndpoint(raw){
 let base;try{base=new URL(String(raw||''))}catch{throw Error('XHS_PARSER_NOT_CONFIGURED')}
 if(base.protocol!=='https:'||base.username||base.password)throw Error('XHS_PARSER_INVALID_URL');
 const host=base.hostname.toLowerCase();
 const ipv4=host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
 const privateV4=ipv4&&ipv4.every(x=>x>=0&&x<=255)&&(ipv4[0]===10||ipv4[0]===127||ipv4[0]===0||ipv4[0]===169&&ipv4[1]===254||ipv4[0]===192&&ipv4[1]===168||ipv4[0]===172&&ipv4[1]>=16&&ipv4[1]<=31);
 if(!host||host==='localhost'||host.endsWith('.local')||privateV4||host.includes(':'))throw Error('XHS_PARSER_INVALID_URL');
 if(!base.pathname.endsWith('/xhs/detail'))base.pathname=base.pathname.replace(/\/+$/,'')+'/xhs/detail';
 base.search='';base.hash='';
 return base.toString();
}
function asList(value){
 if(Array.isArray(value))return value;
 if(typeof value==='string')return value.split(/\s+/).filter(Boolean);
 return [];
}
function genericProviderText(title,description){
 return /^(?:小红书|REDnote|登录小红书|发现精彩|想了解些什么[？?]?)$/i.test(String(title||'').trim())||
  /小红书.*(?:生活兴趣社区|分享照片和视频)/i.test(String(description||''));
}
/** Normalize JoeanAmier/XHS-Downloader API mode output. */
export function normalizeXhsDownloaderNote(response,sourceUrl){
 const data=response?.data;
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('XHS_PARSER_EMPTY');
 const title=String(data['作品标题']||data.title||'').trim().slice(0,180);
 const description=String(data['作品描述']||data.description||data.desc||'').trim().slice(0,5500);
 if(genericProviderText(title,description))throw Error('XHS_PARSER_PAGE_SHELL');
 const seen=new Set(),images=[];
 const noteType=String(data['作品类型']||data.type||'normal').trim().slice(0,40);
 const candidates=noteType==='视频'?[data['封面地址'],...(Array.isArray(data.images)?data.images:[])]:[...asList(data['下载地址']),...asList(data['图片地址']),data['封面地址'],...(Array.isArray(data.images)?data.images:[])];
 for(const item of candidates.slice(0,30)){
  const raw=typeof item==='string'?item:(item?.urlDefault||item?.url||item?.original);
  const media=safeMediaUrl(raw);
  if(media&&!seen.has(media)){seen.add(media);images.push(media);if(images.length===9)break}
 }
 if(!description&&!images.length)throw Error('XHS_PARSER_EMPTY');
 return {
  title,description,images,
  author:String(data['作者昵称']||data.author?.nickname||data.author||'').trim().slice(0,120),
  noteType,
  sourceUrl,partial:!description||!images.length,mode:'self-hosted-xhs-downloader'
 };
}
export async function parseWithXhsDownloader(env,url){
 if(!env.XHS_PARSER_URL||!env.XHS_PARSER_TOKEN)throw Error('XHS_PARSER_NOT_CONFIGURED');
 const endpoint=parserEndpoint(env.XHS_PARSER_URL);
 let resp;
 try{
  resp=await fetch(endpoint,{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(35000),
   headers:{authorization:'Bearer '+env.XHS_PARSER_TOKEN,'content-type':'application/json','accept':'application/json'},
   body:JSON.stringify({url,download:false,check_record:false})
  });
 }catch(e){throw Error(e?.name==='TimeoutError'?'XHS_PARSER_TIMEOUT':'XHS_PARSER_NETWORK')}
 if(resp.status===429)throw Error('XHS_PARSER_RATE_LIMIT');
 if(resp.status===401||resp.status===403)throw Error('XHS_PARSER_AUTH');
 if(!resp.ok)throw Error('XHS_PARSER_HTTP_'+resp.status);
 const type=String(resp.headers.get('content-type')||'').toLowerCase();
 if(!type.includes('json'))throw Error('XHS_PARSER_BAD_FORMAT');
 const length=Number(resp.headers.get('content-length')||0);
 if(length>PARSER_LIMIT)throw Error('XHS_PARSER_RESPONSE_TOO_LARGE');
 let raw;try{raw=await resp.text()}catch{throw Error('XHS_PARSER_BAD_JSON')}
 if(raw.length>PARSER_LIMIT)throw Error('XHS_PARSER_RESPONSE_TOO_LARGE');
 let json;try{json=JSON.parse(raw)}catch{throw Error('XHS_PARSER_BAD_JSON')}
 return normalizeXhsDownloaderNote(json,url);
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
