import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Script} from 'node:vm';
for(const file of ['src/index.js','src/generation.js','src/batches.js','src/provider.js','src/editor-client.js','src/images.js','src/xhs.js','src/xhs-client.js','src/xhs-ssr.js','src/xhs-external.js'])execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
const source=readFileSync('src/index.js','utf8');
const a=source.indexOf('const TOOLS=')+'const TOOLS='.length;
const b=source.indexOf(';\nconst HTML=',a);
const tools=JSON.parse(source.slice(a,b));
assert.equal(tools.length,46);
assert.equal(new Set(tools.map(t=>t.id)).size,46);
assert.deepEqual(['p1','p2','p3','p4'].map(c=>tools.filter(t=>t.category===c).length),[17,11,13,5]);
assert.equal(tools.filter(x=>x.status==='text-ready').length,6);
assert.equal(tools.filter(x=>x.status==='batch-ready').length,2);
assert.equal(tools.filter(x=>x.status==='ready').length,10);
const start=source.indexOf('const HTML=')+'const HTML='.length,stop=source.indexOf(';\nconst headers=',start);
const html=JSON.parse(source.slice(start,stop));
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.ok(scripts.length);
new Script(scripts.at(-1)[1],{filename:'client.js'});
assert.ok(html.includes('my-works'));
assert.ok(html.includes('/editor-app.js'));
const {EDITOR_CLIENT}=await import('../src/editor-client.js');
new Script(EDITOR_CLIENT,{filename:'editor-app.js'});
assert.ok(EDITOR_CLIENT.includes("AI视觉底图 + 浏览器精准中文铺字"));
assert.ok(EDITOR_CLIENT.includes("'/api/assets" )||EDITOR_CLIENT.includes("/api/assets"));
assert.ok(EDITOR_CLIENT.includes('高级杂志暖'));

const {XHS_CLIENT}=await import('../src/xhs-client.js');
new Script(XHS_CLIENT,{filename:'xhs-app.js'});
assert.ok(XHS_CLIENT.includes('xhs-image-mode'));
assert.ok(XHS_CLIENT.includes('xhs-style-lock'));
assert.ok(XHS_CLIENT.includes("form.append('mode'"));
assert.ok(XHS_CLIENT.includes('xhs_intent_rewrite'));
assert.ok(XHS_CLIENT.includes('语义图生图'));
assert.ok(XHS_CLIENT.includes('实际加载成功才计入成功数'));
assert.ok(XHS_CLIENT.includes('remix-reference.jpg'));
assert.ok(XHS_CLIENT.includes("canvas.toBlob(resolve,'image/jpeg'"));
assert.ok(readFileSync('src/images.js','utf8').includes('IMAGE_UPSTREAM_UNAVAILABLE'));
assert.ok(readFileSync('src/images.js','utf8').includes('真正的图生图语义重绘'));


assert.ok(html.includes('/xhs-app.js'));
assert.ok(html.includes('window.xhsTransferToEditor'));
const {parseXhsHtml,extractSharedUrl,extractShareEnvelope}=await import('../src/xhs.js');
assert.equal(extractSharedUrl('小红书公开笔记 http://xhslink.com/a/abc123 看看'),'https://xhslink.com/a/abc123');
assert.deepEqual(extractShareEnvelope('35 【订婚后有必要住一起吗 - 圆圆 | 小红书 - 你的生活兴趣社区】 😆 https://www.xiaohongshu.com/discovery/item/6ac8924f000000001203c686'),{title:'订婚后有必要住一起吗',author:'圆圆'});
assert.equal(extractSharedUrl('https://localhost/admin'),null);
const fixture='<meta property="og:title" content="通勤整理技巧 - 小红书">'+
  '<meta content="整理桌面、规划早晨，创造更舒适的一天" name="description">'+
  '<meta property="og:image" content="https://sns-webpic-qc.xhscdn.com/image-test.webp">'+
  '<script type="application/ld+json">'+JSON.stringify({headline:'生活指南',articleBody:'每天15分钟整理桌面',image:'https://sns-webpic-qc.xhscdn.com/image2.webp'})+'</script>';

const {parseXhsSsr,extractInitialState,canonicalShareUrl}=await import('../src/xhs-ssr.js');
const noteId='6ab923d4000000001402dc11';
const noteURL='https://www.xiaohongshu.com/discovery/item/'+noteId+'?source=webshare&xsec_token=exampleShare%3D&xsec_source=pc_share';
const src={
 global:{example:null,literal:'undefined stays in strings'},
 note:{noteDetailMap:{[noteId]:{note:{
   noteId,title:'真心想录用你的公司，会释放这些信号',
   desc:'发现招聘公司认真对待候选人的几个细节',
   user:{nickname:'深耕表达力'},
   imageList:[
    {urlDefault:'https://sns-webpic-qc.xhscdn.com/photo-cover.jpg'},
    {infoList:[{imageScene:'WB_DFT',url:'https://sns-webpic-qc.xhscdn.com/photo2.jpg'}]}
   ]
 }}}}
};
const rawState=JSON.stringify(src).replace('"example":null','"example":undefined');
const ssrHtml='<script>window.__INITIAL_STATE__='+rawState+';</script>';
const extracted=parseXhsSsr(ssrHtml,noteURL);
assert.equal(extracted.title,'真心想录用你的公司，会释放这些信号');
assert.equal(extracted.author,'深耕表达力');
assert.equal(extracted.images.length,2);
assert.ok(extracted.description.includes('招聘公司'));
assert.equal(extractInitialState(ssrHtml).global.example,null);
assert.equal(extractInitialState(ssrHtml).global.literal,'undefined stays in strings');
assert.equal(canonicalShareUrl(noteURL,'explore'),'https://www.xiaohongshu.com/explore/'+noteId+'?xsec_token=exampleShare%3D&xsec_source=pc_share');
assert.throws(()=>parseXhsSsr('<title>想了解些什么？</title>',noteURL),/XHS_SSR_ABSENT/);

const note=parseXhsHtml(fixture,'https://www.xiaohongshu.com/explore/123');
assert.ok(note.title.includes('通勤整理技巧'));
assert.ok(note.description.includes('每天15分钟整理桌面')||note.description.includes('整理桌面'));
assert.ok(note.images.length>=2);
const empty=parseXhsHtml('<html><head><title>Login</title></head></html>');
assert.equal(empty.description,'');
assert.equal(empty.images.length,0);
const loginHtml='<meta property="og:title" content="想了解些什么？">';
const misleading=parseXhsHtml(loginHtml,'https://www.xiaohongshu.com/login?redirectPath=%2Fdiscovery%2Fitem%2F123');
assert.equal(misleading.title,'');
assert.equal(misleading.description,'');
assert.equal(misleading.images.length,0);
const shell=parseXhsHtml(loginHtml,'https://www.xiaohongshu.com/discovery/item/123');
assert.equal(shell.title,'');
const boilerplate=parseXhsHtml('<meta property="og:title" content="想了解些什么？"><meta property="og:description" content="在小红书，分享照片和视频，分享购物心得，记录生活故事，和最会生活的人做朋友。"><meta property="og:image" content="https://ci.xiaohongshu.com/generic.png">','https://www.xiaohongshu.com/discovery/item/123');
assert.equal(boilerplate.title,'');
assert.equal(boilerplate.description,'');
assert.equal(boilerplate.images.length,1);
assert.equal(boilerplate.mode,'generic-page-shell');

const {handleXhsApi}=await import('../src/xhs.js');
const cachedRecord={title:'结婚只办答谢宴是动了谁的蛋糕？',description:'公开笔记内容',images:['https://sns-webpic-qc.xhscdn.com/a.webp'],mode:'browser-public-note'};
const mockDb={prepare(sql){return {bind(...params){return {
  async first(){if(sql.includes('FROM xhs_note_cache'))return {result_json:JSON.stringify(cachedRecord)};throw Error('Unexpected D1 query')},
  async run(){throw Error('Cached lookup must not consume quota')}
}}}}};
const cachedResponse=await handleXhsApi(new Request('https://demo.invalid/api/xhs/resolve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.xiaohongshu.com/discovery/item/6acb73cb000000001a03163f?xsec_token=sample'})}),{DB:mockDb});
const cachePayload=await cachedResponse.json();
assert.equal(cachedResponse.status,200);
assert.equal(cachePayload.cached,true);
assert.equal(cachePayload.images.length,1);
assert.ok(cachePayload.images[0].startsWith('/api/xhs/image?note=6acb73cb000000001a03163f&index=0'));
const cachedImageResponse=await handleXhsApi(new Request('https://demo.invalid/api/xhs/image?note=6acb73cb000000001a03163f&index=0'),{DB:mockDb,ASSETS:{async get(){return {body:new Uint8Array([82,73,70,70]),httpMetadata:{contentType:'image/webp'}}}}});
assert.equal(cachedImageResponse.status,200);
assert.equal(cachedImageResponse.headers.get('content-type'),'image/webp');
assert.equal(cachePayload.title,cachedRecord.title);

const {normalizeEasyDownNote,safeMediaUrl,parseWithEasyDown}=await import('../src/xhs-external.js');
const providerSample={
 status:200,
 data:{media:{title:'示例图文',images:[{url:'https://sns-i11.rednotecdn.com/photo.webp'}]},
 platformData:{note_id:'6acb73cb000000001a03163f',title:'结婚只办答谢宴是动了谁的蛋糕？',desc:'婚礼不接亲，直接办答谢宴也可以。',
 user:{nickname:'我不叫，喂'},images_list:[{original:'http://sns-i11.rednotecdn.com/photo.webp'}]}
 }};
const normalized=normalizeEasyDownNote(providerSample,'https://www.xiaohongshu.com/discovery/item/6acb73cb000000001a03163f');
assert.equal(normalized.title,'结婚只办答谢宴是动了谁的蛋糕？');
assert.equal(normalized.images.length,1);
assert.ok(normalized.images[0].startsWith('https://sns-i11.rednotecdn.com/'));
assert.equal(normalized.mode,'third-party-easydown');
assert.equal(safeMediaUrl('https://localhost/img.jpg'),null);
const previousFetch=globalThis.fetch;
try{
 let upstreamRequests=0;
 globalThis.fetch=async(url,options)=>{
  upstreamRequests++;
  assert.equal(url,'https://api.easydown.org/api/v1/platforms/xiaohongshu/parse');
  assert.equal(options.headers.authorization,'Bearer testEasyDown');
  assert.equal(JSON.parse(options.body).url,'https://www.xiaohongshu.com/discovery/item/6acb73cb000000001a03163f');
  return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>providerSample};
 };
 const parsed=await parseWithEasyDown({EASYDOWN_API_KEY:'testEasyDown'},'https://www.xiaohongshu.com/discovery/item/6acb73cb000000001a03163f');
 assert.equal(upstreamRequests,1);
 assert.equal(parsed.images.length,1);
}finally{globalThis.fetch=previousFetch;}

const xhsSource=readFileSync('src/xhs.js','utf8');
assert.ok(xhsSource.includes('CF_BROWSER_API_TOKEN'));
assert.ok(xhsSource.includes('browserCooldown'));



const cfg=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
assert.equal(cfg.ai.binding,'AI');
assert.equal(cfg.d1_databases[0].binding,'DB');
assert.equal(cfg.r2_buckets[0].binding,'ASSETS');
assert.equal(cfg.queues.producers[0].binding,'BATCH_QUEUE');
assert.equal(cfg.browser.binding,'BROWSER');
const {parseAiResponse,xhsRewriteRequest}=await import('../src/generation.js');
const structured=parseAiResponse({title:'测试',body:'这是一段来自结构化响应的正文。',tags:['示例']},'提示词');
assert.equal(structured.body,'这是一段来自结构化响应的正文。');
assert.equal(parseAiResponse('{"title":"另一个","body":"来自 JSON 文本的完整正文内容","tags":[]}','原文').title,'另一个');
const rewriteRequest=xhsRewriteRequest({source_title:'结婚只办答谢宴',source_body:'我们只办答谢宴，不接亲，也不设置传统流程。重点是和真正关心我们的人分享喜悦。',direction:'换成更自然的第一人称表达'});
assert.ok(rewriteRequest.system.includes('保留原意、重新表达'));
assert.ok(rewriteRequest.user.includes('不得跑题'));
assert.ok(rewriteRequest.user.includes('结婚只办答谢宴'));
const {chatEndpoint,imageEndpoint,imageEditEndpoint,remakeImage,providerStatus,generateText,generateImage,decodeGatewaySSE,decodeGatewayText}=await import('../src/provider.js');
assert.equal(decodeGatewaySSE('data: {"choices":[{"delta":{"content":"你好"}}]}\\n\\ndata: {"choices":[{"delta":{"content":"，秋天"}}]}\\n\\ndata: [DONE]'.replaceAll('\\n','\n')),'你好，秋天');
assert.equal(decodeGatewayText({choices:[{message:{content:'普通 JSON 文案'}}]}),'普通 JSON 文案');
assert.equal(chatEndpoint('https://api.example.com/v1'),'https://api.example.com/v1/chat/completions');
assert.equal(chatEndpoint('https://api.example.com'),'https://api.example.com/v1/chat/completions');
assert.equal(chatEndpoint('https://api.example.com/v1/chat/completions'),'https://api.example.com/v1/chat/completions');
assert.throws(()=>chatEndpoint('http://localhost:8787/v1'));
assert.equal(providerStatus({}).provider,'workers-ai');
assert.equal(providerStatus({AI_TEXT_API_KEY:'textSecret',AI_IMAGE_API_KEY:'imageSecret',AI_BASE_URL:'https://api.example.com/v1',AI_TEXT_MODEL:'deepseek-v4.1-flash',AI_IMAGE_MODEL:'gpt-image-2.5'}).textConfigured,true);
assert.equal(providerStatus({AI_TEXT_API_KEY:'textSecret',AI_IMAGE_API_KEY:'imageSecret',AI_BASE_URL:'https://api.example.com/v1'}).imageConfigured,true);
assert.equal(providerStatus({AI_API_KEY:'legacy',AI_BASE_URL:'https://api.example.com/v1'}).gatewayConfigured,true);
assert.equal(providerStatus({AI_TEXT_API_KEY:'onlyText',AI_BASE_URL:'https://api.example.com/v1'}).imageConfigured,false);
assert.equal(imageEndpoint('https://api.example.com/v1'),'https://api.example.com/v1/images/generations');
assert.equal(imageEditEndpoint('https://api.example.com/v1'),'https://api.example.com/v1/images/edits');
assert.throws(()=>imageEndpoint('http://localhost/v1'));
let fakeCalls=[];const realFetch=globalThis.fetch;
try{
 globalThis.fetch=async (url,opts)=>{
  fakeCalls.push({url,authorization:opts.headers.authorization,body:opts.body instanceof FormData?{model:opts.body.get('model'),hasImage:!!opts.body.get('image')}:JSON.parse(opts.body),redirect:opts.redirect});
  if(url.endsWith('/images/generations')||url.endsWith('/images/edits'))return {ok:true,json:async()=>({data:[{b64_json:'a'.repeat(60)}]})};
  return {ok:true,json:async()=>({choices:[{message:{content:'{"title":"真实回复"}'}}]})};
 };
 const env={AI_TEXT_API_KEY:'onlyText',AI_IMAGE_API_KEY:'onlyImage',AI_BASE_URL:'https://api.example.com/v1',AI_TEXT_MODEL:'deepseek-v4.1-flash',AI_IMAGE_MODEL:'gpt-image-2.5'};
 await generateText(env,'sys','input');
 await generateImage(env,'a peaceful mountain landscape');
 assert.equal(fakeCalls[0].authorization,'Bearer onlyText');
 assert.equal(fakeCalls[0].redirect,'manual');
 assert.equal(fakeCalls[1].redirect,'manual');
 assert.equal(fakeCalls[0].body.model,'deepseek-v4.1-flash');
 assert.equal(fakeCalls[1].authorization,'Bearer onlyImage');
 const fakeFile=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4])],{type:'image/png'});
 fakeFile.name='reference.png';
 await remakeImage(env,fakeFile,'Create a new original version of this reference with cream colors and modern layout',{size:'1024x1536'});
 assert.ok(fakeCalls[2].url.endsWith('/images/edits'));
 assert.equal(fakeCalls[2].authorization,'Bearer onlyImage');
 assert.equal(fakeCalls[2].body.model,'gpt-image-2.5');
 assert.equal(fakeCalls[2].body.hasImage,true);

 assert.equal(fakeCalls[1].body.model,'gpt-image-2.5');
 assert.ok(fakeCalls[0].url.endsWith('/chat/completions'));
 assert.ok(fakeCalls[1].url.endsWith('/images/generations'));
}finally{globalThis.fetch=realFetch;}
assert.equal(tools.filter(x=>x.id==='tool-18'&&x.mode==='image-generate').length,1);
assert.equal(tools.filter(x=>x.mode==='multi-editor').length,2);
console.log('PASS: intent-preserving text remix, semantic image-to-image, verified result loading, R2 editor photos, separate text/image keys, Worker modules and bindings');
