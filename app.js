import { convert } from "./conv.js";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const st={engine:'sd25',res:'720p',dur:'5',cnt:'1',ratio:'adaptive',audio:'0',fit:'full',pos:'우하',fps:'15',loop:'무한'};
let img=null, ov=null;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---- 저장소 (이 브라우저에만) ----  ponytail: localStorage 평문, 개인 기기 전제
const LS={get(k,d){try{return JSON.parse(localStorage.getItem('aya.'+k))??d}catch{return d}},
          set(k,v){try{localStorage.setItem('aya.'+k,JSON.stringify(v))}catch{}}};
const cfg=()=>LS.get('cfg',{});
const ARK='https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';
const GEM='https://generativelanguage.googleapis.com/v1beta';
const SD={sd25:'dreamina-seedance-2-5-260628',sd15:'seedance-1-5-pro-251215'};
const VEO_DEFAULT='veo-3.1-generate-preview';

async function http(url,body,headers={}){
  let r;
  try{ r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined}) }
  catch(e){ throw Object.assign(new Error('네트워크 오류: '+e.message),{net:true}) }
  const t=await r.text();
  if(!r.ok){let m=t.slice(0,500);try{m=JSON.parse(t).error.message}catch{} throw Object.assign(new Error(`HTTP ${r.status}: ${m}`),{status:r.status})}
  return JSON.parse(t);
}

// ---- 모델별 허용값 ----
const NAME={sd25:'Seedance 2.5',sd15:'Seedance 1.5 pro',veo:'Veo 3'};
const RULE={sd25:{res:['480p','720p','1080p'],dur:['4','5','6','8','10'],ratio:['adaptive'],audio:true,draft:true,
                  txt:'Seedance 2.5 · 첫=끝 프레임 · 원본 비율 고정. Draft 비용은 일반 480p와 같고, 업스케일은 1080p로 나와요.'},
            sd15:{res:['480p','720p','1080p'],dur:['4','5','6','8','10'],ratio:['adaptive'],audio:true,draft:true,
                  txt:'Seedance 1.5 pro · 원본 비율 고정. Draft는 일반의 약 60% 비용이지만 끝 프레임이 안 들어가요. 업스케일은 위 해상도로.'},
            veo:{res:['720p','1080p'],dur:['4','6','8'],ratio:['16:9','9:16'],audio:false,draft:false,
                 txt:'Veo 3 · Draft 없음 · 480p·5초·10초 없음 · 소리는 항상 생성(webp에선 빠져요).'}};
function setSeg(g,v){st[g]=v;$$(`.seg[data-g="${g}"] button`).forEach(b=>b.classList.toggle('on',b.dataset.v===v))}
function applyRule(){
  const r=RULE[st.engine];
  for(const g of ['res','dur','ratio']){
    $$(`.seg[data-g="${g}"] button`).forEach(b=>b.disabled=!r[g].includes(b.dataset.v));
    if(!r[g].includes(st[g])) setSeg(g, g==='dur'?(r.dur.includes('5')?'5':'6'):r[g][0]);
  }
  $$('.seg[data-g="audio"] button').forEach(b=>b.disabled=!r.audio);
  $('#rule').textContent=r.txt;
  $('#bDraft').disabled=!r.draft;
}
function draw(){
  applyRule();
  const part=st.fit==='part';
  $$('.part').forEach(e=>e.style.display=part?'flex':'none');
  $('#szn').textContent=$('#sz').value+'%'; $('#qn').textContent=$('#q').value;
  $('#sum').textContent=`${st.res} · ${st.dur}초 · ${st.cnt}개`;
  const P={좌상:"top:6%;left:5%",우상:"top:6%;right:5%",좌하:"bottom:6%;left:5%",우하:"bottom:6%;right:5%",중앙:"top:50%;left:50%;transform:translate(-50%,-50%)"};
  const ovs=part?`${P[st.pos]};width:${$('#sz').value}%`:'top:0;left:0;width:100%;height:100%;object-fit:contain';
  $$('.vid .ov').forEach(e=>e.remove());
  if(ov) $$('.vid').forEach(v=>v.insertAdjacentHTML('beforeend',`<img class="ov" src="${ov}" style="${ovs}">`));
}
$$('.seg').forEach(g=>g.onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;setSeg(g.dataset.g,b.dataset.v);draw();});
$('#sz').oninput=draw;$('#q').oninput=draw;

// ---- 이미지 입력: 투명 → 흰 배경, JPEG로 줄여서 업로드 가볍게 ----
function loadImg(file,cb){if(!file||!file.type.startsWith('image/'))return;const r=new FileReader();r.onload=()=>cb(r.result);r.readAsDataURL(file)}
function flatten(url){return new Promise(res=>{const i=new Image();i.onload=()=>{
  const k=Math.min(1,2048/Math.max(i.naturalWidth,i.naturalHeight));
  const c=document.createElement('canvas');c.width=Math.round(i.naturalWidth*k);c.height=Math.round(i.naturalHeight*k);
  const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(i,0,0,c.width,c.height);
  res(c.toDataURL('image/jpeg',0.92))};i.src=url})}
function setImg(file){loadImg(file,async u=>{img=await flatten(u);$('#drop').innerHTML=`<img src="${img}">`})}
const d=$('#drop');
d.onclick=()=>$('#f').click();
$('#f').onchange=e=>{setImg(e.target.files[0]);e.target.value=''};
d.ondragover=e=>{e.preventDefault();d.classList.add('is-over')};
d.ondragleave=()=>d.classList.remove('is-over');
d.ondrop=e=>{e.preventDefault();d.classList.remove('is-over');setImg(e.dataTransfer.files[0])};
document.addEventListener('paste',e=>{if(e.target.matches('input,textarea'))return;for(const i of e.clipboardData.items)if(i.type.startsWith('image/'))setImg(i.getAsFile())});

// ---- 레이아웃 ----
$('#bOv').onclick=()=>$('#o').click();
$('#o').onchange=e=>{const f=e.target.files[0];loadImg(f,u=>{ov=u;$('#on').textContent=f.name;$('#bOvX').style.display='';draw()});e.target.value=''};
$('#bOvX').onclick=()=>{ov=null;$('#on').textContent='없음';$('#bOvX').style.display='none';draw()};

// ---- 결과 목록: 새로고침·앱 전환해도 진행 중 작업을 이어서 확인 ----
// r: {id,label,meta,eng,draft,st:'wait'|'ok'|'err',tid?,op?,url?,err?,t,local?}
const DAY=864e5;
let results=LS.get('results',[]).filter(r=>!r.local&&Date.now()-r.t<DAY);   // Ark 영상 링크는 24시간 유효
const blobs={};   // id → Blob URL (Veo·불러온 영상은 저장 안 됨)
const save=()=>LS.set('results',results.filter(r=>!r.local));
const newId=()=>Math.random().toString(36).slice(2,10);

async function submit(body,base){
  const r={id:newId(),st:'wait',t:Date.now(),...base};
  results.unshift(r);save();renderRes();
  try{
    if(r.eng==='veo'){
      const c=cfg();
      r.op=(await http(`${GEM}/models/${c.veo_model||VEO_DEFAULT}:predictLongRunning`,body,{'x-goog-api-key':c.google_key})).name;
    }else r.tid=(await http(ARK,body,{Authorization:'Bearer '+cfg().ark_key})).id;
  }catch(e){r.st='err';r.err=e.message}
  save();renderRes();
}
function seedBody(eng,draft){
  const first={type:'image_url',image_url:{url:img},role:'first_frame'}, last={...first,role:'last_frame'};
  const content=[{type:'text',text:$('#pr').value.trim()},first];
  if(!(draft&&eng==='sd15')) content.push(last);   // 1.5 pro Draft는 끝 프레임 불가
  const b={model:SD[eng],content,resolution:draft?'480p':st.res,duration:+st.dur,ratio:'adaptive',generate_audio:st.audio==='1',watermark:false};
  if(draft) b.draft=true;
  return b;
}
function veoBody(){  // ponytail: 키 없이 작성, 첫 실행 때 검증 필요
  const [mime,b64]=img.slice(5).split(';base64,'), pic={bytesBase64Encoded:b64,mimeType:mime};
  return {instances:[{prompt:$('#pr').value.trim(),image:pic,lastFrame:pic}],
          parameters:{aspectRatio:st.ratio,resolution:st.res,durationSeconds:+st.dur}};
}
function run(draft){
  if(!img){alert('이미지를 먼저 넣어주세요.');return}
  const eng=st.engine, c=cfg();
  if(eng==='veo'?!c.google_key:!c.ark_key){alert(`설정(⚙)에서 ${eng==='veo'?'Google':'BytePlus'} API 키를 넣어주세요.`);return}
  const base={eng,draft,label:NAME[eng]+(draft?' Draft':''),meta:`${draft?'480p':st.res} · ${st.dur}초`};
  for(let i=0;i<+st.cnt;i++) submit(eng==='veo'?veoBody():seedBody(eng,draft),base);
}
$('#bDraft').onclick=()=>run(true);
$('#bGen').onclick=()=>run(false);
// Draft → 같은 모델로 고화질 재생성 (2.5는 1080p 고정, 1.5는 선택 해상도, 480p면 720p)
const upRes=r=>r.eng==='sd25'?'1080p':(st.res==='480p'?'720p':st.res);
function upscale(r){
  const res=upRes(r);
  submit({model:SD[r.eng],content:[{type:'draft_task',draft_task:{id:r.tid}}],resolution:res,watermark:false},
         {eng:r.eng,draft:false,label:NAME[r.eng]+' 업스케일',meta:`${res} · ${r.meta.split(' · ')[1]}`});
}

// 진행 중 작업 확인 (6초마다 + 앱으로 돌아왔을 때)
let polling=false;
async function poll(){
  if(polling)return; polling=true;
  for(const r of results.filter(r=>r.st==='wait'&&(r.tid||r.op))){
    try{
      if(r.tid){
        const x=await http(`${ARK}/${r.tid}`,null,{Authorization:'Bearer '+cfg().ark_key});
        if(x.status==='succeeded'){r.st='ok';r.url=x.content.video_url}
        else if(['failed','cancelled','expired'].includes(x.status)){r.st='err';r.err=`${x.status}: ${x.error?.message||''}`}
      }else{
        const x=await http(`${GEM}/${r.op}`,null,{'x-goog-api-key':cfg().google_key});
        if(x.done){
          if(x.error){r.st='err';r.err=x.error.message}
          else{r.url=x.response.generateVideoResponse.generatedSamples[0].video.uri;r.st='ok'}
        }
      }
    }catch(e){ if(!e.net&&e.status&&e.status<500){r.st='err';r.err=e.message} }   // 일시적 오류는 다음에 다시
    if(r.st!=='wait'){save();renderRes()}
  }
  polling=false;
}
setInterval(poll,6000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});

// Veo 영상은 키 헤더가 있어야 받을 수 있어서 Blob으로
async function videoBlob(r){
  if(r.local) return (await fetch(blobs[r.id])).blob();
  const x=await fetch(r.url,{headers:r.eng==='veo'?{'x-goog-api-key':cfg().google_key}:{}});
  if(!x.ok) throw new Error('영상 받기 실패 '+x.status);
  return x.blob();
}
async function src(r){
  if(blobs[r.id]) return blobs[r.id];
  if(r.eng!=='veo') return r.url;
  try{ return blobs[r.id]=URL.createObjectURL(await videoBlob(r)) }catch{ return '' }
}

// 영상 불러오기: 브라우저가 영상 링크를 직접 못 읽을 때(CORS) 대비
$('#bImp').onclick=()=>$('#vi').click();
$('#vi').onchange=e=>{
  const f=e.target.files[0]; if(!f)return; e.target.value='';
  const id=newId(); blobs[id]=URL.createObjectURL(f);
  results.unshift({id,local:true,st:'ok',label:'불러온 영상',meta:f.name,t:Date.now()}); renderRes();
};

function renderRes(){
  if(!results.length){$('#res').innerHTML='<div class="empty" style="grid-column:1/-1">아직 결과가 없어요</div>';return}
  $('#res').innerHTML=results.map(r=>
    r.st==='wait'?`<div class="res"><div class="bar"><span class="t">${esc(r.label)}</span><span class="note">${esc(r.meta)}</span></div>
      <div class="busy" style="padding:0 8px 10px"><div class="spin"></div>생성 중… 몇 분 걸려요. 다른 앱 갔다 와도 돼요.</div></div>`:
    r.st==='err'?`<div class="res"><div class="bar"><span class="t">${esc(r.label)} 실패</span><button class="secondary" data-del="${r.id}">✕</button></div><div class="bar err">${esc(r.err)}</div></div>`:
   `<div class="res"><div class="vid"><video data-src="${r.id}" autoplay loop muted playsinline></video></div>
     <div class="bar"><span class="t">${esc(r.label)}</span><span class="note">${esc(r.meta)}</span><button class="secondary" data-del="${r.id}">✕</button></div>
     <div class="bar">
       ${r.draft&&r.tid?`<button class="go" data-up="${r.id}">업스케일 ${upRes(r)}</button>`:''}
       <button class="secondary" data-x="webp" data-id="${r.id}">webp</button><button class="secondary" data-x="mp4" data-id="${r.id}">mp4</button>
       ${r.url&&r.eng!=='veo'?`<a class="secondary" href="${esc(r.url)}" target="_blank" rel="noopener">원본</a>`:''}</div>
     <div class="bar note" id="x${r.id}"></div></div>`).join('');
  $$('video[data-src]').forEach(async v=>{v.src=await src(results.find(x=>x.id===v.dataset.src))});
  draw();
}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),6e4)}
$('#res').onclick=async e=>{
  const b=e.target.closest('button');if(!b)return;
  const id=b.dataset.id||b.dataset.up||b.dataset.del, r=results.find(x=>x.id===id);
  if(!r)return;
  if(b.dataset.del){results=results.filter(x=>x!==r);save();renderRes();return}
  if(b.dataset.up){b.disabled=true;b.textContent='업스케일 요청됨';upscale(r);return}
  if(!b.dataset.x)return;
  const box=$('#x'+id);
  box.innerHTML='<div class="spin"></div>&nbsp;영상 받는 중…';
  let v;
  try{ v=await videoBlob(r) }
  catch{ box.innerHTML='<span class="err">브라우저가 이 영상 링크를 직접 못 읽어요. <b>원본</b>을 눌러 영상을 저장한 뒤, 위의 <b>영상 불러오기</b>로 넣고 다시 눌러주세요.</span>';return }
  try{
    box.innerHTML='<div class="spin"></div>&nbsp;변환 준비 중… (처음엔 변환기 받느라 오래 걸려요)';
    const out=await convert(v,{ov,fit:st.fit,pos:st.pos,size:+$('#sz').value,fmt:b.dataset.x,fps:st.fps,q:+$('#q').value,loop:st.loop},
                            p=>box.innerHTML=`<div class="spin"></div>&nbsp;변환 중 ${Math.round(p*100)}%`);
    const name=`ayatodance_${r.label.replace(/\s+/g,'_')}_${new Date().toISOString().slice(5,19).replace(/[-:T]/g,'')}.${b.dataset.x}`;
    download(out,name);
    box.textContent=`저장됨 · ${(out.size/1048576).toFixed(2)}MB · ${name}`;
  }catch(err){box.innerHTML=`<span class="err">${esc(err.message||err)}</span>`}
};
$('#bClear').onclick=()=>{if(confirm('결과 목록을 비울까요?')){results=[];save();renderRes()}};

// ---- 설정 ----
function showSettings(){
  const c=cfg(), dots='●'.repeat(16);
  $('#kArk').value='';$('#kGoogle').value='';
  $('#kArk').placeholder=c.ark_key?dots:'키를 붙여넣으세요';
  $('#kGoogle').placeholder=c.google_key?dots:'아직 없음 — 나중에 넣어도 돼요';
  $('#sArk').innerHTML=c.ark_key?'<span class="saved">저장됨</span>':'';
  $('#sGoogle').innerHTML=c.google_key?'<span class="saved">저장됨</span>':'';
  $('#veoModel').value=c.veo_model||VEO_DEFAULT;
}
let clear=[];
$('#gear').onclick=()=>{clear=[];showSettings();$('#modal').classList.add('open')};
$('#bClose').onclick=()=>$('#modal').classList.remove('open');
$$('[data-clear]').forEach(b=>b.onclick=()=>{clear.push(b.dataset.clear);const i=b.previousElementSibling;i.value='';i.placeholder='저장 누르면 삭제돼요';});
$('#bSave').onclick=()=>{
  const c=cfg();
  if($('#kArk').value.trim()) c.ark_key=$('#kArk').value.trim();
  if($('#kGoogle').value.trim()) c.google_key=$('#kGoogle').value.trim();
  clear.forEach(k=>delete c[k]); clear=[];
  c.veo_model=$('#veoModel').value.trim()||VEO_DEFAULT;
  LS.set('cfg',c); showSettings();
};

draw();renderRes();
if(!cfg().ark_key) $('#gear').click();
poll();
