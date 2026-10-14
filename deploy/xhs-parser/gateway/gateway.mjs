import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';

const PORT=Number(process.env.PORT||8788);
const TOKEN=String(process.env.PARSER_TOKEN||'');
const UPSTREAM=String(process.env.UPSTREAM_URL||'http://parser:5556/xhs/detail');
const MAX_REQUEST=16000;
const MAX_RESPONSE=1200000;
const HOSTS=new Set(['www.xiaohongshu.com','xiaohongshu.com','m.xiaohongshu.com','xhslink.com','www.xhslink.com','xhslink.cn','www.xhslink.cn']);
let active=0;

if(TOKEN.length<32)throw Error('PARSER_TOKEN must contain at least 32 characters');

function json(res,status,value){
 const body=JSON.stringify(value);
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store','x-content-type-options':'nosniff'});
 res.end(body);
}
function authorized(req){
 const supplied=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 const a=Buffer.from(supplied),b=Buffer.from(TOKEN);
 return a.length===b.length&&a.length>0&&timingSafeEqual(a,b);
}
function publicXhsUrl(raw){
 let url;try{url=new URL(String(raw||''))}catch{return null}
 if(!HOSTS.has(url.hostname.toLowerCase())||url.username||url.password||url.port)return null;
 if(url.protocol==='http:'&&/^(?:www\.)?xhslink\.c(?:om|n)$/.test(url.hostname.toLowerCase()))url.protocol='https:';
 return url.protocol==='https:'?url.toString():null;
}
async function readBody(req){
 const chunks=[];let size=0;
 for await(const chunk of req){
  size+=chunk.length;if(size>MAX_REQUEST)throw Error('REQUEST_TOO_LARGE');
  chunks.push(chunk);
 }
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

createServer(async(req,res)=>{
 if(req.method==='GET'&&req.url==='/health')return json(res,200,{ok:true,service:'xhs-parser-gateway'});
 if(req.method!=='POST'||req.url!=='/xhs/detail')return json(res,404,{error:'NOT_FOUND'});
 if(!authorized(req))return json(res,401,{error:'UNAUTHORIZED'});
 if(active>=2)return json(res,429,{error:'BUSY'});
 let body,url;
 try{body=await readBody(req);url=publicXhsUrl(body?.url);if(!url)throw Error('INVALID_XHS_URL')}
 catch(error){return json(res,error?.message==='REQUEST_TOO_LARGE'?413:400,{error:String(error?.message||'INVALID_JSON')})}
 active++;
 try{
  const upstream=await fetch(UPSTREAM,{
   method:'POST',signal:AbortSignal.timeout(50000),redirect:'error',
   headers:{'content-type':'application/json','accept':'application/json'},
   body:JSON.stringify({url,download:false,check_record:false})
  });
  const type=String(upstream.headers.get('content-type')||'').toLowerCase();
  const bytes=Buffer.from(await upstream.arrayBuffer());
  if(bytes.length>MAX_RESPONSE)return json(res,502,{error:'UPSTREAM_RESPONSE_TOO_LARGE'});
  if(!type.includes('json'))return json(res,502,{error:'UPSTREAM_BAD_FORMAT'});
  res.writeHead(upstream.status,{'content-type':'application/json; charset=utf-8','content-length':bytes.length,'cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(bytes);
 }catch(error){json(res,error?.name==='TimeoutError'?504:502,{error:'UPSTREAM_UNAVAILABLE'})}
 finally{active--}
}).listen(PORT,'0.0.0.0',()=>process.stdout.write(`xhs-parser-gateway listening on ${PORT}\n`));
