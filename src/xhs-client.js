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
 const node=$('xhs-photos');if(!node)return;
 node.replaceChildren();
 if(!picked.length){
  node.innerHTML='<p class="form-hint">暂无参考图片。可先解析链接，或手动上传原图。</p>';
  stateSummary();wizardSummary();return;
 }
 const wrapper=document.createElement('div');
 wrapper.className='xhs-photo-grid';
 for(const item of picked){
  const frame=document.createElement('article');
  frame.className='xhs-photo-card';
  const label=document.createElement('label');
  label.className='xhs-photo-choice';
  const checkbox=document.createElement('input');
  checkbox.type='checkbox';checkbox.checked=item.chosen;
  checkbox.onchange=()=>{item.chosen=checkbox.checked;stateSummary();wizardSummary();};
  const status=document.createElement('span');
  status.textContent=item.status==='working'?'正在理解并重绘…':item.remade?'已完成语义图生图':'选中这张原图';
  label.append(checkbox,status);frame.append(label);
  const comparison=document.createElement('div');
  comparison.className='xhs-image-comparison'+(item.remade?' has-result':'');
  function createPreview(title,url,isResult){
   const column=document.createElement('div');
   column.className='xhs-image-column';
   const caption=document.createElement('span');
   caption.className='xhs-image-caption';
   caption.textContent=title;
   const viewer=document.createElement('div');
   viewer.className='xhs-image-viewer';
   const image=document.createElement('img');
   image.src=url;image.alt=isResult?'AI 生成的新表达图片':'完整参考原图';
   image.loading='lazy';
   if(!isResult)image.referrerPolicy='no-referrer';
   image.onerror=()=>{image.alt='图片暂时无法预览，请检查来源或重新上传';viewer.classList.add('failed');};
   const open=document.createElement('button');
   open.type='button';open.className='xhs-image-zoom';
   open.textContent='⤢ 放大预览';
   open.setAttribute('aria-label','放大查看'+title);
   open.addEventListener('click',()=>showFullImage(url,title,isResult));
   viewer.append(image,open);
   const link=document.createElement('a');
   link.href=url;link.textContent=isResult?'打开高清新图 ↗':'打开完整原图 ↗';
   link.target='_blank';link.rel='noopener noreferrer';
   link.className='xhs-image-open';
   column.append(caption,viewer,link);
   return column;
  }
  comparison.append(createPreview('原始参考图',item.src,false));
  if(item.remade)comparison.append(createPreview('AI 重绘结果',item.remade,true));
  frame.append(comparison);wrapper.append(frame);
 }
 node.append(wrapper);stateSummary();wizardSummary();
}
function showFullImage(src,title,isResult){
 let overlay=$('xhs-image-lightbox');
 if(!overlay){
  overlay=document.createElement('dialog');
  overlay.id='xhs-image-lightbox';
  overlay.className='xhs-image-lightbox';
  overlay.innerHTML='<div class="xhs-image-lightbox-header"><strong id="xhs-lightbox-title"></strong><div><a id="xhs-lightbox-newtab" target="_blank" rel="noopener noreferrer">原尺寸打开 ↗</a><button type="button" id="xhs-lightbox-close" aria-label="关闭图片预览">✕ 关闭</button></div></div><div class="xhs-image-lightbox-scroll"><img id="xhs-lightbox-img" alt="图片放大预览"></div>';
  document.body.append(overlay);
  $('xhs-lightbox-close').onclick=()=>overlay.close();
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.close();});
 }
 $('xhs-lightbox-title').textContent=title;
 $('xhs-lightbox-img').src=src;
 $('xhs-lightbox-img').alt=(isResult?'生成图：':'参考图：')+title;
 $('xhs-lightbox-newtab').href=src;
 if(!overlay.open)overlay.showModal();
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
 wizardSummary();
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
  wizardSummary();
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


let xhsWizard=null;
function wizardSummary(){
 if(!xhsWizard||!xhsWizard.shell.isConnected)return;
 const title=$('xhs-source-title')?.value.trim()||'尚未识别标题';
 const body=$('xhs-source-text')?.value.trim()||'尚未输入参考正文';
 const newTitle=$('xhs-draft-title')?.value.trim();
 const newText=$('xhs-draft-body')?.value.trim();
 const n=picked.filter(x=>x.chosen).length;
 const remade=picked.filter(x=>x.chosen&&x.remade).length;
 const imp=$('xw-import-status');
 if(imp){imp.querySelector('strong').textContent=title;imp.querySelector('p').textContent=body.slice(0,120)+(body.length>120?'…':'')+' · '+n+' 张已选图片';}
 const one=$('xw-source-title');if(one)one.textContent=title;
 const two=$('xw-source-body');if(two)two.textContent=body;
 const out=$('xw-export-title');if(out)out.textContent=newTitle||title;
 const outText=$('xw-export-text');if(outText)outText.textContent=(newText||body).slice(0,160)+((newText||body).length>160?'…':'');
 const count=$('xw-export-images');if(count)count.textContent=n+' 张已选图片'+(remade?'（其中 '+remade+' 张已重绘）':'');
 const indicator=$('xw-copy-badge');if(indicator)indicator.textContent=newText?'已生成新文案':'尚未生成 · 可用参考文案继续';
}
function wizardHasSource(){return !!(($('xhs-source-title')?.value||'').trim()||($('xhs-source-text')?.value||'').trim());}
function wizardStep(n){
 if(!xhsWizard)return;
 if(n>1&&!wizardHasSource()){wizardStep(1);warn('请先解析链接，或展开“手动修改参考内容”填写标题或正文。');return;}
 const msg=$('xhs-message');if(msg){msg.hidden=true;msg.textContent='';}
 xhsWizard.active=n;
 for(const panel of xhsWizard.panels)panel.hidden=Number(panel.dataset.step)!==n;
 for(const button of xhsWizard.nav){const current=Number(button.dataset.step)===n;if(current)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');}
 wizardSummary();
 if(n===1){const detail=$('xw-manual-edit');if(detail&&!wizardHasSource())detail.open=false;}
 xhsWizard.shell.scrollIntoView({behavior:'smooth',block:'start'});
}
function wizardLayout(body){
 if(!$('xhs-share-link'))return;
 if(!document.getElementById('xhs-wizard-styles')){
  const styles=document.createElement('style');styles.id='xhs-wizard-styles';styles.textContent="\n/* Standalone Xiaohongshu creator: guided, concise, accessible. */\n.xw-shell{max-width:100%;color:#172340;--xw-muted:#77859d;--xw-primary:#5f63e9}\n.xw-hero{padding:8px 2px 23px;border-bottom:1px solid #edf0f6}\n.xw-eyebrow{font-size:11px;text-transform:uppercase;font-weight:800;letter-spacing:.14em;color:#6961d7}\n.xw-hero h2{font-size:clamp(24px,2.8vw,31px);letter-spacing:-.035em;line-height:1.23;margin:7px 0;color:#1f2841}\n.xw-hero p{font-size:13px;color:#77859d;margin:0;line-height:1.7}\n.xw-layout{display:grid;grid-template-columns:215px minmax(0,1fr);gap:22px;margin-top:24px;align-items:start}\n.xw-sidebar{background:#f8f9ff;border:1px solid #e9edf7;border-radius:17px;padding:12px;position:sticky;top:90px}\n.xw-sidebar h3{color:#97a1b4;font-size:11px;letter-spacing:.09em;margin:8px 10px 14px}\n.xw-step{border:0;border-radius:11px;text-align:left;background:transparent;color:#66748f;padding:12px 10px;display:flex;gap:10px;width:100%;align-items:center;cursor:pointer;transition:background .2s}\n.xw-step:hover{background:#eceffd}.xw-step[aria-current=\"step\"]{background:#edeefe;color:#4e55c3;font-weight:800}\n.xw-step-index{border:1px solid #dce1ef;background:#fff;color:#7b86a1;border-radius:9px;width:29px;height:29px;display:grid;place-items:center;flex:0 0 29px;font-size:12px;font-weight:800}\n.xw-step[aria-current=\"step\"] .xw-step-index{background:#6664ed;color:white;border-color:#6664ed}\n.xw-step span:last-child{display:grid;gap:2px}.xw-step small{font-size:10px;color:#9aa3b7;font-weight:500;line-height:1.45}\n.xw-side-note{margin:20px 10px 8px;padding-top:14px;border-top:1px solid #e1e6f0;font-size:11px;line-height:1.7;color:#8b94a8}\n.xw-workspace{min-width:0}\n.xw-panel{border:1px solid #e6ebf3;border-radius:18px;padding:27px 28px;background:white;box-shadow:0 5px 24px #293b7107}\n.xw-panel[hidden]{display:none!important}\n.xw-panel-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:22px}\n.xw-panel-icon{width:42px;height:42px;background:#f0efff;border-radius:12px;display:grid;place-items:center;color:#635be1;font-weight:800;font-size:17px;flex-shrink:0}\n.xw-panel-head h3{font-size:20px;letter-spacing:-.02em;margin:0 0 6px;color:#222d47}\n.xw-panel-head p{font-size:12px;color:#8794a8;margin:0;line-height:1.7}\n.xw-panel .form-label{margin-top:14px}\n.xw-panel .field{border-radius:11px;border-color:#dfe5ef;padding:14px 15px}\n.xw-panel .field:focus{box-shadow:0 0 0 3px #6565dd16}\n.xw-panel #xhs-share-link{min-height:105px!important;font-size:14px;line-height:1.75;resize:vertical}\n.xw-panel .primary-btn{min-height:43px;border-radius:11px;padding:12px 19px}\n.xw-panel .ghost-btn{border-radius:11px}\n.xw-panel .actions{display:flex;flex-wrap:wrap;gap:10px}\n.xw-panel .note{font-size:12px;border-radius:11px}\n.xw-quick-summary{padding:16px 17px;border-radius:13px;border:1px solid #e1e6f5;background:#f9faff;margin:17px 0 6px}\n.xw-quick-summary strong{font-size:13px;color:#263452}\n.xw-quick-summary p{font-size:12px;color:#818ca1;margin:7px 0 0;line-height:1.6}\n.xw-manual-details{border:1px solid #e9ecf6;border-radius:12px;padding:10px 15px;margin-top:18px}\n.xw-manual-details summary{cursor:pointer;font-size:12px;color:#5364c3;font-weight:750;padding:6px 0}\n.xw-manual-details[open]{padding-bottom:18px}\n.xw-panel footer.xw-actions{border-top:1px solid #edf0f6;margin-top:24px;padding-top:21px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}\n.xw-actions .primary-btn{min-width:155px}\n.xw-inline-tip{font-size:12px;color:#98a3b4;line-height:1.5}\n.xw-step-body>section{border:none!important;padding:0!important;margin:0!important}\n.xw-step-body h3:first-child{display:none}\n.xw-step-body>section>.form-hint:first-of-type{margin-bottom:17px}\n.xw-source-mini{border-radius:12px;background:#f7f8fb;border:1px solid #ecedf4;padding:15px;margin-bottom:17px}\n.xw-source-mini small{display:block;font-size:10px;color:#8895ab;font-weight:800;margin-bottom:5px}\n.xw-source-mini strong{display:block;font-size:14px}\n.xw-source-mini p{color:#7f8b9f;font-size:12px;line-height:1.65;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}\n.xw-step-body #xhs-output>section{background:#fafbff;border-color:#e6e8fa!important;padding:18px!important}\n.xw-step-body #xhs-output textarea{min-height:160px!important}\n.xw-step-body #xhs-photos .xhs-photo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px}\n.xw-step-body #xhs-photos .xhs-image-viewer img{display:block;width:100%;height:auto;max-height:420px;object-fit:contain}\n.xw-photo-area{border:1px solid #ebedf4;border-radius:14px;padding:15px;background:#fafbfe;margin:0 0 20px}\n.xw-photo-area .form-label{margin-top:12px}\n.xw-export-summary{display:grid;gap:10px}\n.xw-summary-item{background:#f8faff;border:1px solid #e6eafa;padding:15px 16px;border-radius:12px}\n.xw-summary-item span{display:block;font-size:11px;color:#8693aa;margin-bottom:6px}\n.xw-summary-item strong{display:block;font-size:14px;color:#233253;white-space:pre-wrap;overflow-wrap:anywhere}\n.xw-finale{background:linear-gradient(125deg,#f2f0ff,#f8f9ff);border-radius:14px;padding:22px;margin-top:17px}\n.xw-finale h4{font-size:17px;margin:0 0 7px}.xw-finale p{color:#75829a;font-size:12px;line-height:1.65}\n.xw-finale .primary-btn{margin-top:10px}\n.xw-workspace #xhs-message[hidden]{display:none!important}\n.xw-workspace #xhs-message{margin:0 0 13px}\n@media(max-width:860px){.xw-layout{grid-template-columns:1fr;gap:16px}.xw-sidebar{position:static;padding:10px;display:flex;flex-direction:column}.xw-sidebar h3,.xw-side-note{display:none}.xw-sidebar-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px}.xw-step{flex-direction:column;align-items:center;text-align:center;padding:8px 3px;gap:4px}.xw-step span:last-child{font-size:11px}.xw-step small{display:none}}\n@media(max-width:570px){.xw-hero{padding-bottom:18px}.xw-layout{margin-top:15px}.xw-panel{padding:19px 16px;border-radius:14px}.xw-panel-head h3{font-size:18px}.xw-panel-head{gap:9px;margin-bottom:15px}.xw-panel-icon{width:35px;height:35px;font-size:15px}.xw-panel footer.xw-actions{align-items:stretch;flex-direction:column-reverse}.xw-panel footer.xw-actions>button{width:100%}.xw-step-body #xhs-photos .xhs-photo-grid{grid-template-columns:1fr!important}.xw-step-body #xhs-photos .xhs-image-comparison.has-result{grid-template-columns:1fr}}\n\n.xhs-photo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px}\n\n.xhs-photo-card{min-width:0;background:#fff;border:1px solid #e4e8f2;border-radius:15px;padding:14px;box-shadow:0 3px 13px #22385c08}\n.xhs-photo-choice{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:650;color:#465573;padding-bottom:13px;cursor:pointer}\n.xhs-photo-choice input{width:17px;height:17px;accent-color:#6366eb}\n.xhs-image-comparison{display:grid;grid-template-columns:minmax(0,1fr);gap:15px;min-width:0}\n.xhs-image-comparison.has-result{grid-template-columns:repeat(2,minmax(0,1fr))}\n.xhs-image-column{min-width:0}\n.xhs-image-caption{font-size:11px;font-weight:750;color:#68768f;display:block;margin:0 0 9px}\n.xhs-image-viewer{position:relative;min-width:0;min-height:180px;display:flex;align-items:center;justify-content:center;border:1px solid #e7ebf3;border-radius:11px;background:#f8f9fc;overflow:hidden;padding:12px}\n.xhs-image-viewer img{width:100%;height:auto;max-height:420px;object-fit:contain;display:block;border-radius:5px}\n.xhs-image-viewer.failed{min-height:120px}\n.xhs-image-zoom{position:absolute;right:9px;bottom:9px;padding:7px 11px;border:1px solid #dde3f0;border-radius:9px;background:#fffffff0;color:#3d4d77;font-weight:700;font-size:11px;box-shadow:0 2px 10px #182b4c14}\n.xhs-image-zoom:hover{background:#f0efff;color:#514cd7}\n.xhs-image-open{display:inline-flex;padding:10px 0 1px;font-size:12px;font-weight:700;color:#4c5fca;text-decoration:none}\n.xhs-image-open:hover{text-decoration:underline}\n.xhs-image-lightbox{width:min(92vw,1100px);height:min(93vh,1000px);max-width:none;max-height:none;border:1px solid #dfe4ee;border-radius:17px;padding:0;box-shadow:0 22px 90px #131c3660;background:#fff;overflow:hidden}\n.xhs-image-lightbox::backdrop{background:#101729b8}\n.xhs-image-lightbox-header{padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #e8ebf3}\n.xhs-image-lightbox-header strong{font-size:14px}\n.xhs-image-lightbox-header>div{display:flex;gap:12px;align-items:center}\n.xhs-image-lightbox-header a{color:#5257d8;font-size:12px;font-weight:700}\n.xhs-image-lightbox-header button{border:0;background:#edf0f8;padding:9px 13px;border-radius:9px;color:#45546e;cursor:pointer}\n.xhs-image-lightbox-scroll{height:calc(100% - 69px);overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:16px;background:#f7f8fb;box-sizing:border-box}\n.xhs-image-lightbox-scroll img{width:auto;height:auto;max-width:100%;object-fit:contain;box-shadow:0 4px 20px #21345416;background:white}\n@media(max-width:720px){.xhs-photo-grid{grid-template-columns:1fr}.xhs-image-comparison.has-result{grid-template-columns:1fr}.xhs-image-lightbox{width:98vw;height:96vh;border-radius:10px}.xhs-image-lightbox-header{padding:11px}.xhs-image-lightbox-header>div{gap:5px}.xhs-image-lightbox-header button{padding:7px}.xhs-image-viewer img{max-height:480px}}\n";document.head.appendChild(styles);
 }
 const old=Array.from(body.children);
 const rewriteSection=old.find(n=>n.tagName==='SECTION'&&n.querySelector('#xhs-rewrite'));
 const imageSection=old.find(n=>n.tagName==='SECTION'&&n.querySelector('#xhs-redraw'));
 if(!rewriteSection||!imageSection)return;
 const importNodes=old.slice(2,old.indexOf(rewriteSection));
 const shell=document.createElement('div');shell.className='xw-shell';
 shell.innerHTML='<div class="xw-hero"><span class="xw-eyebrow">AI CONTENT STUDIO</span><h2>参考内容，一步步变成新作品</h2><p>导入参考笔记 → 改写文案 → 按需处理图片 → 进入编辑器导出。每一步只展示当前需要的操作。</p></div>'+
 '<div class="xw-layout"><aside class="xw-sidebar"><h3>CREATION FLOW</h3><div class="xw-sidebar-nav" id="xw-nav">'+
 '<button type="button" class="xw-step" data-step="1"><span class="xw-step-index">01</span><span>导入内容<small>链接 / 文字</small></span></button>'+
 '<button type="button" class="xw-step" data-step="2"><span class="xw-step-index">02</span><span>改写文案<small>生成 / 修改</small></span></button>'+
 '<button type="button" class="xw-step" data-step="3"><span class="xw-step-index">03</span><span>图片处理<small>可选 AI 重绘</small></span></button>'+
 '<button type="button" class="xw-step" data-step="4"><span class="xw-step-index">04</span><span>编辑导出<small>确认 / 完成</small></span></button></div>'+
 '<div class="xw-side-note">你的操作只聚焦当前步骤。解析失败时，可以手动补充素材继续，不必重新开始。</div></aside>'+
 '<div class="xw-workspace" id="xw-workspace">'+
 '<section class="xw-panel" data-step="1"><header class="xw-panel-head"><div class="xw-panel-icon">↗</div><div><h3>导入参考笔记</h3><p>粘贴小红书链接或分享文本，一键提取标题、正文和图片。</p></div></header><div class="xw-step-body" id="xw-import-body"></div>'+
 '<div class="xw-quick-summary" id="xw-import-status" aria-live="polite"><strong>等待导入参考素材</strong><p>解析失败时可以手动填写，下个步骤同样可以继续。</p></div>'+
 '<footer class="xw-actions"><span class="xw-inline-tip">有标题或正文后，即可继续</span><button type="button" class="primary-btn" id="xw-go-2">继续：改写文案 →</button></footer></section>'+
 '<section class="xw-panel" data-step="2" hidden><header class="xw-panel-head"><div class="xw-panel-icon">✎</div><div><h3>生成你的新文案</h3><p>保留核心观点，调整表达方式；生成后可直接编辑标题与正文。</p></div></header><div class="xw-source-mini"><small>参考内容</small><strong id="xw-source-title"></strong><p id="xw-source-body"></p></div>'+
 '<div class="xw-step-body" id="xw-copy-body"></div><footer class="xw-actions"><button type="button" class="ghost-btn" data-xw-back="1">← 上一步</button><button type="button" class="primary-btn" id="xw-go-3">继续：选择图片 →</button></footer></section>'+
 '<section class="xw-panel" data-step="3" hidden><header class="xw-panel-head"><div class="xw-panel-icon">▧</div><div><h3>处理参考图片</h3><p>可使用原图排版，也可以消耗 AI 额度重绘。图片处理不是必选。</p></div></header><div class="xw-photo-area" id="xw-photo-area"></div>'+
 '<div class="xw-step-body" id="xw-image-body"></div><footer class="xw-actions"><button type="button" class="ghost-btn" data-xw-back="2">← 上一步</button><button type="button" class="primary-btn" id="xw-go-4">跳过重绘 / 下一步 →</button></footer></section>'+
 '<section class="xw-panel" data-step="4" hidden><header class="xw-panel-head"><div class="xw-panel-icon">✓</div><div><h3>确认作品，进入编辑器</h3><p>已经准备好了。你仍可以返回修改文案或图片，进入编辑器后可逐页排版与导出。</p></div></header>'+
 '<div class="xw-export-summary"><div class="xw-summary-item"><span>图文标题</span><strong id="xw-export-title"></strong></div><div class="xw-summary-item"><span>正文预览</span><strong id="xw-export-text"></strong></div>'+
 '<div class="xw-summary-item"><span>参考图片</span><strong id="xw-export-images"></strong></div><div class="xw-summary-item"><span>创作进度</span><strong id="xw-copy-badge"></strong></div></div>'+
 '<div class="xw-finale"><h4>开始制作整套图文</h4><p>打开多页编辑器，调整每页文字和配色，然后导出高清图片。图片上传及 AI 重绘均可跳过。</p><button type="button" class="primary-btn" id="xw-finish">进入图文编辑器 ↗</button></div>'+
 '<footer class="xw-actions"><button type="button" class="ghost-btn" data-xw-back="3">← 返回调整图片</button><button type="button" class="ghost-btn" data-xw-back="2">修改文案</button></footer></section>'+
 '</div></div>';
 const panels=Array.from(shell.querySelectorAll('.xw-panel'));
 body.replaceChildren(shell);
 const target=$('xw-import-body');for(const node of importNodes)target.appendChild(node);
 const mainNotice=$('xhs-message');if(mainNotice)$('xw-workspace').prepend(mainNotice);
 const manual=document.createElement('details');manual.className='xw-manual-details';manual.id='xw-manual-edit';manual.innerHTML='<summary>查看 / 手动修改参考标题和正文</summary>';
 for(const id of ['xhs-source-title','xhs-source-text']){const el=$(id);if(el){if(el.previousElementSibling?.tagName==='LABEL')manual.append(el.previousElementSibling);manual.append(el);}}
 target.appendChild(manual);
 const photoArea=$('xw-photo-area'),photos=$('xhs-photos');if(photos){const header=photos.previousElementSibling;if(header)photoArea.append(header);photoArea.append(photos);}
 const upload=$('xhs-upload');if(upload){if(upload.previousElementSibling?.tagName==='LABEL')photoArea.append(upload.previousElementSibling);photoArea.append(upload);}
 $('xw-copy-body').append(rewriteSection);$('xw-image-body').append(imageSection);
 $('xw-image-body').querySelector('#xhs-direct-editor').textContent='直接进入图文编辑器 ↗';
 xhsWizard={shell,panels,nav:Array.from(shell.querySelectorAll('.xw-step')),active:1};
 xhsWizard.nav.forEach(b=>b.addEventListener('click',()=>wizardStep(Number(b.dataset.step))));
 shell.querySelectorAll('[data-xw-back]').forEach(b=>b.addEventListener('click',()=>wizardStep(Number(b.dataset.xwBack))));
 $('xw-go-2').onclick=()=>wizardStep(2);$('xw-go-3').onclick=()=>wizardStep(3);$('xw-go-4').onclick=()=>wizardStep(4);
 $('xw-finish').onclick=()=>$('xhs-direct-editor').click();
 for(const id of ['xhs-source-title','xhs-source-text'])$(id).addEventListener('input',wizardSummary);
 shell.addEventListener('input',wizardSummary);shell.addEventListener('change',wizardSummary);
 wizardSummary();wizardStep(1);
}

window.openXhsRemake=function({body}){
 picked=[];serial=0;xhsWizard=null;
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
 wizardLayout(body);
};
})();
`;
