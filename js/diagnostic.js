/* Temporary ALX Oracle forensic overlay. Active only with ?diag=1. */
(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('diag') !== '1') return;

  const state = { typeOperations: new Map(), events: [], snapshots: [], pointStacks: [], labels: [], startedAt: new Date().toISOString() };
  let panel;
  let reportEl;
  const text = (v) => v == null ? 'null' : String(v);
  const count = (selector) => document.querySelectorAll(selector).length;
  const css = (el, prop) => el ? getComputedStyle(el)[prop] : 'absent';
  const rect = (el) => { if (!el?.getBoundingClientRect) return null; const r = el.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,right:r.right,bottom:r.bottom,left:r.left }; };

  function describe(el) {
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      tagName: el.tagName, id: el.id || '', className: typeof el.className === 'string' ? el.className : '',
      textContent: (el.textContent || '').trim().slice(0, 300),
      opacity:s.opacity, visibility:s.visibility, display:s.display, zIndex:s.zIndex, position:s.position,
      transform:s.transform, filter:s.filter, mixBlendMode:s.mixBlendMode, isolation:s.isolation,
      willChange:s.willChange, pointerEvents:s.pointerEvents, rect:rect(el)
    };
  }

  function visible(el) {
    const s = getComputedStyle(el); const r = rect(el);
    return !!r && r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  function runtime() {
    return { telegramVersion:window.Telegram?.WebApp?.version ?? 'unknown', telegramPlatform:window.Telegram?.WebApp?.platform ?? 'unknown', userAgent:navigator.userAgent, devicePixelRatio:window.devicePixelRatio, innerWidth:innerWidth, innerHeight:innerHeight };
  }

  function visibleTextElements() {
    const ignored = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE']);
    return [...document.querySelectorAll('*')].filter((el) => !ignored.has(el.tagName) && visible(el) && (el.textContent || '').trim() && !el.closest('#alx-diagnostic-panel') && !el.classList.contains('alx-debug-label')).map(describe);
  }

  function pointStack(label, x, y) {
    const stack = (document.elementsFromPoint?.(x, y) || []).map(describe);
    return { label, point:{x,y}, elementFromPoint:describe(document.elementFromPoint?.(x,y)), stack };
  }

  function capturePointStacks() {
    const phrase = document.querySelector('.oracle-phrase'); if (!phrase) return [];
    const r = rect(phrase); if (!r) return [];
    const points = [
      ['phrase-center', r.left+r.width/2, r.top+r.height/2],
      ['first-line-center', r.left+r.width/2, r.top+Math.max(1,r.height*.25)],
      ['second-line-center', r.left+r.width/2, r.top+Math.min(r.height-1,r.height*.75)],
      ['left-edge', r.left+1, r.top+r.height/2],
      ['right-edge', r.right-1, r.top+r.height/2],
    ];
    return points.map(([label,x,y]) => pointStack(label,x,y));
  }

  function geometry() {
    const selectors = ['#screen','#screenContent','.oracle-phrase','.orb','.orb-frame','.orb-wrap','.stage'];
    return Object.fromEntries(selectors.map((sel) => { const el=document.querySelector(sel); return [sel,{rect:rect(el),styles:el ? {opacity:css(el,'opacity'),transform:css(el,'transform'),filter:css(el,'filter'),transition:css(el,'transition'),animation:css(el,'animation'),zIndex:css(el,'zIndex'),position:css(el,'position')} : null}]; }));
  }

  function backgrounds() {
    const selectors = ['#screen','#screenContent','.oracle-phrase','.orb','.orb-frame','.orb-wrap','.stage'];
    const props = ['backgroundImage','background','mask','maskImage','webkitMask','webkitMaskImage','boxShadow','textShadow','filter','mixBlendMode'];
    return Object.fromEntries(selectors.map((sel) => { const el=document.querySelector(sel); return [sel, el ? Object.fromEntries(props.map((p)=>[p,css(el,p)])) : null]; }));
  }

  function structural() {
    return {
      screenCount:count('.screen'), idScreenCount:count('#screen'), screenContentCount:count('.screen-content'), orbCount:count('.orb'), orbWrapCount:count('.orb-wrap'),
      screenLike:[...document.querySelectorAll('[class*="screen"]')].map(describe), phraseLike:[...document.querySelectorAll('[class*="phrase"]')].map(describe),
      canvases:[...document.querySelectorAll('canvas')].map((el)=>({owner:describe(el),width:el.width,height:el.height})), svgs:[...document.querySelectorAll('svg')].map(describe), iframes:[...document.querySelectorAll('iframe')].map(describe),
      shadowRoots:[...document.querySelectorAll('*')].filter((el)=>el.shadowRoot).map((el)=>({host:describe(el),childCount:el.shadowRoot.childNodes.length}))
    };
  }

  function collect() {
    const screen=document.querySelector('#screen'); const content=document.querySelector('#screenContent'); const phrase=document.querySelector('.oracle-phrase');
    const active=[...state.typeOperations.values()].filter((op)=>op.status==='ACTIVE');
    return {
      mode:{plain:params.get('plain')==='1',noTransition:params.get('notransition')==='1',noComposite:params.get('nocomposite')==='1',noSweep:params.get('nosweep')==='1',noPseudo:params.get('nopseudo')==='1',ghost:params.get('ghost')==='1',label:params.get('label')==='1',isolate:params.get('isolate')==='1',controlledTest:params.get('test')||'NORMAL'},
      runtime:runtime(),
      dom:{screenHTML:screen?.innerHTML??null,contentHTML:content?.innerHTML??null,oraclePhraseCount:count('.oracle-phrase'),chCount:count('.oracle-phrase .ch'),idleTextCount:count('.idle-text'),idleIconCount:count('.idle-icon'),screenContentChildren:content?.children.length??0},
      allVisibleTextSources:allVisibleTextSources(),
      type:{activeOperations:active.length,operationIds:[...state.typeOperations.keys()],operations:[...state.typeOperations.values()]},
      screen:{class:screen?.className??'absent',opacity:css(screen,'opacity'),filter:css(screen,'filter'),transform:css(screen,'transform'),transition:css(screen,'transition'),animation:css(screen,'animation')},
      structural:structural(), visibleText:visibleTextElements(), geometry:geometry(), backgrounds:backgrounds(), pointStacks:state.pointStacks, snapshots:state.snapshots,
      pseudo:phrase ? {screenBefore:getComputedStyle(screen,'::before').content,screenAfter:getComputedStyle(screen,'::after').content,phraseBefore:getComputedStyle(phrase,'::before').content,phraseAfter:getComputedStyle(phrase,'::after').content} : null,
      result:{DOM_DUPLICATE:count('.oracle-phrase')>1,TYPEWRITER_SUSPECTED:active.length>1,COMPOSITING_SUSPECTED:!!screen && (css(screen,'filter')!=='none'||css(screen,'transform')!=='none'||css(screen,'opacity')!=='1')},
      events:state.events.slice(-60)
    };
  }

  function render(){ if(!reportEl)return; reportEl.textContent=JSON.stringify(collect(),null,2); }
  function record(event,payload={}){ state.events.push({time:new Date().toISOString(),event,...payload}); render(); }
  function trace(event,payload={}){ record(`TRACE_${event}`,payload); }
  function allVisibleTextSources(){ return [...document.querySelectorAll('*')].map((el)=>{ const s=getComputedStyle(el); const r=rect(el); return {tagName:el.tagName,id:el.id||'',className:typeof el.className==='string'?el.className:'',innerText:(el.innerText||'').trim(),textContent:(el.textContent||'').trim(),childElementCount:el.childElementCount,display:s.display,visibility:s.visibility,opacity:s.opacity,zIndex:s.zIndex,rect:r}; }).filter((x)=>x.innerText && x.rect && x.rect.width>0 && x.rect.height>0 && x.display!=='none' && x.visibility!=='hidden' && x.opacity!=='0'); }
  function snapshot(label){ const snap={label,time:new Date().toISOString(),dom:{screenHTML:document.querySelector('#screen')?.innerHTML??null,contentHTML:document.querySelector('#screenContent')?.innerHTML??null,childCount:document.querySelector('#screenContent')?.children.length??0,oraclePhraseCount:count('.oracle-phrase'),textElementCount:visibleTextElements().length,visibleText:visibleTextElements()},screenClass:document.querySelector('#screen')?.className??null}; state.snapshots.push(snap); state.pointStacks=capturePointStacks(); record(`SNAPSHOT_${label}`,{snapshot:snap}); return snap; }

  function applyLabels(){
    document.querySelectorAll('.alx-debug-label').forEach((el)=>el.remove());
    state.labels=[];
    if(params.get('label')!=='1')return;
    [...document.querySelectorAll('*')].filter((el)=>!el.closest('#alx-diagnostic-panel')&&!el.classList.contains('alx-debug-label')&&visible(el)&&(el.textContent||'').trim()).forEach((el,i)=>{ el.style.outline='2px solid red'; const r=rect(el); if(!r)return; const label=document.createElement('span'); label.className='alx-debug-label'; label.textContent=`#${i} ${el.id?'#'+el.id:''}${typeof el.className==='string'&&el.className?'.'+el.className.split(/\s+/)[0]:''}`; label.style.cssText=`position:fixed;z-index:2147483646;left:${Math.max(0,r.left)}px;top:${Math.max(0,r.top)}px;background:red;color:white;font:10px monospace;pointer-events:none;padding:1px;`; document.body.appendChild(label); state.labels.push({index:i,element:describe(el),label:label.textContent}); });
  }

  function createPanel(){
    if(panel)return; panel=document.createElement('aside'); panel.id='alx-diagnostic-panel'; panel.innerHTML='<div class="alx-diagnostic-head"><strong>ALX FORENSICS · TELEGRAM</strong><button id="alx-diagnostic-refresh" type="button">REFRESH</button></div><pre id="alx-diagnostic-report"></pre><div class="alx-diagnostic-actions"><button id="alx-diagnostic-copy" type="button">COPY DIAGNOSTICS</button><button id="alx-diagnostic-hide" type="button">HIDE PHRASE</button><button id="alx-diagnostic-remove" type="button">REMOVE PHRASE</button></div><div id="alx-diagnostic-copy-status" role="status"></div>'; document.body.appendChild(panel); reportEl=panel.querySelector('#alx-diagnostic-report');
    panel.querySelector('#alx-diagnostic-refresh').addEventListener('click',()=>{applyLabels();state.pointStacks=capturePointStacks();snapshot('MANUAL');});
    panel.querySelector('#alx-diagnostic-hide').addEventListener('click',()=>{const p=document.querySelector('.oracle-phrase'); if(p)p.style.visibility='hidden'; record('HIDE_PHRASE',{phrase:describe(p),visibleText:allVisibleTextSources()});});
    panel.querySelector('#alx-diagnostic-remove').addEventListener('click',()=>{document.querySelector('#screenContent')?.replaceChildren(); record('REMOVE_PHRASE',{remainingScreenContent:document.querySelector('#screenContent')?.innerHTML??null,phraseCount:count('.oracle-phrase')});});
    panel.querySelector('#alx-diagnostic-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(reportEl.textContent);panel.querySelector('#alx-diagnostic-copy-status').textContent='COPIED';}catch(e){panel.querySelector('#alx-diagnostic-copy-status').textContent='COPY FAILED — выделите отчёт вручную';}}); render();
  }

  window.ALX_DIAG={
    onTypeStart(sceneId,label,textValue){const id=`${sceneId}:${Date.now()}:${state.typeOperations.size+1}`;state.typeOperations.set(id,{id,sceneId:text(sceneId),label:text(label),text:text(textValue),status:'ACTIVE',startedAt:new Date().toISOString()});record('TYPE_START',{id,sceneId,label});},
    onTypeComplete(sceneId,label){const op=[...state.typeOperations.values()].reverse().find((item)=>item.status==='ACTIVE'&&item.sceneId===text(sceneId));if(op){op.status='COMPLETE';op.completedAt=new Date().toISOString();}record('TYPE_COMPLETE',{id:op?.id??null,sceneId,label});},
    onTypeAbort(sceneId,label){const op=[...state.typeOperations.values()].reverse().find((item)=>item.status==='ACTIVE'&&item.sceneId===text(sceneId));if(op){op.status='ABORT';op.abortedAt=new Date().toISOString();}record('TYPE_ABORT',{id:op?.id??null,sceneId,label});},
    snapshot,
    getReport:collect,
    trace,
    lifecycle:(event,payload={})=>trace(event,payload)
  };

  function installStyles(){
    const style=document.createElement('style'); const rules=[];
    if(params.get('notransition')==='1')rules.push('.screen,.screen *{transition:none!important}');
    if(params.get('nocomposite')==='1')rules.push('.screen{transform:none!important;filter:none!important;will-change:auto!important;backface-visibility:visible!important;-webkit-backface-visibility:visible!important}');
    if(params.get('nosweep')==='1')rules.push('.screen.sweep::after{animation:none!important;transform:none!important}');
    if(params.get('nopseudo')==='1')rules.push('.screen::before,.screen::after{display:none!important}');
    if(params.get('isolate')==='1')rules.push('.screen,.screen-content,.orb,.orb-frame,.orb-wrap{isolation:isolate!important}');
    const test=params.get('test');
    if(test==='visibility')rules.push('.oracle-phrase{visibility:hidden!important}');
    if(test==='opacity')rules.push('.oracle-phrase{opacity:0!important}');
    if(test==='leafstyle')rules.push('.oracle-phrase,#screenContent,#screen{text-shadow:none!important;filter:none!important;transform:none!important}');
    if(test==='isolatecontent')rules.push('#screenContent{isolation:isolate!important;transform:translateZ(0)!important;-webkit-transform:translateZ(0)!important}');
    style.textContent=rules.join('')+`#alx-diagnostic-panel{position:fixed;z-index:2147483647;left:8px;right:8px;bottom:8px;max-height:48vh;display:flex;flex-direction:column;gap:6px;padding:10px;color:#f6ecd7;background:rgba(8,6,15,.96);border:2px solid #e3bd71;border-radius:12px;font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 0 24px rgba(0,0,0,.8)}#alx-diagnostic-panel strong{color:#f2c879;font-size:11px}#alx-diagnostic-panel button{min-height:38px;color:#120d1e;background:#e3bd71;border:0;border-radius:8px;font:700 12px ui-monospace,SFMono-Regular,Menlo,monospace}#alx-diagnostic-panel .alx-diagnostic-head{display:flex;justify-content:space-between;align-items:center;gap:8px}#alx-diagnostic-panel #alx-diagnostic-refresh{min-height:28px;padding:0 8px;font-size:10px}#alx-diagnostic-panel .alx-diagnostic-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}#alx-diagnostic-report{margin:0;max-height:32vh;overflow:auto;white-space:pre-wrap;word-break:break-word;color:#f6ecd7}#alx-diagnostic-copy-status{min-height:16px;color:#9fe5ae;text-align:center}.alx-debug-label{font:10px monospace!important}`;
    document.head.appendChild(style);
  }

  function start(){installStyles();createPanel();record('DIAGNOSTIC_READY',{url:location.href});const content=document.querySelector('#screenContent');if(content){const observer=new MutationObserver(()=>{applyLabels();record('DOM_MUTATION');});observer.observe(content,{childList:true,subtree:true,characterData:true});}setInterval(()=>{applyLabels();render();},500);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
