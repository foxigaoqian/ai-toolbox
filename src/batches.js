import {parseAiResponse,getSession,reserveQuota,refundQuota,sendJson} from './generation.js';
const BATCH_TOOL_IDS=new Set(['tool-03','tool-12']);
const uuid=()=>crypto.randomUUID();
const date=()=>new Date().toISOString().slice(0,10);
function accept(data){if(!data||typeof data!=='object')return null;const id=String(data.tool_id||'');if(!BATCH_TOOL_IDS.has(id))return null;const titles=Array.isArray(data.titles)?data.titles:null;if(!titles||titles.length<2||titles.length>4)return null;const lines=titles.map(x=>String(x).trim());if(lines.some(x=>x.length<3||x.length>320))return null;return {tool_id:id,titles:lines};}
async function create(req,env){
 if(!(req.headers.get('content-type')||'').includes('application/json'))return sendJson({error:'INVALID_TYPE'},415);
 let input;try{input=accept(await req.json());}catch{}
 if(!input)return sendJson({error:'INVALID_BATCH',message:'请提交2到4个不同标题，每个3到320字'},422);
 if(!env.BATCH_QUEUE)return sendJson({error:'QUEUE_NOT_CONFIGURED'},503);
 const session=await getSession(req,env,true);
 let global=0,personal=0;
 try{
  for(let i=0;i<input.titles.length;i++){
   if(!await reserveQuota(env.DB,'global:ai',30))throw Error('今天公共 AI 额度不足，请减少生成数量或明天再来');
   global++;
   if(!await reserveQuota(env.DB,'session:batch:'+session.id,6))throw Error('当前浏览器今日批量生成已到达6篇上限');
   personal++;
  }
  const id=uuid();
  const jobs=input.titles.map((prompt,i)=>({id:uuid(),batch_id:id,item_index:i,prompt}));
  const stmts=[env.DB.prepare('INSERT INTO batches(id,owner,tool_id,total,status) VALUES(?,?,?,?,?)').bind(id,session.id,input.tool_id,jobs.length,'queued')];
  for(const j of jobs)stmts.push(env.DB.prepare('INSERT INTO batch_items(id,batch_id,item_index,prompt) VALUES(?,?,?,?)').bind(j.id,id,j.item_index,j.prompt));
  await env.DB.batch(stmts);
  try{await env.BATCH_QUEUE.sendBatch(jobs.map(j=>({body:{itemId:j.id,batchId:id}})));}
  catch(e){await env.DB.prepare("UPDATE batches SET status='failed' WHERE id=?").bind(id).run();throw e;}
  return sendJson({ok:true,batch_id:id,status:'queued',total:jobs.length,poll:'/api/batches/'+id},202,session.cookie);
 }catch(e){
  for(let i=0;i<global;i++)await refundQuota(env.DB,'global:ai');
  for(let i=0;i<personal;i++)await refundQuota(env.DB,'session:batch:'+session.id);
  return sendJson({error:'BATCH_REJECTED',message:String(e?.message||e).slice(0,170)},429,session.cookie);
 }
}
async function listing(req,env){
 const s=await getSession(req,env,false);if(!s)return sendJson({ok:true,batches:[]});
 const d=await env.DB.prepare('SELECT id,tool_id,status,total,completed,failed,created_at FROM batches WHERE owner=? ORDER BY created_at DESC,id DESC LIMIT 25').bind(s.id).all();
 return sendJson({ok:true,batches:d.results||[]});
}
async function detail(req,env,id){
 const s=await getSession(req,env,false);if(!s)return sendJson({error:'NOT_FOUND'},404);
 const b=await env.DB.prepare('SELECT id,tool_id,status,total,completed,failed,created_at FROM batches WHERE id=? AND owner=?').bind(id,s.id).first();
 if(!b)return sendJson({error:'NOT_FOUND'},404);
 const list=await env.DB.prepare('SELECT b.id,b.item_index,b.prompt,b.status,b.work_id,b.error,w.title,w.body,w.tags FROM batch_items b LEFT JOIN works w ON b.work_id=w.id AND w.owner=? WHERE b.batch_id=? ORDER BY b.item_index').bind(s.id,id).all();
 return sendJson({ok:true,batch:b,items:(list.results||[]).map(x=>({...x,tags:x.tags?JSON.parse(x.tags):[]}))});
}
export async function handleBatchApi(req,env){
 const p=new URL(req.url).pathname;
 if(p==='/api/batches'&&req.method==='POST')return create(req,env);
 if(p==='/api/batches'&&req.method==='GET')return listing(req,env);
 const m=p.match(/^\/api\/batches\/([a-f0-9-]{36})$/);if(m&&req.method==='GET')return detail(req,env,m[1]);
 return null;
}
async function consumeOne(msg,env){
 const {itemId,batchId}=msg.body||{};
 if(typeof itemId!=='string'||typeof batchId!=='string')return;
 const item=await env.DB.prepare('SELECT i.id,i.prompt,i.status,i.attempts,b.owner,b.tool_id FROM batch_items i JOIN batches b ON b.id=i.batch_id WHERE i.id=? AND i.batch_id=?').bind(itemId,batchId).first();
 if(!item||item.status==='done'||item.status==='failed')return;
 const claimed=await env.DB.prepare("UPDATE batch_items SET status='running',attempts=attempts+1 WHERE id=? AND status IN ('queued','retry','running')").bind(itemId).run();
 if(!claimed.meta?.changes)return;
 await env.DB.prepare("UPDATE batches SET status='running',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(batchId).run();
 try{
  const instruction='用下列主题创作中文原创图文文案，返回合法 JSON，对象含 title、body（200-400字，分段）、tags（3至5个）。不要 Markdown 围栏，不编造具体事实或评价。创作主题：'+item.prompt;
  const o=await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast',{messages:[{role:'system',content:'你是专业中文图文内容创作者。必须输出 JSON，避免虚构或夸大。'},{role:'user',content:instruction}],max_tokens:1000,temperature:0.7});
  const d=parseAiResponse(o?.response||o?.choices?.[0]?.message?.content,item.prompt);
  const workId=uuid();
  await env.DB.batch([
   env.DB.prepare('INSERT INTO works(id,owner,tool_id,prompt,title,body,tags) VALUES(?,?,?,?,?,?,?)').bind(workId,item.owner,item.tool_id,item.prompt,d.title,d.body,JSON.stringify(d.tags)),
   env.DB.prepare("UPDATE batch_items SET status='done',work_id=?,error=NULL WHERE id=?").bind(workId,itemId),
   env.DB.prepare("UPDATE batches SET completed=completed+1,status=CASE WHEN completed+1+failed>=total THEN 'done' ELSE 'running' END,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(batchId)
  ]);
 }catch(e){
  const exhausted=item.attempts>=2;
  if(!exhausted){await env.DB.prepare("UPDATE batch_items SET status='retry',error=? WHERE id=?").bind(String(e?.message||e).slice(0,170),itemId).run();msg.retry({delaySeconds:10});}
  else{
   await env.DB.batch([
    env.DB.prepare("UPDATE batch_items SET status='failed',error=? WHERE id=?").bind(String(e?.message||e).slice(0,170),itemId),
    env.DB.prepare("UPDATE batches SET failed=failed+1,status=CASE WHEN completed+failed+1>=total THEN 'done' ELSE 'running' END,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(batchId)
   ]);
   await refundQuota(env.DB,'global:ai');await refundQuota(env.DB,'session:batch:'+item.owner);
  }
 }
}
export async function consumeBatch(batch,env){
 for(const message of batch.messages){try{await consumeOne(message,env);}catch{message.retry({delaySeconds:20});}}
}
