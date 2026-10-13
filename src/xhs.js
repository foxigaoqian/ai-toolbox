/**
 * Best-effort preview of PUBLIC Xiaohongshu notes only.
 * No login, signatures, cookies, CAPTCHA bypass or platform-private endpoints.
 */
const LIMIT_HTML = 1200000;
const XHS_HOSTS = new Set(['www.xiaohongshu.com','xiaohongshu.com','m.xiaohongshu.com','xhslink.com','www.xhslink.com']);
const IMG_HOST_SUFFIX = ['.xhscdn.com','.xhscdn.net'];
const HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:HEADERS});
const normalize=(u)=>String(u||'').replace(/&amp;/gi,'&').replace(/\\u0026/gi,'&').replace(/\\u002F/gi,'/').replace(/\\\//g,'/');
function validXhs(href){
 let u;try{u=new URL(href)}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!XHS_HOSTS.has(u.hostname.toLowerCase()))return null;
 return u;
}
function validImage(href){
 let u;try{u=new URL(normalize(href))}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const h=u.hostname.toLowerCase();
 if(h==='ci.xiaohongshu.com'||h==='sns-avatar-qc.xhscdn.com'||IMG_HOST_SUFFIX.some(s=>h.endsWith(s))||h==='xhscdn.com'||h==='xhscdn.net')return u.toString();
 return null;
}
function extractSharedUrl(input){
 const text=String(input||'').trim();
 const tokens=text.match(/https?:\/\/[^\s<>"'，。]+/g)||[];
 return tokens.map(t=>t.replace(/[)\]）】,;]+$/,'')).find(t=>validXhs(t))||null;
}
function entityDecode(s){return String(s||'').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(m,n)=>{
 const k=n.toLowerCase();if(k==='amp')return '&';if(k==='quot')return '"';if(k==='apos')return "'";if(k==='lt')return '<';if(k==='gt')return '>';if(k==='nbsp')return ' ';
 if(k[0]==='#'){const num=k[1]==='x'?parseInt(k.slice(2),16):parseInt(k.slice(1),10);return num>0&&num<=0x10ffff?String.fromCodePoint(num):''}
 return m;
 })}
function strip(s){return entityDecode(String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ')).trim()}
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
export function parseXhsHtml(html,url=''){
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
 const article=jsonStringField(html,'desc');
 const description=strip(article||jsonBody||meta['og:description']||meta.description||'').slice(0,5500);
 // Generic login shells contain no note content. Never invent source material.
 const generic=/^(小红书|小红书 - 标记我的生活|REDnote|登录小红书|发现精彩)/i.test(title)&&description.length<50;
 return {sourceUrl:url,title:generic?'':title,description:generic?'':description,images:Array.from(imgs).slice(0,9),mode:'public-page-preview',partial:imgs.size===0||!description};
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
async function fetchPage(href){
 let url=validXhs(href);if(!url)throw Error('INVALID_XHS_URL');
 for(let i=0;i<5;i++){
  const resp=await fetch(url.toString(),{method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000),
    headers:{'accept':'text/html,application/xhtml+xml','user-agent':'AI-Toolbox-Public-Preview/1.0'}});
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
async function resolve(req,env){
 if(!(req.headers.get('content-type')||'').includes('application/json'))return reply({error:'INVALID_CONTENT_TYPE'},415);
 let body;try{body=await req.json()}catch{return reply({error:'INVALID_JSON'},400)}
 const url=extractSharedUrl(String(body.url||'').slice(0,3000));
 if(!url)return reply({error:'INVALID_XHS_URL',message:'请粘贴完整的小红书公开笔记链接或分享文案'},422);
 if(!env.DB)return reply({error:'STORAGE_UNAVAILABLE'},503);
 const day=new Date().toISOString().slice(0,10);
 const use=await env.DB.prepare("INSERT INTO usage_limits(day,scope,used) VALUES(?,?,1) ON CONFLICT(day,scope) DO UPDATE SET used=used+1 WHERE used<80").bind(day,'global:xhs-preview').run();
 if(!use.meta?.changes)return reply({error:'PREVIEW_LIMIT',message:'今天公开链接解析次数已用完'},429);
 try{
  const page=await fetchPage(url),parsed=parseXhsHtml(page.html,page.url);
  if(!parsed.title&&!parsed.description&&!parsed.images.length)
    return reply({error:'NOTE_NOT_PUBLICLY_EXTRACTABLE',message:'该笔记没有可直接读取的公开内容。可能需要登录或页面使用动态加载；可使用手动粘贴文案、上传图片的方式。'},422);
  return reply({ok:true,...parsed,notice:'仅解析公开页面可读取的内容。图文二次创作请确保素材有合法使用权。'});
 }catch(e){
  const reason=String(e?.message||e).slice(0,90);
  const codes=new Set(['SOURCE_RESTRICTED','SOURCE_NOT_FOUND','NOT_PUBLIC_HTML','UNSUPPORTED_REDIRECT','TOO_MANY_REDIRECTS','PAGE_TOO_LARGE']);
  return reply({error:codes.has(reason)?reason:'SOURCE_FETCH_FAILED',message:'无法读取公开笔记。可能要求登录、链接失效或限制访问；请手动导入图片及文案。'},422);
 }
}
async function imageProxy(req){
 const url=new URL(req.url).searchParams.get('url');
 const valid=validImage(url||'');
 if(!valid)return new Response('Invalid image host',{status:400});
 try{
  const r=await fetch(valid,{redirect:'manual',signal:AbortSignal.timeout(11000),headers:{accept:'image/avif,image/webp,image/jpeg,image/png'}});
  if(!r.ok||r.status>=300&&r.status<400)return new Response('Source image unavailable',{status:404});
  const mime=(r.headers.get('content-type')||'').toLowerCase().split(';')[0];
  if(!['image/png','image/jpeg','image/webp','image/avif'].includes(mime))return new Response('Unsupported image',{status:415});
  const max=6*1024*1024,sz=Number(r.headers.get('content-length')||0);
  if(sz>max)return new Response('Image too large',{status:413});
  const buf=await r.arrayBuffer();if(buf.byteLength>max||buf.byteLength<40)return new Response('Image too large',{status:413});
  const x=new Uint8Array(buf);const validMagic=mime==='image/jpeg'?x[0]===255&&x[1]===216:mime==='image/png'?x[0]===137&&x[1]===80:mime==='image/webp'?new TextDecoder().decode(x.slice(0,4))==='RIFF':new TextDecoder().decode(x.slice(4,12)).includes('avif');
  if(!validMagic)return new Response('Invalid image',{status:415});
  return new Response(buf,{headers:{'content-type':mime,'cache-control':'public,max-age=900','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin'}});
 }catch{return new Response('Source image unavailable',{status:404})}
}
export async function handleXhsApi(req,env){
 const p=new URL(req.url).pathname;
 if(p==='/api/xhs/resolve'&&req.method==='POST')return resolve(req,env);
 if(p==='/api/xhs/image'&&req.method==='GET')return imageProxy(req);
 return null;
}
