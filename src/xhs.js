/**
 * Best-effort preview of PUBLIC Xiaohongshu notes only.
 * No login, signatures, cookies, CAPTCHA bypass or platform-private endpoints.
 */
import {parseXhsSsr,canonicalShareUrl,noteIdFromUrl} from './xhs-ssr.js';
import {parseWithEasyDown,parseWithXhsDownloader} from './xhs-external.js';
import {getSession,reserveQuota} from './generation.js';
const LIMIT_HTML = 1200000;
const XHS_HOSTS = new Set(['www.xiaohongshu.com','xiaohongshu.com','m.xiaohongshu.com','xhslink.com','www.xhslink.com','xhslink.cn','www.xhslink.cn']);
const IMG_HOST_SUFFIX = ['.xhscdn.com','.xhscdn.net','.rednotecdn.com','.rednotecdn.net'];
const HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:HEADERS});
const normalize=(u)=>String(u||'').replace(/&amp;/gi,'&').replace(/\\u0026/gi,'&').replace(/\\u002F/gi,'/').replace(/\\\//g,'/');
function validXhs(href){
 let u;try{u=new URL(href)}catch{return null}
 if(u.username||u.password||u.port||!XHS_HOSTS.has(u.hostname.toLowerCase()))return null;
 // Share text often contains http://xhslink.com; immediately upgrade to TLS.
 if(u.protocol==='http:'&&['xhslink.com','www.xhslink.com','xhslink.cn','www.xhslink.cn'].includes(u.hostname.toLowerCase()))u.protocol='https:';
 if(u.protocol!=='https:')return null;
 return u;
}
function validImage(href){
 let u;try{u=new URL(normalize(href))}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const h=u.hostname.toLowerCase();
 if(h==='ci.xiaohongshu.com'||h==='sns-avatar-qc.xhscdn.com'||IMG_HOST_SUFFIX.some(s=>h.endsWith(s))||['xhscdn.com','xhscdn.net','rednotecdn.com','rednotecdn.net'].includes(h))return u.toString();
 return null;
}
export function extractSharedUrl(input){
 const text=String(input||'').trim();
 const tokens=text.match(/https?:\/\/[^\s<>"'，。]+/g)||[];
 const found=tokens.map(t=>t.replace(/[)\]）】,;]+$/,'')).find(t=>validXhs(t));return found?validXhs(found).toString():null;
}
export function extractShareEnvelope(input){
 const text=String(input||'').replace(/\s+/g,' ').trim();
 const block=text.match(/【([^】]{2,260})】/);if(!block)return {title:'',author:''};
 let label=block[1].replace(/\s*\|\s*小红书(?:\s*-\s*你的生活兴趣社区)?\s*$/i,'').trim();
 let title=label,author='';
 const split=label.lastIndexOf(' - ');
 if(split>0){title=label.slice(0,split).trim();author=label.slice(split+3).trim();}
 // This hint comes only from the user's pasted share text. It must never be
 // promoted into a made-up note body when the public page is unavailable.
 return {title:title.slice(0,180),author:author.slice(0,120)};
}
function entityDecode(s){return String(s||'').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(m,n)=>{
 const k=n.toLowerCase();if(k==='amp')return '&';if(k==='quot')return '"';if(k==='apos')return "'";if(k==='lt')return '<';if(k==='gt')return '>';if(k==='nbsp')return ' ';
 if(k[0]==='#'){const num=k[1]==='x'?parseInt(k.slice(2),16):parseInt(k.slice(1),10);return num>0&&num<=0x10ffff?String.fromCodePoint(num):''}
 return m;
 })}
function strip(s){return entityDecode(String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ')).trim()}
function genericShell(title,description){
 const t=strip(title),d=strip(description);
 const genericTitle=/^(?:小红书|REDnote|登录小红书|发现精彩|想了解些什么[？?]?)$/i.test(t);
 const genericBody=/^(?:在小红书[，,]\s*)?分享照片和视频[，,]\s*分享购物心得[，,]\s*记录生活故事[，,]\s*和最会生活的人做朋友[。.]?$/i.test(d)||
  /小红书.*(?:生活兴趣社区|分享照片和视频)/i.test(d);
 return genericTitle||genericBody;
}
function metaTags(html){
 const meta={};
 for(const t of html.matchAll(/<meta\b[^>]*>/gi)){
  let attrs={};
  for(const a of t[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[a[1].toLowerCase()]=entityDecode(a[2]??a[3]??'');
  const name=(attrs.property||attrs.name||attrs.itemprop||'').toLowerCase(),val=attrs.content||'';
  if(name&&val&&!meta[name])meta[name]=val;
 }
 return meta;
}
function maybeJsonData(raw){
 if(!raw)return null;
 try{return JSON.parse(raw)}catch{return null}
}
function collectJson(j,into,depth=0){
 if(depth>7||!j||into.size>=9)return;
 if(Array.isArray(j)){for(const k of j.slice(0,15))collectJson(k,into,depth+1);return}
 if(typeof j==='string'){const url=validImage(j);if(url)into.add(url);return}
 if(typeof j==='object'){
  for(const [k,v]of Object.entries(j).slice(0,40)){
    if(['image','images','thumbnailUrl','urlDefault','urlPre','imageList','cover','originUrl','url','src','imageUrl'].includes(k))collectJson(v,into,depth+1);
    else if(['@graph','mainEntity','itemListElement','note','noteDetailMap'].includes(k))collectJson(v,into,depth+1);
  }
 }
}
function jsonStringField(html,key){
 const re=new RegExp('["\\x27]'+key+'["\\x27]\\s*:\\s*("(?:\\\\.|[^"\\\\])*")');
 const m=re.exec(html);if(!m)return '';
 try{return JSON.parse(m[1]).slice(0,6500)}catch{return ''}
}
function jsonStringFields(html,key){
 const re=new RegExp('["\\x27]'+key+'["\\x27]\\s*:\\s*("(?:\\\\.|[^"\\\\])*")','g');
 const out=[];let match;
 while((match=re.exec(html))&&out.length<300){try{out.push({value:JSON.parse(match[1]).slice(0,6500),index:match.index})}catch{}}
 return out;
}
const titleKey=value=>strip(value).replace(/[\s？?！!，,。.【】\[\]()（）《》]/g,'').toLowerCase();
export function jsonStringFieldNearTitle(html,key,title){
 const wanted=titleKey(title);if(!wanted)return '';
 const titles=jsonStringFields(html,'title').filter(x=>titleKey(x.value)===wanted);
 const values=jsonStringFields(html,key);let best=null;
 for(const heading of titles){
  for(const item of values){
   const distance=item.index-heading.index;
   if(distance<=0||distance>12000)continue;
   if(!best||distance<best.distance)best={distance,value:item.value};
  }
 }
 return best?.value||'';
}
function cleanScrapedText(value){
 return strip(value).replace(/\s*(?:展开|收起)\s*$/,'').trim();
}
function scrapedEntry(payload,index){
 const group=Array.isArray(payload?.result)?payload.result[index]:null;
 return Array.isArray(group?.results)?group.results:[];
}
export function parseScrapedNote(payload,url){
 const title=scrapedEntry(payload,0).map(x=>cleanScrapedText(x?.text)).find(Boolean)||'';
 const bodies=scrapedEntry(payload,1).map(x=>cleanScrapedText(x?.text)).filter(Boolean);
 // Some responsive layouts render the same note twice. Prefer the richest copy,
 // rather than the first generic/profile description found in serialized HTML.
 const description=bodies.sort((a,b)=>b.length-a.length)[0]||'';
 const author=scrapedEntry(payload,2).map(x=>cleanScrapedText(x?.text)).find(Boolean)||'';
 return {sourceUrl:url,title:title.slice(0,180),description:description.slice(0,5500),author:author.slice(0,120)};
}
export function parseBrowserJsonNote(payload,url){
 const raw=payload?.result?.note&&typeof payload.result.note==='object'?payload.result.note:payload?.result;
 if(!raw||typeof raw!=='object')return {sourceUrl:url,title:'',description:'',author:'',images:[]};
 const title=cleanScrapedText(raw.title||'').slice(0,180);
 const description=cleanScrapedText(raw.description||raw.body||raw.caption||'').slice(0,5500);
 const author=cleanScrapedText(raw.author||raw.nickname||'').slice(0,120);
 const candidates=Array.isArray(raw.images)?raw.images:Array.isArray(raw.image_urls)?raw.image_urls:[];
 const images=[];
 for(const item of candidates){const image=validImage(typeof item==='string'?item:item?.url||item?.src);if(image&&!images.includes(image))images.push(image);if(images.length>=9)break}
 return {sourceUrl:url,title,description,author,images,noteType:'normal',mode:'browser-authenticated-json',partial:!description||!images.length};
}
export function parseXhsHtml(html,url=''){
 const path=validXhs(url)?.pathname||'';
 if(/^\/(?:login|signin|passport)(?:\/|$)/i.test(path))
  return {sourceUrl:url,title:'',description:'',images:[],mode:'login-required',partial:true};
 const meta=metaTags(html),imgs=new Set();
 let jsonTitle='',jsonBody='';
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  const j=maybeJsonData(m[1]);if(!j)continue;
  collectJson(j,imgs);
  const n=Array.isArray(j)?j.find(x=>x?.headline||x?.articleBody):j;
  if(n){jsonTitle=String(n.headline||n.name||'');jsonBody=String(n.articleBody||n.description||'')}
 }
 for(const key of ['og:image','twitter:image','image'])if(meta[key]){const u=validImage(meta[key]);if(u)imgs.add(u)}
 const candidates=[meta['og:image:secure_url'],...Array.from(html.matchAll(/"urlDefault"\s*:\s*"((?:\\.|[^"\\])+)"/g)).slice(0,12).map(x=>x[1]),...Array.from(html.matchAll(/"urlPre"\s*:\s*"((?:\\.|[^"\\])+)"/g)).slice(0,12).map(x=>x[1])];
 for(const item of candidates){const v=validImage(item);if(v)imgs.add(v)}
 for(const m of Array.from(html.matchAll(/<img\b[^>]*>/gi)).slice(0,30)){
   const src=m[0].match(/\b(?:src|data-src)\s*=\s*["']([^"']+)/i);
   if(src){const v=validImage(entityDecode(src[1]));if(v)imgs.add(v)}
 }
 const title=strip(meta['og:title']||jsonTitle||meta['twitter:title']||jsonStringField(html,'title')||'').replace(/\s*[-|]\s*小红书.*$/,'').slice(0,160);
 const article=jsonStringFieldNearTitle(html,'desc',title)||jsonStringField(html,'desc');
 const description=strip(article||jsonBody||meta['og:description']||meta.description||'').slice(0,5500);
 // Generic login shells contain no note content. Never invent source material.
 const generic=genericShell(title,description)||(description.length<50&&imgs.size===0&&(/^(小红书|REDnote|登录小红书|发现精彩|想了解些什么[？?]?)/i.test(title)||/^(小红书|REDnote|登录|发现)$/i.test(title)));
 return {sourceUrl:url,title:generic?'':title,description:generic?'':description,images:Array.from(imgs).slice(0,9),mode:generic?'generic-page-shell':'public-page-preview',partial:generic||imgs.size===0||!description};
}
async function readHtml(res){
 const contentType=(res.headers.get('content-type')||'').toLowerCase();
 if(!contentType.includes('html')&&!contentType.includes('text/plain'))throw Error('NOT_PUBLIC_HTML');
 const len=Number(res.headers.get('content-length')||0);
 if(len>LIMIT_HTML)throw Error('PAGE_TOO_LARGE');
 const reader=res.body?.getReader();if(!reader)return (await res.text()).slice(0,LIMIT_HTML);
 let bytes=0,items=[];
 for(;;){const a=await reader.read();if(a.done)break;bytes+=a.value.length;if(bytes>LIMIT_HTML){await reader.cancel();throw Error('PAGE_TOO_LARGE')}items.push(a.value)}
 const joined=new Uint8Array(bytes);let pos=0;for(const x of items){joined.set(x,pos);pos+=x.length}
 return new TextDecoder('utf-8',{fatal:false}).decode(joined);
}
const BROWSER_HEADERS={
 'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
 'accept-language':'zh-CN,zh;q=0.9,en;q=0.8',
 'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
};
/** Convert a server-side Cookie header or exported cookie JSON into Browser Run cookies. */
export function parseXhsCookieSecret(raw){
 const input=String(raw||'').trim();if(!input||input.length>32000)return [];
 let values=[];
 if(input[0]==='['){
  try{const parsed=JSON.parse(input);if(Array.isArray(parsed))values=parsed}catch{return []}
 }else{
  values=input.split(';').map(part=>{const at=part.indexOf('=');return at>0?{name:part.slice(0,at).trim(),value:part.slice(at+1).trim()}:null}).filter(Boolean);
 }
 const out=[],seen=new Set();
 for(const item of values.slice(0,80)){
  const name=String(item?.name||'').trim(),value=String(item?.value||'');
  if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,120}$/.test(name)||value.length>5000||seen.has(name))continue;
  const domain=String(item?.domain||'.xiaohongshu.com').toLowerCase().replace(/^www\./,'.');
  if(domain!=='xiaohongshu.com'&&domain!=='.xiaohongshu.com'&&!domain.endsWith('.xiaohongshu.com'))continue;
  seen.add(name);out.push({name,value,domain:domain==='xiaohongshu.com'?'.xiaohongshu.com':domain,path:'/',secure:true});
 }
 return out;
}
export function hasXhsSessionCookie(raw){
 const cookies=Array.isArray(raw)?raw:parseXhsCookieSecret(raw);
 return cookies.some(cookie=>cookie.name==='web_session'&&String(cookie.value||'').length>=8);
}
async function fetchPage(href){
 let url=validXhs(href);if(!url)throw Error('INVALID_XHS_URL');
 for(let i=0;i<5;i++){
  if(/^\/(?:login|signin|passport)(?:\/|$)/i.test(url.pathname))throw Error('LOGIN_REQUIRED');
  const resp=await fetch(url.toString(),{method:'GET',redirect:'manual',signal:AbortSignal.timeout(10500),headers:BROWSER_HEADERS});
  if([301,302,303,307,308].includes(resp.status)){
   const location=resp.headers.get('location');if(!location)throw Error('LINK_REDIRECT_UNAVAILABLE');
   const next=validXhs(new URL(location,url).toString());if(!next)throw Error('UNSUPPORTED_REDIRECT');
   url=next;continue;
  }
  if(resp.status===401||resp.status===403)throw Error('SOURCE_RESTRICTED');
  if(resp.status===404)throw Error('SOURCE_NOT_FOUND');
  if(resp.status>=400)throw Error('SOURCE_HTTP_'+resp.status);
  return {url:url.toString(),html:await readHtml(resp)};
 }
 throw Error('TOO_MANY_REDIRECTS');
}
function safeResult(parsed){
 return {ok:true,...parsed,notice:'公开笔记提取基于页面 SSR/元数据。内容所有权属于原作者，复刻请制作原创内容。'};
}
async function extractPublicNote(href){
 const supplied=validXhs(href);if(!supplied)throw Error('INVALID_XHS_URL');
 const paths=[supplied.toString()];
 if(noteIdFromUrl(supplied.toString())){
  // Use only the public xsec_token supplied in this exact share URL.
  for(const type of ['explore','discovery/item']){
   const alternate=canonicalShareUrl(supplied.toString(),type);
   if(alternate&&!paths.includes(alternate))paths.push(alternate);
  }
 }
 let sawLogin=false,last='NOTE_NOT_PUBLICLY_EXTRACTABLE';
 for(const url of paths.slice(0,3)){
  try{
   const page=await fetchPage(url);
   let ssr=null;
   try{ssr=parseXhsSsr(page.html,page.url)}catch(e){last=String(e.message||e)}
   if(ssr)return safeResult(ssr);
   const meta=parseXhsHtml(page.html,page.url);
   // Never treat an empty browser/login shell as a successful note.
   if(meta.mode!=='generic-page-shell'&&(meta.description||meta.images.length))return safeResult(meta);
   last='NOTE_NOT_PUBLICLY_EXTRACTABLE';
  }catch(e){
   const msg=String(e.message||e);
   if(msg==='LOGIN_REQUIRED'||msg==='SOURCE_RESTRICTED'){sawLogin=true;last=msg;continue}
   last=msg;
  }
 }
 const error=new Error(sawLogin?'LOGIN_REQUIRED':last);
 throw error;
}


async function browserPreview(request,env,url,shareHint={}){
 const hasBinding=!!(env.BROWSER&&typeof env.BROWSER.quickAction==='function');
 const hasRest=!!(env.CF_BROWSER_API_TOKEN&&/^[0-9a-f]{32}$/i.test(String(env.CF_BROWSER_ACCOUNT_ID||'')));
 if(!hasBinding&&!hasRest)throw Error('BROWSER_NOT_CONFIGURED');
 const owner=await getSession(request,env,true);
 if(!await reserveQuota(env.DB,'global:xhs-browser',10))throw Error('BROWSER_PREVIEW_LIMIT');
 if(!await reserveQuota(env.DB,'session:xhs-browser:'+owner.id,3))throw Error('BROWSER_SESSION_LIMIT');
 const target=validXhs(url);if(!target||!noteIdFromUrl(target.toString()))throw Error('INVALID_XHS_URL');
 const requestPayload={url:target.toString(),gotoOptions:{waitUntil:'domcontentloaded',timeout:19000},waitForTimeout:1200};
 const cookies=parseXhsCookieSecret(env.XHS_COOKIE);
 if(env.XHS_COOKIE&&!cookies.length)throw Error('XHS_COOKIE_INVALID');
 const authenticated=hasXhsSessionCookie(cookies);
 if(env.XHS_COOKIE&&!authenticated)throw Error('XHS_COOKIE_SESSION_MISSING');
 if(cookies.length)requestPayload.cookies=cookies;
 // REST is optional and uses a distinct Browser Run API token; not the Square API key.
 // Cloudflare REST can have different rate limits from the Worker binding.
 let response,parsed;
 if(hasRest){
  const endpoint='https://api.cloudflare.com/client/v4/accounts/'+env.CF_BROWSER_ACCOUNT_ID+'/browser-rendering/content';
  response=await fetch(endpoint,{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(26000),
   headers:{'Authorization':'Bearer '+env.CF_BROWSER_API_TOKEN,'Content-Type':'application/json'},
   body:JSON.stringify(requestPayload)
  });
 }else response=await env.BROWSER.quickAction('content',requestPayload);
 if(!parsed){
  if(!response.ok)throw Error('BROWSER_HTTP_'+response.status);
  const payload=await response.json();
  const html=typeof payload?.result==='string'?payload.result:'';
  if(!payload?.success||!html||html.length>1800000)throw Error('BROWSER_RESULT_INVALID_'+(payload?.success===false?'FAILURE':typeof payload?.result));
  try{parsed=parseXhsSsr(html,target.toString())}
  catch{parsed=parseXhsHtml(html,target.toString())}
 }
 if(parsed.mode==='generic-page-shell'||genericShell(parsed.title,parsed.description)||!parsed.description&&!parsed.images.length)throw Error('BROWSER_NOTE_EMPTY');
 if(!parsed.title&&shareHint.title)parsed.title=shareHint.title;
 if(!parsed.author&&shareHint.author)parsed.author=shareHint.author;
 const result={ok:true,...parsed,mode:authenticated?'browser-authenticated-note':'browser-public-note',notice:authenticated?'已使用管理员配置的服务端登录态读取公开笔记；Cookie 不会返回浏览器端。':'仅提取公开浏览器页面内容，不保证所有笔记均可访问。'};
 const headers={...HEADERS};
 if(owner.cookie)headers['set-cookie']=owner.cookie;
 await saveCachedNote(env,noteIdFromUrl(target.toString()),result);
 return new Response(JSON.stringify(publicNoteView(result,noteIdFromUrl(target.toString()))),{status:200,headers});
}


/** Short-lived note caching reduces Browser Run load and upstream expiring-image failures. */
const seconds=()=>Math.floor(Date.now()/1000);
function publicNoteView(result,noteId){
 if(!noteId||!result||!Array.isArray(result.images))return result;
 return {...result,images:result.images.slice(0,9).map((_,index)=>'/api/xhs/image?note='+noteId+'&index='+index)};
}
async function getCachedNote(env,noteId){
 if(!noteId||!env.DB)return null;
 try{
  const row=await env.DB.prepare('SELECT result_json FROM xhs_note_cache WHERE note_id=? AND expires_at>?').bind(noteId,seconds()).first();
  if(!row)return null;
  const obj=JSON.parse(row.result_json);
  if(typeof obj.description!=='string'||!Array.isArray(obj.images))return null;
  if(genericShell(obj.title,obj.description)){
   await env.DB.prepare('DELETE FROM xhs_note_cache WHERE note_id=?').bind(noteId).run().catch(()=>{});
   return null;
  }
  return publicNoteView({...obj,ok:true,cached:true,mode:obj.mode||'cached-public-note'},noteId);
 }catch{return null}
}
async function saveCachedNote(env,noteId,result){
 if(!noteId||!env.DB||!result||(!result.description&&!result.images?.length))return;
 const clean={
  title:String(result.title||'').slice(0,180),
  description:String(result.description||'').slice(0,5500),
  images:Array.isArray(result.images)?result.images.filter(x=>typeof x==='string').slice(0,9):[],
  author:String(result.author||'').slice(0,120),
  noteType:String(result.noteType||'normal').slice(0,40),
  sourceUrl:'https://www.xiaohongshu.com/discovery/item/'+noteId,
  partial:!!result.partial,
  mode:String(result.mode||'public-page-preview')
 };
 const now=seconds();
 // Xiaohongshu image URLs often contain short-lived signatures.
 await env.DB.prepare('INSERT INTO xhs_note_cache(note_id,result_json,created_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(note_id) DO UPDATE SET result_json=excluded.result_json,created_at=excluded.created_at,expires_at=excluded.expires_at')
  .bind(noteId,JSON.stringify(clean),now,now+86400).run().catch(()=>{});
}
async function browserCooldown(env){
 try{
  const row=await env.DB.prepare('SELECT reason,until_ts FROM xhs_parse_cooldown WHERE scope=?').bind('browser:public-xhs').first();
  return row&&Number(row.until_ts)>seconds()?row.reason:null;
 }catch{return null}
}
async function markBrowserCooldown(env,reason){
 try{
  const ttl=reason==='BROWSER_HTTP_429'||reason==='BROWSER_HTTP_503'?180:60;
  await env.DB.prepare('INSERT INTO xhs_parse_cooldown(scope,until_ts,reason) VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET until_ts=excluded.until_ts,reason=excluded.reason')
   .bind('browser:public-xhs',seconds()+ttl,reason).run();
 }catch{}
}

async function resolve(req,env){
 if(!(req.headers.get('content-type')||'').includes('application/json'))return reply({error:'INVALID_CONTENT_TYPE'},415);
 let body;try{body=await req.json()}catch{return reply({error:'INVALID_JSON'},400)}
 const rawInput=String(body.url||'').slice(0,3000);
 const url=extractSharedUrl(rawInput),shareHint=extractShareEnvelope(rawInput);
 if(!url)return reply({error:'INVALID_XHS_URL',message:'请粘贴完整的小红书公开笔记链接或分享文案'},422);
 if(!env.DB)return reply({error:'STORAGE_UNAVAILABLE'},503);
 const requested=validXhs(url),cacheId=requested&&noteIdFromUrl(requested.toString());
 const existing=await getCachedNote(env,cacheId);
 if(existing)return reply(existing);
 const day=new Date().toISOString().slice(0,10);
 const use=await env.DB.prepare("INSERT INTO usage_limits(day,scope,used) VALUES(?,?,1) ON CONFLICT(day,scope) DO UPDATE SET used=used+1 WHERE used<80").bind(day,'global:xhs-preview').run();
 if(!use.meta?.changes)return reply({error:'PREVIEW_LIMIT',message:'今天公开链接解析次数已用完'},429);
 try{
  const result=await extractPublicNote(url);
  await saveCachedNote(env,cacheId,result);
  return reply(publicNoteView(result,cacheId));
 }catch(e){
  const pageReason=String(e?.message||e).slice(0,90);
  let reason=pageReason,owner=null;
  // Preferred fallback: the owner's private XHS-Downloader service. It is
  // never called without both an HTTPS endpoint and a server-side token.
  if(cacheId&&env.XHS_PARSER_URL&&env.XHS_PARSER_TOKEN){
   try{
    owner=await getSession(req,env,true);
    const globalAllowed=await reserveQuota(env.DB,'global:xhs-selfhost',30);
    const userAllowed=globalAllowed&&await reserveQuota(env.DB,'session:xhs-selfhost:'+owner.id,5);
    if(!globalAllowed||!userAllowed)throw Error('XHS_PARSER_DAILY_LIMIT');
    const parserResult=await parseWithXhsDownloader(env,url);
    await saveCachedNote(env,cacheId,parserResult);
    const headers={...HEADERS};if(owner.cookie)headers['set-cookie']=owner.cookie;
    return new Response(JSON.stringify({...publicNoteView(parserResult,cacheId),ok:true}),{status:200,headers});
   }catch(err){reason=String(err?.message||err).slice(0,90)}
  }
  // Paid fallback is disabled by default. Only a server-side EasyDown Secret opts in.
  // Keep strict global and per-browser caps to avoid leaking paid credits.
  if(cacheId&&env.EASYDOWN_API_KEY){
   try{
    owner=owner||await getSession(req,env,true);
    const globalAllowed=await reserveQuota(env.DB,'global:xhs-external',10);
    const userAllowed=globalAllowed&&await reserveQuota(env.DB,'session:xhs-external:'+owner.id,2);
    if(!globalAllowed||!userAllowed)throw Error('XHS_EXTERNAL_DAILY_LIMIT');
    const apiResult=await parseWithEasyDown(env,url);
    await saveCachedNote(env,cacheId,apiResult);
    const headers={...HEADERS};if(owner.cookie)headers['set-cookie']=owner.cookie;
    return new Response(JSON.stringify({...publicNoteView(apiResult,cacheId),ok:true,externalPaid:true}),{status:200,headers});
   }catch(err){
    reason=String(err?.message||err).slice(0,90);
   }
  }
  if(env.XHS_BROWSER_FALLBACK!=='disabled'&&cacheId&&(env.BROWSER||(env.CF_BROWSER_API_TOKEN&&env.CF_BROWSER_ACCOUNT_ID))&&['LOGIN_REQUIRED','SOURCE_RESTRICTED','NOTE_NOT_PUBLICLY_EXTRACTABLE','XHS_SSR_ABSENT','XHS_SSR_NOTE_MISSING'].includes(pageReason)){
   const cooldown=await browserCooldown(env);
   if(cooldown){reason='BROWSER_COOLDOWN';}
   else{
    try{return await browserPreview(req,env,url,shareHint)}
    catch(err){
     reason=String(err?.message||err).slice(0,90);
     if(reason.startsWith('BROWSER_HTTP_429')||reason.startsWith('BROWSER_HTTP_503'))await markBrowserCooldown(env,reason);
    }
   }
  }
  if(shareHint.title){
   const fallback={ok:true,title:shareHint.title,description:'',images:[],author:shareHint.author,noteType:'normal',sourceUrl:url,partial:true,mode:'share-text-title-only',notice:'已从分享文字识别标题，但小红书未公开返回正文和图片；正文保持为空，避免把平台页面文案误当原帖。'};
   return reply(fallback);
  }
  const codes=new Set(['SOURCE_RESTRICTED','SOURCE_NOT_FOUND','LOGIN_REQUIRED','NOT_PUBLIC_HTML','UNSUPPORTED_REDIRECT','TOO_MANY_REDIRECTS','PAGE_TOO_LARGE','BROWSER_PREVIEW_LIMIT','BROWSER_SESSION_LIMIT','BROWSER_NOTE_EMPTY','BROWSER_RENDER_FAILED','BROWSER_HTTP_429','BROWSER_HTTP_403','BROWSER_HTTP_500','BROWSER_HTTP_503','BROWSER_COOLDOWN','XHS_COOKIE_INVALID','XHS_COOKIE_SESSION_MISSING','XHS_PARSER_DAILY_LIMIT','XHS_PARSER_RATE_LIMIT','XHS_PARSER_AUTH','XHS_PARSER_EMPTY','XHS_PARSER_TIMEOUT','XHS_PARSER_NETWORK','XHS_PARSER_PAGE_SHELL','XHS_EXTERNAL_DAILY_LIMIT','XHS_EXTERNAL_RATE_LIMIT','XHS_EXTERNAL_AUTH','XHS_EXTERNAL_EMPTY']);
  if(reason==='LOGIN_REQUIRED')return reply({error:'LOGIN_REQUIRED',message:'小红书将该链接跳转到了登录页，无法自动读取原帖正文和图片。请手动粘贴参考文案并上传图片。'},422);
  return reply({error:codes.has(reason)?reason:'SOURCE_FETCH_FAILED',message:reason==='BROWSER_PREVIEW_LIMIT'||reason==='BROWSER_SESSION_LIMIT'?'今日浏览器解析次数达到限制，可稍后重试或手动导入。':reason==='XHS_COOKIE_INVALID'?'服务端小红书 Cookie 格式无效，请管理员重新配置。':reason==='XHS_COOKIE_SESSION_MISSING'?'当前 Cookie 缺少 web_session，仍然不是有效登录态；请重新登录小红书后复制完整 Request Headers Cookie。':reason==='XHS_PARSER_DAILY_LIMIT'?'自建解析服务今日体验额度已用完，请稍后重试或手动导入。':reason==='XHS_PARSER_AUTH'?'自建解析服务鉴权失败，请管理员检查服务 Token。':reason==='XHS_PARSER_TIMEOUT'||reason==='XHS_PARSER_NETWORK'?'自建解析服务暂时不可用，请稍后重试或手动导入。':reason==='XHS_EXTERNAL_DAILY_LIMIT'?'第三方解析接口今日试用额度已用完，请稍后重试或手动导入。':reason==='XHS_EXTERNAL_AUTH'?'第三方解析接口的 Key 或权限不正确，请管理员检查配置。':reason==='BROWSER_COOLDOWN'?'浏览器解析服务暂时受限，为避免反复失败已暂停几分钟，请稍后重试或手动导入。':reason==='BROWSER_HTTP_429'?'Cloudflare Browser Run 当前达到限流上限，请稍后重试。也可以先手动导入图片与文案。':reason==='BROWSER_RENDER_FAILED'?'公开浏览器渲染暂时不可用，请稍后重试或手动导入。':'无法读取公开笔记，可能需要登录或分享链接已失效；可手动导入图片及文案。'},422);
 }
}
async function cachedNoteImage(req,env,note,index){
 if(!/^[a-f0-9]{24}$/.test(note)||!Number.isInteger(index)||index<0||index>8)return new Response('Invalid note image',{status:400});
 if(!env.DB||!env.ASSETS)return new Response('Storage not ready',{status:503});
 const key='xhs-preview/'+note+'/'+index;
 const existing=await env.ASSETS.get(key).catch(()=>null);
 if(existing){
  const mime=existing.httpMetadata?.contentType||'image/webp';
  return new Response(existing.body,{headers:{'content-type':mime,'cache-control':'public,max-age=3600','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin'}});
 }
 const row=await env.DB.prepare('SELECT result_json FROM xhs_note_cache WHERE note_id=? AND expires_at>?').bind(note,seconds()).first();
 if(!row)return new Response('Note preview expired, parse note again',{status:404});
 let obj;try{obj=JSON.parse(row.result_json)}catch{return new Response('Invalid cached note',{status:502})}
 const src=validImage(obj?.images?.[index]);
 if(!src)return new Response('Missing note image',{status:404});
 let response;
 try{response=await fetch(src,{redirect:'manual',signal:AbortSignal.timeout(9000),headers:{accept:'image/avif,image/webp,image/jpeg,image/png'}})}
 catch{return new Response('Source image unavailable',{status:502})}
 if(!response.ok)return new Response('Source image expired, please refresh note',{status:404});
 const mime=(response.headers.get('content-type')||'').toLowerCase().split(';')[0];
 if(!['image/png','image/jpeg','image/webp','image/avif'].includes(mime))return new Response('Unsupported image format',{status:415});
 const size=Number(response.headers.get('content-length')||0);
 if(size>6*1024*1024)return new Response('Image too large',{status:413});
 const chunks=[],reader=response.body?.getReader();if(!reader)return new Response('Missing image bytes',{status:404});
 let total=0;
 for(;;){
  const r=await reader.read();if(r.done)break;
  total+=r.value.length;if(total>6*1024*1024){await reader.cancel();return new Response('Image too large',{status:413})}
  chunks.push(r.value);
 }
 if(total<40)return new Response('Empty image',{status:404});
 const bytes=new Uint8Array(total);let off=0;for(const chunk of chunks){bytes.set(chunk,off);off+=chunk.length}
 const header=new TextDecoder().decode(bytes.slice(0,12));
 if(!(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216||
      mime==='image/png'&&bytes[0]===137&&bytes[1]===80||
      mime==='image/webp'&&header.startsWith('RIFF')||
      mime==='image/avif'&&header.includes('avif')))return new Response('Invalid image data',{status:415});
 await env.ASSETS.put(key,bytes,{httpMetadata:{contentType:mime}}).catch(()=>{});
 return new Response(bytes,{headers:{'content-type':mime,'cache-control':'public,max-age=3600','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin'}});
}

async function imageProxy(req,env){
 const query=new URL(req.url).searchParams;
 const note=query.get('note');
 if(note!==null){
  const index=Number(query.get('index'));
  return cachedNoteImage(req,env,note,index);
 }
 const url=query.get('url');
 const valid=validImage(url||'');
 if(!valid)return new Response('Invalid image host',{status:400});
 try{
  const r=await fetch(valid,{redirect:'manual',signal:AbortSignal.timeout(11000),headers:{accept:'image/avif,image/webp,image/jpeg,image/png'}});
  if(!r.ok||r.status>=300&&r.status<400)return new Response('Source image unavailable',{status:404});
  const mime=(r.headers.get('content-type')||'').toLowerCase().split(';')[0];
  if(!['image/png','image/jpeg','image/webp','image/avif'].includes(mime))return new Response('Unsupported image',{status:415});
  const max=6*1024*1024,sz=Number(r.headers.get('content-length')||0);
  if(sz>max)return new Response('Image too large',{status:413});
  const chunks=[];let total=0;const stream=r.body?.getReader();
  if(!stream)return new Response('Image unavailable',{status:404});
  for(;;){const v=await stream.read();if(v.done)break;total+=v.value.length;
    if(total>max){await stream.cancel();return new Response('Image too large',{status:413})}
    chunks.push(v.value)}
  if(total<40)return new Response('Invalid image',{status:415});
  const x=new Uint8Array(total);let cursor=0;
  for(const part of chunks){x.set(part,cursor);cursor+=part.length}
  const buf=x.buffer;const validMagic=mime==='image/jpeg'?x[0]===255&&x[1]===216:mime==='image/png'?x[0]===137&&x[1]===80:mime==='image/webp'?new TextDecoder().decode(x.slice(0,4))==='RIFF':new TextDecoder().decode(x.slice(4,12)).includes('avif');
  if(!validMagic)return new Response('Invalid image',{status:415});
  return new Response(buf,{headers:{'content-type':mime,'cache-control':'public,max-age=900','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin'}});
 }catch{return new Response('Source image unavailable',{status:404})}
}
export async function handleXhsApi(req,env){
 const p=new URL(req.url).pathname;
 if(p==='/api/xhs/resolve'&&req.method==='POST')return resolve(req,env);
 if(p==='/api/xhs/image'&&req.method==='GET')return imageProxy(req,env);
 return null;
}
