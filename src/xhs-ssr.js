/**
 * Native Cloudflare Worker port, adapted from the public SSR parsing approach in
 * wuaishare/sharextract (Apache-2.0):
 * https://github.com/wuaishare/sharextract/blob/main/sharextract/extractors/xiaohongshu.py
 * This does NOT execute page JS, use private APIs, produce signatures or reuse cookies.
 */
const NOTE_ID=/^[a-f0-9]{24}$/i;
export function noteIdFromUrl(input){
 let u;try{u=new URL(input)}catch{return null}
 const m=u.pathname.match(/^\/(?:explore|discovery\/item)\/([a-f0-9]{24})(?:\/|$)/i);
 return m&&NOTE_ID.test(m[1])?m[1].toLowerCase():null;
}
export function canonicalShareUrl(input,route){
 const u=new URL(input),id=noteIdFromUrl(input);if(!id)return null;
 const token=u.searchParams.get('xsec_token');if(!token)return null;
 const params=new URLSearchParams([['xsec_token',token]]);
 const source=u.searchParams.get('xsec_source');if(source)params.set('xsec_source',source);
 const path=route||(/^\/explore\//.test(u.pathname)?'explore':'discovery/item');
 if(path!=='explore'&&path!=='discovery/item')return null;
 return 'https://www.xiaohongshu.com/'+path+'/'+id+'?'+params;
}
function identifier(ch){return ch&&/[a-zA-Z0-9_$]/.test(ch)}
function replaceBareUndefined(str){
 let out='',quote=false,escape=false;
 for(let i=0;i<str.length;i++){
  const ch=str[i];if(quote){out+=ch;if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')quote=false;continue}
  if(ch==='"'){quote=true;out+=ch;continue}
  if(str.startsWith('undefined',i)&&!identifier(str[i-1])&&!identifier(str[i+9])){
   out+='null';i+=8;continue;
  }
  out+=ch;
 }
 return out;
}
function rawObject(text,start){
 let depth=0,quote=false,escape=false;
 if(text[start]!=='{')throw Error('XHS_SSR_INVALID');
 for(let i=start;i<text.length;i++){
  const c=text[i];
  if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false;continue}
  if(c==='"'){quote=true;continue}
  if(c==='{')depth++;
  if(c==='}'){depth--;if(depth===0)return text.slice(start,i+1)}
 }
 throw Error('XHS_SSR_TRUNCATED');
}
export function extractInitialState(html){
 const m=/window\.__INITIAL_STATE__\s*=\s*/.exec(html);
 if(!m)throw Error('XHS_SSR_ABSENT');
 const off=m.index+m[0].length;
 const brace=html.indexOf('{',off);
 if(brace<0||brace-off>30)throw Error('XHS_SSR_INVALID');
 const raw=rawObject(html,brace);
 if(raw.length>1000000)throw Error('XHS_SSR_TOO_LARGE');
 try{const parsed=JSON.parse(replaceBareUndefined(raw));if(!parsed||typeof parsed!=='object')throw Error();return parsed}
 catch{throw Error('XHS_SSR_UNREADABLE')}
}
function validImage(x){
 if(typeof x!=='string')return null;
 const s=x.trim().replace(/^\/\//,'https://').replace(/^http:\/\//,'https://');
 let u;try{u=new URL(s)}catch{return null}
 if(u.protocol!=='https:'||u.port||u.username||u.password)return null;
 const host=u.hostname.toLowerCase();
 if(!(host==='ci.xiaohongshu.com'||host==='xhscdn.com'||host==='xhscdn.net'||host.endsWith('.xhscdn.com')||host.endsWith('.xhscdn.net')))return null;
 return u.toString();
}
function noteFromState(state,id){
 const detail=state?.note?.noteDetailMap;
 if(!detail||typeof detail!=='object')return null;
 let entry=detail[id];
 if(!entry){for(const v of Object.values(detail).slice(0,20)){if(v?.note?.noteId?.toLowerCase?.()===id){entry=v;break}}}
 const note=entry?.note;
 if(!note||typeof note!=='object'||!Object.keys(note).length)return null;
 if(note.noteId&&String(note.noteId).toLowerCase()!==id)return null;
 return note;
}
function photos(note){
 const seen=new Set(),out=[];
 for(const item of Array.isArray(note.imageList)?note.imageList.slice(0,30):[]){
  if(!item||typeof item!=='object')continue;
  let source=item.urlDefault||item.urlPre||item.url;
  if(!source&&Array.isArray(item.infoList)){
   const preferred=item.infoList.find(x=>x?.imageScene==='WB_DFT'&&x?.url);
   source=preferred?.url||item.infoList.find(x=>x?.url)?.url;
  }
  const url=validImage(source);
  if(!url||seen.has(url))continue;
  seen.add(url);out.push(url);if(out.length>=9)break;
 }
 return out;
}
export function parseXhsSsr(html,url){
 const id=noteIdFromUrl(url);if(!id)throw Error('XHS_INVALID_NOTE_URL');
 const state=extractInitialState(html);
 const note=noteFromState(state,id);
 if(!note)throw Error('XHS_SSR_NOTE_MISSING');
 const title=String(note.title||'').trim().slice(0,180);
 const description=String(note.desc||'').trim().slice(0,5500);
 const images=photos(note);
 if(!title&&!description&&!images.length)throw Error('XHS_SSR_NOTE_EMPTY');
 const user=note.user&&typeof note.user==='object'?note.user:{};
 return {
  title,description,images,
  author:String(user.nickname||user.nickName||'').slice(0,120),
  noteType:String(note.type||'normal').slice(0,20),
  sourceUrl:url,
  mode:'public-ssr-initial-state',
  partial:!description||images.length===0
 };
}
