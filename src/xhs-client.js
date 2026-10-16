export const XHS_CLIENT=String.raw`/**
 * Xiaohongshu intent-preserving remix workbench (browser).
 * Text remix and semantic image-to-image remix are deliberately separate flows.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let picked=[],serial=0;
const maxPhotos=9;

function warn(message){const x=$('xhs-message');if(!x)return;x.textContent=message;x.hidden=!message;}
function stateSummary(){const a=$('xhs-count');if(a)a.textContent=picked.filter(x=>x.chosen).length+' / '+picked.length+' 张已选择';}
function friendlyError(value,kind='通用'){
 const code=String(value||'');
 if(/GATEWAY_TIMEOUT|IMAGE_EDIT_TIMEOUT/.test(code))return kind+'生成超时，上游模型没有在规定时间内返回结果。本次不计为成功，请稍后只重试1张。';
 if(/HTTP_502/.test(code))return kind+'服务暂时不可用（网关502），本次没有生成完成。';
 if(/HTTP_429|DAILY_LIMIT/.test(code))return kind+'服务当前限流或今日额度已用完，请稍后再试。';
 if(/NETWORK|Failed to fetch|NetworkError/.test(code))return '网络连接中断，本次没有生成完成。';
 return code||kind+'生成失败';
}
function addPhotos(list){
 for(const item of list){
  if(picked.length>=maxPhotos)break;
  if(!item||!item.src||picked.some(x=>x.origin===item.origin))continue;
  picked.push({id:++serial,chosen:true,src:item.src,origin:item.origin||item.src,local:!!item.local,status:'idle'});
 }
 showPhotos();
}
function showPhotos(){
 const node=$('xhs-photos');if(!node)return;node.replaceChildren();
 if(!picked.length){node.innerHTML='<p class="form-hint">暂无参考图片。可先解析链接，或手动上传原图。</p>';stateSummary();return;}
 const wrapper=document.createElement('div');
 wrapper.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px';
 for(const item of picked){
  const frame=document.createElement('div');
  frame.style.cssText='min-width:0;display:flex;flex-direction:column;gap:8px;border:1px solid #dfe6f2;padding:9px;border-radius:13px;background:white';
  const label=document.createElement('label');label.style.cssText='display:flex;align-items:center;gap:7px;min-height:28px;cursor:pointer;font-size:12px;color:#59677d';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=item.chosen;
  checkbox.onchange=()=>{item.chosen=checkbox.checked;stateSummary();};
  const status=document.createElement('span');
  status.textContent=item.status==='working'?'正在理解并重绘…':item.remade?'已完成语义图生图':'选中这张原图';
  label.append(checkbox,status);frame.append(label);
  const comparison=document.createElement('div');
  comparison.style.cssText='display:grid;grid-template-columns:'+(item.remade?'1fr 1fr':'1fr')+';gap:7px';
  const original=document.createElement('div');original.innerHTML='<span style="display:block;font-size:10px;color:#8995a8;margin-bottom:4px">原图</span>';
  const image=document.createElement('img');image.src=item.src;image.alt='原始参考图片';image.loading='lazy';image.referrerPolicy='no-referrer';
  image.style.cssText='height:150px;width:100%;object-fit:cover;border-radius:8px;background:#f1f2f7';
  image.onerror=()=>{image.alt='原图无法预览，请重新上传';};original.append(image);comparison.append(original);
  if(item.remade){
   const result=document.createElement('div');result.innerHTML='<span style="display:block;font-size:10px;color:#138b70;margin-bottom:4px">新表达</span>';
   const output=document.createElement('img');output.src=item.remade;output.alt='AI语义重绘图片';output.loading='lazy';
   output.style.cssText='height:150px;width:100%;object-fit:cover;border-radius:8px;background:#eaf7f1';result.append(output);comparison.append(result);
  }
  frame.append(comparison);
  if(item.remade){
   const actions=document.createElement('div');actions.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap';
   const view=document.createElement('a');view.href=item.remade;view.textContent='查看高清图';view.target='_blank';view.rel='noopener noreferrer';
   view.style.cssText='font-size:12px;color:#4b5adf;text-decoration:underline';actions.append(view);frame.append(actions);
  }
  wrapper.append(frame);
 }
 node.append(wrapper);stateSummary();
}
function clearPhotos(){for(const im of picked){if(im.local)URL.revokeObjectURL(im.src);}picked=[];showPhotos();}
function trimText(){return ($('xhs-source-text')?.value||'').trim();}
function rewritePayload(){
 return {
  tool_id:'tool-02',task:'xhs_intent_rewrite',
  source_title:($('xhs-source-title')?.value||'').trim(),
  source_body:trimText(),
  direction:($('xhs-copy-direction')?.value||'').trim()
 };
}
function showDraft(d){
 const area=$('xhs-output');if(!area)return;
 area.innerHTML='<section style="border:1px solid #dfe6f2;border-radius:14px;margin-top:14px;padding:16px"><h3 style="font-size:17px;margin:0 0 5px">文案复刻结果</h3>'+
 '<p class="form-hint">核心观点与信息链保留，标题、措辞和叙述方式已重新组织。请确认关键事实后再发布。</p>'+
 '<label class="form-label" for="xhs-draft-title">新标题</label><input class="field" id="xhs-draft-title" maxlength="130" value="'+esc(d.title||'')+'"/>'+
 '<label class="form-label" for="xhs-draft-body">新正文</label><textarea class="field field-area" id="xhs-draft-body" style="min-height:225px">'+esc(d.body||'')+'</textarea>'+
 '<p class="form-hint">标签：'+esc((d.tags||[]).join(' · '))+'</p>'+
 '<div class="actions"><button class="primary-btn" id="xhs-to-editor">用新图和新文案制作套图</button>'+
 '<button class="ghost-btn" id="xhs-copy">复制新文案</button><button class="ghost-btn" id="xhs-save-edit">保存修改</button></div>'+
 '<p id="xhs-draft-status" class="form-hint" aria-live="polite"></p></section>';
 $('xhs-to-editor').onclick=()=>transfer($('xhs-draft-title').value,$('xhs-draft-body').value);
 $('xhs-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('xhs-draft-title').value+'\n\n'+$('xhs-draft-body').value);$('xhs-draft-status').textContent='已复制';}catch{$('xhs-draft-status').textContent='自动复制失败，请手动复制';}};
 $('xhs-save-edit').onclick=async()=>{
  const title=$('xhs-draft-title').value.trim(),body=$('xhs-draft-body').value.trim();
  if(!title||!body){$('xhs-draft-status').textContent='标题与正文不能为空';return;}
  try{const r=await fetch('/api/works/'+d.id,{method:'PATCH',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({title,body})}),j=await r.json();if(!r.ok)throw Error(j.message||j.error);$('xhs-draft-status').textContent='修改已保存到我的作品';}catch(e){$('xhs-draft-status').textContent='保存失败：'+friendlyError(e.message,'文案');}
 };
}
function transfer(title,body){
 const photos=picked.filter(x=>x.chosen).map(x=>x.remade||x.src);
 const style=$('xhs-style-lock')?.value||'cream';
 const settings={style:style==='auto'?'cream':style,layerMode:$('xhs-image-mode')?.value==='poster'?'image-card':'text-overlay'};
 if(window.xhsTransferToEditor)window.xhsTransferToEditor(title,body,photos,settings);
 else warn('图文编辑器尚未加载，刷新页面后重试');
}
async function resolve(){
 const raw=$('xhs-share-link').value.trim();if(!raw){warn('请先粘贴公开小红书分享链接');return;}
 const button=$('xhs-load');button.disabled=true;button.textContent='正在解析公开笔记…';warn('');
 try{
  const r=await fetch('/api/xhs/resolve',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({url:raw})});
  const d=await r.json();if(!r.ok)throw Error(d.message||d.error||'解析失败');
  $('xhs-source-title').value=d.title||'';$('xhs-source-text').value=d.description||'';clearPhotos();
  addPhotos((d.images||[]).map(u=>({src:u.startsWith('/api/xhs/image?')?u:'/api/xhs/image?url='+encodeURIComponent(u),origin:u,local:false})));
  const n=(d.images||[]).length;
  const titleOnly=d.mode==='share-text-title-only';
  $('xhs-source-summary').textContent=(titleOnly?'已识别分享标题':'解析完成')+' · '+(d.description?.length||0)+' 字文案 · '+n+' 张图片'+(d.partial?'（部分素材未获取）':'');
  if(titleOnly)warn('小红书没有公开返回这条笔记的正文和图片；标题已从你粘贴的分享文字识别，正文保持为空，避免生成错误内容。请手动补充原文和原图。');
  else if(!d.description)warn('只获取到部分信息，请手动补充参考文案。');else if(!n)warn('文字已获取，但图片未获取，可手动上传原图。');
 }catch(e){warn(friendlyError(e.message,'解析')+' 可在下方手动粘贴文案或上传图片。');$('xhs-source-summary').textContent='未能自动获取公开笔记';}
 finally{button.disabled=false;button.textContent='解析公开笔记';}
}
async function rewrite(){
 const payload=rewritePayload();
 if(!payload.source_title&&!payload.source_body){warn('请先解析链接或手动填写参考标题/文案');return;}
 const b=$('xhs-rewrite');b.disabled=true;b.textContent='正在理解原文并重写…';warn('');
 const result=$('xhs-output');result.innerHTML='<p class="note">文案任务：正在提取核心观点、事实锚点和信息顺序，再重新组织表达。</p>';
 try{
  const r=await fetch('/api/generate',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(payload)});
  const d=await r.json();if(!r.ok)throw Error(d.detail||d.message||d.error||'生成失败');showDraft(d);
 }catch(e){result.innerHTML='<p class="note warn"><strong>文案复刻未完成：</strong>'+esc(friendlyError(e.message,'文案'))+'</p>';}
 finally{b.disabled=false;b.textContent='生成新文案';}
}
function remakePrompt(index){
 const direction=($('xhs-visual-direction')?.value||'').trim();
 const title=$('xhs-draft-title')?.value.trim()||$('xhs-source-title')?.value.trim()||'原创图文';
 const body=$('xhs-draft-body')?.value.trim()||$('xhs-source-text')?.value.trim()||'';
 const paragraphs=body.split(/\n\s*\n|\n/g).map(x=>x.trim()).filter(Boolean);
 const page=paragraphs[index]||paragraphs[index%Math.max(1,paragraphs.length)]||body.slice(0,180);
 const mode=$('xhs-image-mode')?.value||'semantic';
 const palette=$('xhs-style-lock')?.selectedOptions[0]?.textContent||'自动提取并换一种视觉语言';
 const form=$('xhs-visual-form')?.value||'auto';
 const autoForms=['杂志编辑设计','纸张拼贴海报','叙事插画','生活方式场景','极简信息卡','概念摄影'];
 const forms={editorial:'杂志编辑设计',collage:'纸张拼贴海报',illustration:'叙事插画',scene:'生活方式场景',minimal:'极简信息卡',photo:'概念摄影'};
 const chosenForm=form==='auto'?autoForms[index%autoForms.length]:(forms[form]||forms.editorial);
 const variation=$('xhs-variation')?.value||'balanced';
 const variationHint=variation==='bold'?'视觉差异要明显：改变构图、媒介和色彩关系，但绝不能改变原图想表达的意思。':variation==='faithful'?'保留原图的信息层级与阅读顺序，但所有视觉元素重新设计。':'保留核心意图和信息层级，同时明显更换构图、色彩和表现媒介。';
 const textPolicy=mode==='poster'?'生成完整成品海报；只使用一个简短中文标题，正文不要直接画进图里。':'生成完整的语义视觉，不是空白背景；用人物、物体、场景或视觉隐喻表达含义，并留出一个干净标题区供后续精准铺字。';
 return '原图必须作为主要图生图参考。先在内部理解原图的传播意图、主体关系、信息优先级和情绪，再重新设计。'+variationHint+' 本张改用【'+chosenForm+'】，系列配色为【'+palette+'】。'+textPolicy+' 新作品主题：'+title.slice(0,70)+'。本页要表达：'+page.slice(0,220)+'。补充要求：'+direction.slice(0,420);
}
async function fileForRemix(item){
 const response=await fetch(item.src,{credentials:'same-origin'});if(!response.ok)throw Error('参考图片读取失败，请重新上传');
 const source=await response.blob();
 if(!['image/png','image/jpeg','image/webp','image/avif'].includes(source.type))throw Error('参考图仅支持 JPG/PNG/WebP/AVIF');
 if(source.size>16*1024*1024)throw Error('参考图过大，请先压缩到 16MB 以下');
 let img;try{img=await createImageBitmap(source);}catch{throw Error('图片格式无法解码，请换 JPG 或 PNG');}
 try{
  const maxSide=1280,ratio=Math.min(1,maxSide/Math.max(img.width,img.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  let jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));if(!jpeg)throw Error('图片压缩失败');
  if(jpeg.size>1200000)jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.68));
  if(!jpeg||jpeg.size>3900000)throw Error('参考图片压缩后仍然过大');
  return new File([jpeg],'remix-reference.jpg',{type:'image/jpeg'});
 }finally{img.close?.();}
}
function waitForImage(url){
 return new Promise((resolve,reject)=>{
  const img=new Image(),timer=setTimeout(()=>{img.src='';reject(Error('生成结果图片加载超时'));},15000);
  img.onload=()=>{clearTimeout(timer);img.naturalWidth>0?resolve():reject(Error('生成结果图片无效'));};
  img.onerror=()=>{clearTimeout(timer);reject(Error('生成结果图片无法读取'));};img.src=url;
 });
}
async function redrawSelected(){
 const selected=picked.filter(x=>x.chosen).slice(0,3);if(!selected.length){warn('请先勾选要图生图的参考图片');return;}
 const remaining=picked.filter(x=>x.chosen).length-selected.length;
 const button=$('xhs-redraw'),progress=$('xhs-remake-progress');button.disabled=true;warn('');
 let successful=0,failed=[],stopped=false;
 for(let i=0;i<selected.length;i++){
  const item=selected[i];item.status='working';showPhotos();button.textContent='正在图生图 '+(i+1)+'/'+selected.length;
  progress.innerHTML='<p class="note"><strong>图片任务：</strong>正在理解第 '+(i+1)+' 张原图的表达意图，并转换构图与风格。</p>';
  try{
   const form=new FormData();form.append('reference',await fileForRemix(item));form.append('prompt',remakePrompt(picked.indexOf(item)));
   form.append('size','1024x1536');form.append('mode',$('xhs-image-mode')?.value||'semantic');
   const res=await fetch('/api/images/remix',{method:'POST',credentials:'same-origin',body:form});
   let data;try{data=await res.json();}catch{data={error:'IMAGE_BAD_RESPONSE',message:'图片服务器没有返回有效响应'};}
   if(!res.ok){
    const code=String(data.detail||data.error||data.message||'图片生成失败');
    failed.push('第'+(i+1)+'张：'+friendlyError(code,'图片'));
    if(/HTTP_(?:500|502|503|504)|TIMEOUT|NETWORK/.test(code)){stopped=true;failed.push('已停止剩余图片任务，避免连续失败或重复扣费。');break;}
    continue;
   }
   if(!data.url)throw Error('图片模型未返回结果地址');
   await waitForImage(data.url);
   item.remade=data.url;item.saved=!!data.saved;item.remadeMode=data.mode||'semantic';item.status='done';successful++;showPhotos();
  }catch(e){
   item.status='failed';failed.push('第'+(i+1)+'张：'+friendlyError(e?.message,'图片'));
   if(/fetch|Network|网络|超时|TIMEOUT/i.test(String(e?.message||e))){stopped=true;failed.push('已暂停剩余生成，避免重复扣费。');break;}
  }
 }
 selected.filter(x=>x.status==='working').forEach(x=>x.status='idle');showPhotos();
 const failedCount=failed.filter(x=>/^第\d/.test(x)).length;
 progress.innerHTML='<section style="border:1px solid '+(failedCount?'#f1d5a7':'#cfe7dd')+';border-radius:12px;padding:12px"><strong>图片复刻结果：'+successful+' 张成功，'+failedCount+' 张失败'+(stopped?'，后续已暂停':'')+'</strong>'+
 (failed.length?'<p class="form-hint" style="white-space:pre-wrap;margin-bottom:0">'+esc(failed.join('\n'))+'</p>':'<p class="form-hint" style="margin-bottom:0">成功结果已通过实际图片加载校验，可进入编辑器。</p>')+
 (remaining?'<p class="form-hint">另有 '+remaining+' 张未处理，单次最多3张。</p>':'')+'</section>';
 button.disabled=false;button.textContent='图生图复刻选中图片';
}

window.openXhsRemake=function({body}){
 picked=[];serial=0;
 body.innerHTML='<div class="note" style="display:flex;flex-wrap:wrap;gap:8px;background:#f5f4ff;border:1px solid #e6e4ff"><span>① 导入素材</span><span>② 改写文案</span><span>③ 按需重绘图片</span><span>④ 进入编辑器导出</span></div><p class="note"><strong>参考创作不是照搬。</strong> 文案保留核心观点与信息链后重新表达；图片读取原图意图后，用新的构图、媒介和风格重新呈现。</p>'+
 '<h3 style="margin:16px 0 9px;font-size:17px">步骤 1 · 导入参考内容</h3><label class="form-label" for="xhs-share-link">小红书笔记链接 / 分享文字</label><textarea id="xhs-share-link" class="field field-area" rows="2" style="min-height:70px" placeholder="粘贴小红书公开链接或整段分享文字"></textarea>'+
 '<div class="actions" style="margin-top:10px"><button class="primary-btn" id="xhs-load">解析公开笔记</button></div><p id="xhs-message" class="note warn" hidden></p><p id="xhs-source-summary" class="form-hint">等待解析；受限笔记也可以手动导入。</p>'+
 '<label class="form-label" for="xhs-source-title">参考标题</label><input class="field" id="xhs-source-title" maxlength="180" placeholder="自动读取或手动输入"/>'+
 '<label class="form-label" for="xhs-source-text">参考正文</label><textarea class="field field-area" id="xhs-source-text" style="min-height:160px" placeholder="自动读取或手动粘贴原文"></textarea>'+
 '<div style="margin-top:20px;display:flex;align-items:center;justify-content:space-between"><strong>参考图片</strong><span class="form-hint" id="xhs-count">0 / 0 张已选择</span></div><div id="xhs-photos" style="margin-top:9px"></div>'+
 '<label class="form-label" for="xhs-upload">手动上传原图（最多9张）</label><input id="xhs-upload" type="file" class="file-input" accept="image/png,image/jpeg,image/webp" multiple/><p class="form-hint">用于正式作品前请确认素材使用权。</p>'+
 '<section style="border-top:1px solid #e3e9f4;margin-top:22px;padding-top:18px"><h3 style="margin:0 0 6px;font-size:17px">步骤 2 · 生成改写文案</h3><p class="form-hint">保留原文的核心立场、事实和论证顺序，重新写标题、措辞和叙述方式。</p>'+
 '<details style="margin:13px 0"><summary style="cursor:pointer;font-weight:700;color:#4f5cc0">高级选项：调整文案改写方向</summary><label class="form-label" for="xhs-copy-direction">文案改写目标</label><textarea id="xhs-copy-direction" class="field field-area" style="min-height:82px">不改变原帖想表达的核心意思和关键事实；换一个切入角度与叙述方式，语言自然，不逐句同义替换，不扩写不存在的经历或数据。</textarea>'+
 '</details><div class="actions"><button class="primary-btn" id="xhs-rewrite">生成新文案</button></div><div id="xhs-output" aria-live="polite"></div></section>'+
 '<section style="border-top:1px solid #e3e9f4;margin-top:22px;padding-top:18px"><h3 style="margin:0 0 6px;font-size:17px">步骤 3 · 图片与套图编辑（可跳过重绘）</h3><p class="form-hint">每张原图都是模型输入。保留它想表达的意思，但换构图、媒介、色彩与视觉语言。</p>'+
 '<details style="margin:13px 0"><summary style="cursor:pointer;font-weight:700;color:#4f5cc0">高级选项：图片视觉风格和重绘参数</summary><label class="form-label" for="xhs-visual-direction">图片改造目标</label><textarea id="xhs-visual-direction" class="field field-area" style="min-height:82px">先理解原图的主体、信息重点和情绪，再用新的视觉隐喻与构图表达同一意图。不要临摹，不保留水印、账号名或品牌标识。</textarea>'+
 '<div class="form-inline"><div><label class="form-label" for="xhs-image-mode">输出方式</label><select id="xhs-image-mode" class="field"><option value="semantic">语义图生图 + 后续精准铺字（推荐）</option><option value="poster">完整视觉海报（中文可能需校正）</option></select></div><div><label class="form-label" for="xhs-variation">视觉变化程度</label><select id="xhs-variation" class="field"><option value="balanced">均衡 · 意图不变，形式明显变化</option><option value="bold">大胆 · 换构图、媒介与色彩</option><option value="faithful">克制 · 保留阅读顺序再重绘</option></select></div></div>'+
 '<div class="form-inline"><div><label class="form-label" for="xhs-visual-form">表现形式</label><select id="xhs-visual-form" class="field"><option value="auto">自动逐页变化</option><option value="editorial">杂志编辑设计</option><option value="collage">纸张拼贴海报</option><option value="illustration">叙事插画</option><option value="scene">生活方式场景</option><option value="minimal">极简信息卡</option><option value="photo">概念摄影</option></select></div><div><label class="form-label" for="xhs-style-lock">系列配色</label><select id="xhs-style-lock" class="field"><option value="auto">自动提取并换色</option><option value="cream">奶油治愈</option><option value="career">职场干货蓝</option><option value="editorial">高级杂志暖</option><option value="mint">清新薄荷</option><option value="violet">柔和紫</option><option value="ink">深色极简</option></select></div></div>'+
 '</details><div class="actions"><button class="ghost-btn" id="xhs-redraw">选中图片 AI 重绘（消耗额度）</button><button class="ghost-btn" id="xhs-direct-editor">无需生图，直接进入套图编辑器 →</button></div><p class="form-hint">只有结果图片实际加载成功才计入成功数；网关超时不会再显示成“成功”。单次最多3张。</p><div id="xhs-remake-progress" aria-live="polite" style="margin-top:10px"></div></section>';
 const draftKey='ai-toolbox.xhs-form.v1';
 function saveForm(){try{localStorage.setItem(draftKey,JSON.stringify({link:$('xhs-share-link').value,title:$('xhs-source-title').value,body:$('xhs-source-text').value,copy:$('xhs-copy-direction').value,visual:$('xhs-visual-direction').value}))}catch(e){}}
 for(const id of ['xhs-share-link','xhs-source-title','xhs-source-text','xhs-copy-direction','xhs-visual-direction'])$(id).addEventListener('input',saveForm);
 try{const old=JSON.parse(localStorage.getItem(draftKey)||'null');if(old){$('xhs-share-link').value=old.link||'';$('xhs-source-title').value=old.title||'';$('xhs-source-text').value=old.body||'';if(old.copy)$('xhs-copy-direction').value=old.copy;if(old.visual)$('xhs-visual-direction').value=old.visual;}}catch(e){}
 $('xhs-load').onclick=async()=>{await resolve();saveForm()};$('xhs-rewrite').onclick=rewrite;$('xhs-redraw').onclick=redrawSelected;
 $('xhs-direct-editor').onclick=()=>{const title=$('xhs-draft-title')?.value.trim()||$('xhs-source-title').value.trim(),text=$('xhs-draft-body')?.value.trim()||$('xhs-source-text').value.trim();if(!title&&!text){warn('请先填写或生成文案');return;}transfer(title||'参考图文',text);};
 $('xhs-upload').onchange=ev=>{const files=Array.from(ev.target.files||[]).slice(0,9).filter(f=>['image/png','image/jpeg','image/webp'].includes(f.type)&&f.size<8*1024*1024);addPhotos(files.map(f=>({src:URL.createObjectURL(f),origin:f.name+'-'+Date.now(),local:true})));};
 showPhotos();
};
})();
`;
