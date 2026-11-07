(function () {
  'use strict';
  const M=window.DialModel, B=window.wandBridge, $=id=>document.getElementById(id);
  const STORAGE='wand.dial.v1';
  let data;try{data=M.normalize(JSON.parse(localStorage.getItem(STORAGE)));}catch{data=M.normalize();}
  let editing=false,draft=null,before=null,scroll=false,firstConnection=true,settingsOpen=false;
  const pointers=new Map();
  let geometry=null,resizeFrame=0,noticeTimer=0,feedbackTimer=0,menuOpen=false,swallowMenuClick=false,rimPage=0,rimSlots=[],controlDrag=null,scrollTurn=0,scrollGeometry=null,scrollFilter={angle:0},scrollStarted=0,scrollBaseline=null,scrollAxis=null,scrollFrame=0,scrollLastFrame=0;
  const current=()=>editing?draft:data.presets[data.current];
  const orientation=()=>innerWidth>innerHeight?'landscape':'portrait';
  let editOrientation=orientation();
  const view=()=>current().views[editing?editOrientation:orientation()];
  function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(data));return true;}
    catch{notice('Safari could not save this layout. It works for this session.');return false;}}
  function notice(text){clearTimeout(noticeTimer);$('dialNotice').textContent=text;$('dialNotice').classList.add('show');noticeTimer=setTimeout(()=>$('dialNotice').classList.remove('show'),2200);}
  function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  const micIcon=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" pointer-events="none"><rect x="-5" y="-15" width="10" height="20" rx="5" fill="currentColor" stroke="none"/><path d="M-10 -3v3a10 10 0 0 0 20 0v-3M0 10v8M-6 18H6"/></g>`;
  function actions(){return B.actions();}
  function action(id){return actions().find(a=>a.id===id);}
  function assigned(zone){return action(current()[zone==='outer'?'outer':zone==='inner'?'inner':'right'])||action(zone==='outer'?'left':zone==='inner'?'mic':'right');}
  function order(){const p=current(),all=actions(),ids=new Set(all.map(a=>a.id));
    const result=[...p.order.filter(id=>ids.has(id)),...all.filter(a=>a.pinned && !p.order.includes(a.id) && !p.hidden?.includes(a.id)).map(a=>a.id)];
    return result.length?result:['left'];}
  const initialHTML=`<div id="dialRoot">
    <svg id="dialStage" xmlns="http://www.w3.org/2000/svg" aria-label="Air mouse dial"></svg>
    <header class="dial-header"><div class="dial-connection"><span id="dialConnectionDot" class="dial-dot"></span><span id="dialConnection">Offline</span></div><button id="dialMenuToggle" aria-expanded="false" aria-controls="dialMenu">Menu <span aria-hidden="true">⌄</span></button></header>
    <nav id="dialMenu" hidden aria-label="Remote menu"><button id="dialEdit">Edit layout</button><button id="dialPreset" aria-label="Choose saved grip">Saved grips</button><button id="dialMore">Shortcuts & macros</button><button id="dialSettings">Settings & calibration</button><div class="dial-menu-feedback"><label><input id="dialRingHaptics" type="checkbox"> Ring haptics</label><label><input id="dialRingSound" type="checkbox"> Ring tick sound</label><p id="dialFeedbackHint"></p></div></nav>
    <div id="dialDock" aria-label="Pointer controls"><button id="dialMotion" aria-pressed="false" aria-label="Enable motion"><span class="dial-dot"></span><span id="dialMotionIcon" aria-hidden="true">&#9654;</span></button><button id="dialMotionGrip" class="dial-control-grip" hidden aria-label="Move Motion button" data-control="motion">&#10495;</button></div>
    <div id="dialEditbar" class="dial-editbar" hidden><button id="dialCancel">Cancel</button><button id="dialCustomize" aria-label="Sizes &amp; actions" title="Sizes &amp; actions">☷</button><button id="dialSave" aria-label="Save layout">Save</button></div>
    <div id="dialNotice" role="status" aria-live="polite"></div>
  </div>`;
  $('app').insertAdjacentHTML('beforeend',initialHTML);
  document.body.classList.add('dial-view');
  // These settings belong to the previous pad layout. Keep their stored values
  // for the calibration pad, without presenting inactive dial controls.
  for(const id of ['cTapClick','cDragLock','cStrip','cTwoFinger','cMirror','cShowHot'])$(id).closest('label').hidden=true;
  $('sScrollPx').closest('.row').hidden=true;
  const clutchRow=$('sClutch').closest('.row');clutchRow.hidden=true;
  const feedbackHint=$('hapticReal').closest('#realRow')?.nextElementSibling;
  if(feedbackHint?.classList.contains('hint'))feedbackHint.textContent='The reference switch tests native switch feedback. Custom rotary surfaces use visual feedback and optional click sound; vibration depends on your browser.';
  const feedbackDetail=$('hapticSupport').previousElementSibling;
  if(feedbackDetail?.classList.contains('hint'))feedbackDetail.textContent='Enable Click sound on press for an audible response. The ringer switch can mute it, and Bluetooth audio may add a delay.';
  if(clutchRow.nextElementSibling?.classList.contains('hint'))clutchRow.nextElementSibling.hidden=true;
  for(const id of ['cDragLock','cStrip']){
    const hint=$(id).closest('.toggles')?.nextElementSibling;
    if(hint?.classList.contains('hint'))hint.hidden=true;
    if(id==='cStrip'&&hint?.nextElementSibling?.classList.contains('hint'))hint.nextElementSibling.hidden=true;
  }
  document.body.insertAdjacentHTML('beforeend',`<section id="dialEditor" hidden aria-label="Customize dial"><div class="dial-editor-head"><h2>Customize dial</h2><button id="dialEditorBack">Back to dial</button></div><p class="dial-hint">Move each circle on the dial, or use the controls below. Each orientation saves its own positions. Changes take effect when you save the layout.</p>
    <label for="dialName">Grip name</label><input id="dialName" type="text" maxlength="24">
    <div id="dialSliders"></div><label for="dialOuterAction">Large pad assignment</label><select id="dialOuterAction"></select><label for="dialInnerAction">Mic circle assignment</label><select id="dialInnerAction"></select><label for="dialRightAction">Small circle assignment</label><select id="dialRightAction"></select>
    <h3>Rim shortcuts</h3><p class="dial-hint">Tap a rim button to run it immediately. The large pad keeps its own assignment. Drag the rim buttons in Edit or reorder them here.</p><ol id="dialOrder"></ol>
    <label for="dialAddAction">Add a shortcut or macro</label><select id="dialAddAction"></select><button id="dialAdd">Add action</button><button id="dialReset">Reset this orientation</button>
    <p class="dial-hint">Create custom macros in Menu → Shortcuts & macros. Save this grip, then use Menu → Saved grips to save a copy (up to eight presets).</p>
  </section><section id="dialPresets" hidden aria-label="Saved grips"><h2>Saved grips</h2><div id="dialPresetList"></div><button id="dialPresetCopy">Save a copy of current grip</button><button id="dialPresetClose">Back</button></section>`);
  const glass=window.DialGlass?.mount($('dialRoot'));
  const sliders=[['r','Outer wheel size',.5,1.3],['bw','Function selector thickness',.1,.25],['mr','Mic circle size',.25,.65],['rr','Right Click size',.25,.55],
    ['x','Wheel horizontal position',.25,1.25],['y','Wheel vertical position',.28,.75],
    ['mx','Mic horizontal offset',-.6,.6],['my','Mic vertical offset',-.6,.6],
    ['rx','Right Click horizontal offset',-.6,.6],['ry','Right Click vertical offset',-.6,.6],
    ['sr','Scroll button size',.08,.22],['sx','Scroll horizontal offset',-1,1],['sy','Scroll vertical offset',-1,1],['motionX','Motion horizontal position',0,.9],['motionY','Motion vertical position',.03,.9]];
  $('dialSliders').innerHTML=sliders.map(([key,label,min,max])=>`<label for="dialRange_${key}">${label}</label><input id="dialRange_${key}" type="range" min="${min}" max="${max}" step="0.01">`).join('');
  for(const [key] of sliders) $('dialRange_'+key).addEventListener('input',e=>{
    const v=view();v[key]=Number(e.target.value);if(key==='motionX'||key==='motionY')v.motionFree=1;Object.assign(v,M.view(v));render();
  });
  function setMotion(on){
    if(on && (!B.ready() || editing || settingsOpen || menuOpen || B.busy())) {notice('Connect and close menus before enabling motion.');return;}
    if(!on) {releaseAll();B.stop();}
    B.motion(!!on);renderState();
  }
  function pause(){releaseAll();B.stop();B.motion(false);renderState();}
  function renderState(){
    const live=B.motionEnabled();
    $('dialMotion').setAttribute('aria-pressed',String(live));
    $('dialMotionIcon').textContent=live?'Ⅱ':'▶';
    $('dialMotion').setAttribute('aria-label',live?'Pause motion':'Enable motion');
    $('dialMotion').title=live?'Motion on — tap to pause':'Motion paused — tap to resume';
    $('dialConnection').textContent=B.connection();
    $('dialConnectionDot').classList.toggle('connected',B.ready());
    glass?.wake();
  }
  function releaseAll(){
    const wasScrolling=scroll;
    for(const p of pointers.values()){if(p.release)p.release();}pointers.clear();
    if(editing&&controlDrag)Object.assign(view(),controlDrag.before);controlDrag=null;
    scroll=false;scrollFilter={angle:0};scrollBaseline=null;scrollAxis=null;if(scrollFrame)cancelAnimationFrame(scrollFrame);scrollFrame=0;scrollLastFrame=0;B.scrolling(false);
    $('dialStage').querySelectorAll('.active').forEach(el=>el.classList.remove('active'));
    if(wasScrolling)render();
  }
  function setScrollHeld(on){
    if(on){
      if(scroll)return;
      releaseAll();B.stop();scroll=true;scrollFilter={angle:0};scrollStarted=performance.now();const pose=B.motionScrollPose();scrollBaseline=pose&&scrollStarted-pose.t<=500?pose.pitch:null;scrollAxis=pose?.axis??null;B.scrolling(true);B.haptic();scrollFrame=requestAnimationFrame(scrollTick);
    }else{
      if(!scroll)return;
      scroll=false;scrollFilter={angle:0};scrollBaseline=null;scrollAxis=null;if(scrollFrame)cancelAnimationFrame(scrollFrame);scrollFrame=0;scrollLastFrame=0;B.scrolling(false);
    }
    render();
  }
  function scrollTick(){
    const now=performance.now();scrollFrame=0;if(!scroll)return;
    if(editing||menuOpen||B.busy()||!B.ready()){releaseAll();return;}
    const dt=scrollLastFrame?Math.min(.05,Math.max(0,(now-scrollLastFrame)/1000)):0;scrollLastFrame=now;
    const pose=B.motionScrollPose();
    if(!pose||!Number.isFinite(pose.pitch)||now-pose.t>500||now<pose.t){
      scrollBaseline=null;scrollAxis=null;scrollFilter={angle:0};
    }else{
      if(scrollBaseline===null||scrollAxis!==pose.axis){scrollBaseline=pose.pitch;scrollAxis=pose.axis;scrollFilter={angle:0};}
      if(now-scrollStarted>=90){
        const step=M.tiltScrollStep(scrollFilter,pose.pitch-scrollBaseline,dt,B.scrollSensitivity());scrollFilter=step;
        if(Math.abs(step.notches)>=.0005){
          B.wheel(step.notches);
          if(!matchMedia('(prefers-reduced-motion: reduce)').matches){scrollTurn=(scrollTurn+step.notches*12)%360;$('dialScrollTicks')?.setAttribute('transform',`rotate(${scrollTurn} ${geometry.cx} ${geometry.cy})`);}
        }
      }
    }
    scrollFrame=requestAnimationFrame(scrollTick);
  }
  const textMeasure=document.createElement('canvas').getContext('2d'),textWidths=new Map();
  function textWidth(text,size){
    const key=size+'|'+text;if(textWidths.has(key))return textWidths.get(key);
    if(textWidths.size>4096)textWidths.clear();
    if(textMeasure)textMeasure.font='650 '+size+'px system-ui, -apple-system, sans-serif';
    const width=textMeasure?textMeasure.measureText(text).width:text.length*size*.7;textWidths.set(key,width);return width;
  }
  function singleLine(text,size,width){
    if(textWidth(text,size)<=width)return text;
    let value=text;while(value&&textWidth(value+'\u2026',size)>width)value=value.slice(0,-1);
    return value?value+'\u2026':'';
  }
  function titleLines(text,size,width){
    const lines=[];let line='';
    for(const word of text.split(/\s+/)){
      if(textWidth(word,size)>width){if(word.length<12)return ['','',''];if(line){lines.push(line);line='';}let part='';for(const c of word){if(part&&textWidth(part+c,size)>width){lines.push(part);part='';}part+=c;}line=part;}
      else if(line&&textWidth(line+' '+word,size)>width){lines.push(line);line=word;}
      else line+=(line?' ':'')+word;
    }
    if(line)lines.push(line);return lines;
  }
  function textBoxes(parent,child,w,h,obstacles){
    // Keep type inside the round surface and outside the nested button's cutout.
    // Several inscribed bands let it find room as the circles are moved or resized.
    const r=Math.max(8,parent.r-(parent.r<40?4:8)),{x,y}=parent,boxes=[];
    if(!child)boxes.push({x:x-r*.67,y:y-r*.67,w:r*1.34,h:r*1.34});
    else for(const f of [.25,.45,.6]){
      const edge=Math.sqrt(1-f*f)*r,near=r*.6;
      boxes.push({x:x-edge,y:y-f*r,w:Math.min(x+near,child.x-child.r-8)-(x-edge),h:2*f*r});
      boxes.push({x:Math.max(x-near,child.x+child.r+8),y:y-f*r,w:x+edge-Math.max(x-near,child.x+child.r+8),h:2*f*r});
      boxes.push({x:x-f*r,y:y-edge,w:2*f*r,h:Math.min(y+near,child.y-child.r-8)-(y-edge)});
      boxes.push({x:x-f*r,y:Math.max(y-near,child.y+child.r+8),w:2*f*r,h:y+edge-Math.max(y-near,child.y+child.r+8)});
    }
    let result=boxes.map(b=>{const right=Math.min(w-8,b.x+b.w),bottom=Math.min(h-8,b.y+b.h),x=Math.max(8,b.x),y=Math.max(8,b.y);return {x,y,w:right-x,h:bottom-y};}).filter(b=>b.w>=20&&b.h>=18);
    for(const o of obstacles){const next=[];for(const b of result){
      if(b.x>=o.x+o.w||b.x+b.w<=o.x||b.y>=o.y+o.h||b.y+b.h<=o.y){next.push(b);continue;}
      next.push({x:b.x,y:b.y,w:o.x-b.x-3,h:b.h},{x:o.x+o.w+3,y:b.y,w:b.x+b.w-o.x-o.w-3,h:b.h},{x:b.x,y:b.y,w:b.w,h:o.y-b.y-3},{x:b.x,y:o.y+o.h+3,w:b.w,h:b.y+b.h-o.y-o.h-3});
    }result=next.filter(b=>b.w>=20&&b.h>=18).sort((a,b)=>b.w*b.h-a.w*a.h).slice(0,36);}
    return result;
  }
  function surfaceText(parent,child,a,prefer,maxFont,w,h,obstacles,clipId){
    let best=null;
    const title=child?a.name.toUpperCase():a.name;
    const boxes=textBoxes(parent,child,w,h,obstacles),hasIcon=a.id==='mic';
    for(const box of boxes)for(let size=Math.max(10,maxFont);size>=10;size-=.5){
      const lines=titleLines(title,size,box.w-4);if(lines.length>2)continue;
      for(const icon of (hasIcon?[true,false]:[false]))for(const hint of [true,false]){
        const hs=10.5,iconH=icon?28:0,hh=hint&&a.hint&&textWidth(a.hint,hs)<=box.w-6?hs+7:0,total=iconH+(icon?7:0)+lines.length*size*1.13+hh;
        if(total>box.h-4)continue;
        const distance=Math.hypot(box.x+box.w/2-prefer.x,box.y+box.h/2-prefer.y);
        const score=size*8-distance*.8+(icon?8:0)+(hh?3:0);
        if(!best||score>best.score)best={box,lines,size,icon,hh,hs,total,score};
      }
    }
    if(!best&&boxes.length){const box=boxes.sort((a,b)=>b.w*b.h-a.w*a.h)[0];best={box,lines:[singleLine(title,10,box.w-4)],size:10,icon:false,hh:0,total:12};}
    if(!best)return '';
    const {box,lines,size,icon,hh,hs,total}=best,cx=box.x+box.w/2;let y=box.y+(box.h-total)/2;
    let out=`<g clip-path="url(#${clipId})" pointer-events="none"><title>${escape(a.name+' — '+a.hint)}</title>`;
    if(icon){out+=`<g style="color:#eeeeee">${micIcon(cx,y+13,.8)}</g>`;y+=35;}
    out+=`<text class="dial-label" x="${cx}" y="${y+size*.83}" font-size="${size}" font-weight="650">`;
    for(let i=0;i<lines.length;i++)out+=`<tspan x="${cx}" dy="${i?size*1.13:0}">${escape(lines[i])}</tspan>`;
    out+='</text>';
    if(hh)out+=`<text class="dial-label dial-secondary" x="${cx}" y="${y+lines.length*size*1.13+hs+3}" font-size="${hs}">${escape(singleLine(a.hint,hs,box.w-6))}</text>`;
    return out+'</g>';
  }
  function circlePath(c){return `M${c.x-c.r} ${c.y}a${c.r} ${c.r} 0 1 0 ${c.r*2} 0a${c.r} ${c.r} 0 1 0 ${-c.r*2} 0Z`;}
  function scrollMarks(g){
    const radius=g.clickR-9,long=Math.min(18,g.clickR*.08),short=long*.48;
    let ticks='';
    for(let i=0;i<72;i++){
      const length=i%6===0?long:short;
      ticks+=`<g transform="translate(${g.cx} ${g.cy}) rotate(${i*5})"><line class="dial-tick-shadow" x1=".8" x2=".8" y1="${-radius+1}" y2="${-radius+length+1}"/><line class="dial-tick ${i%6===0?'major':''}" x1="0" x2="0" y1="${-radius}" y2="${-radius+length}"/></g>`;
    }
    return `<g class="dial-scroll-scale" clip-path="url(#dialClipOuter)" pointer-events="none" aria-hidden="true"><circle class="dial-scroll-track" cx="${g.cx}" cy="${g.cy}" r="${g.clickR-16}"/><circle class="dial-scroll-track-edge" cx="${g.cx}" cy="${g.cy}" r="${g.clickR-28}"/><g id="dialScrollTicks" transform="rotate(${scrollTurn} ${g.cx} ${g.cy})">${ticks}</g></g>`;
  }
  function render(){
    const focused=$('dialStage').contains(document.activeElement)?document.activeElement:null;
    const focusZone=focused?.dataset.zone,focusAction=focused?.dataset.action,focusPage=focused?.dataset.page;
    const root=$('dialRoot'),w=root.clientWidth,h=root.clientHeight,v=view(),p=current();
    root.classList.toggle('editing',editing);
    geometry=M.geometry(v,w,h);const g=geometry;
    const ids=order();
    const selected=assigned('outer'),inner=assigned('inner'),right=assigned('right');
    const font=Math.max(14,Math.min(25,w*.055));
    const ringR=g.clickR;
    const safeTop=parseFloat(getComputedStyle(root).getPropertyValue('--dial-safe-top'))||0;
    $('dialMenuToggle').hidden=editing;$('dialEditbar').hidden=!editing;
    const rootRect=root.getBoundingClientRect();
    const rectFor=el=>{const b=el.getBoundingClientRect();return {x:b.x-rootRect.x,y:b.y-rootRect.y,w:b.width,h:b.height};};
    const headerBlocks=['dialMenuToggle','dialEditbar','dialConnection'].map(id=>$(id)).filter(el=>!el.hidden).map(rectFor);
    const motion=$('dialMotion');
    const bounds={left:10,top:editing?Math.max(safeTop+74,rectFor($('dialEditbar')).y+$('dialEditbar').offsetHeight+18):safeTop+42,right:w-10,bottom:h-20};
    // Preserve the former dock's Motion position when loading an older saved grip.
    const motionRect=M.placeControl({x:v.motionFree?w*v.motionX:w*v.dockX+131,y:v.motionFree?h*v.motionY:h*v.dockY,w:motion.offsetWidth,h:motion.offsetHeight},bounds,headerBlocks);
    motion.style.left=motionRect.x+'px';motion.style.top=motionRect.y+'px';
    const grip=$('dialMotionGrip');grip.hidden=!editing;
    grip.style.left=Math.max(2,motionRect.x-10)+'px';grip.style.top=Math.max(safeTop+2,motionRect.y-12)+'px';motion.classList.toggle('dial-control-editing',editing);
    const controlObstacles=[...headerBlocks,...[motion,grip].filter(el=>!el.hidden).map(rectFor)].map(b=>({x:b.x-3,y:b.y-3,w:b.w+6,h:b.h+6}));
    scrollGeometry=M.scrollButton(v,g,w,h,controlObstacles);
    const sb=scrollGeometry,scrollCircle={x:sb.x,y:sb.y,r:sb.r};
    const obstacles=[...controlObstacles,{x:sb.x-sb.r-5,y:sb.y-sb.r-5,w:sb.r*2+10,h:sb.r*2+10}];
    const outerCircle={x:g.cx,y:g.cy,r:ringR},innerCircle={x:g.mx,y:g.my,r:g.mr},rightCircle={x:g.rx,y:g.ry,r:g.rr};
    let svg=`<defs>
      <radialGradient id="dialBg" cx="28%" cy="14%" r="95%"><stop stop-color="#666666"/><stop offset=".35" stop-color="#2b2b2b"/><stop offset=".85" stop-color="#151515"/><stop offset="1" stop-color="#0b0b0b"/></radialGradient>
      <radialGradient id="dialInner" cx="30%" cy="15%" r="95%"><stop stop-color="#737373"/><stop offset=".4" stop-color="#303030"/><stop offset="1" stop-color="#101010"/></radialGradient>
      <linearGradient id="dialKey" x2=".25" y2="1"><stop stop-color="#414141"/><stop offset=".5" stop-color="#262626"/><stop offset="1" stop-color="#151515"/></linearGradient>
      <linearGradient id="dialBevel" x1="0" y1="0" x2=".65" y2="1"><stop stop-color="#dedede" stop-opacity=".78"/><stop offset=".45" stop-color="#999999" stop-opacity=".27"/><stop offset="1" stop-color="#050505" stop-opacity=".85"/></linearGradient>
      <filter id="dialShadow" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="3" flood-color="#000000" flood-opacity=".8"/></filter>
      <filter id="dialKeyShadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="1.2" flood-color="#000000" flood-opacity=".8"/></filter>
      <clipPath id="dialClipOuter"><path clip-rule="evenodd" d="${circlePath(outerCircle)} ${circlePath(innerCircle)} ${circlePath(scrollCircle)}"/></clipPath>
      <clipPath id="dialClipInner"><path clip-rule="evenodd" d="${circlePath(innerCircle)} ${circlePath(rightCircle)}"/></clipPath>
      <clipPath id="dialClipRight"><circle cx="${g.rx}" cy="${g.ry}" r="${g.rr}"/></clipPath>
      <clipPath id="dialClipScroll"><circle cx="${sb.x}" cy="${sb.y}" r="${sb.r}"/></clipPath>
    </defs>`;
    svg+=`<g class="dial-bezel" data-zone="bezel"><path d="${circlePath({x:g.cx,y:g.cy,r:g.r})} ${circlePath(outerCircle)}" fill-rule="evenodd" fill="#141414" stroke="#3b3b3b" stroke-width="1"/>`;
    const availableKeys=M.rimKeys(g,w,h,obstacles);
    const page=M.rimPage(ids,rimPage,g.r,g.bezelWidth,availableKeys.length);rimPage=page.index;rimSlots=[];
    const count=page.slots;
    const keys=page.items.map((id,i)=>({id,index:i}));
    if(page.pages>1)keys.push({next:true,index:count-1});
    for(const key of keys){
      const a=key.next?{name:'Next '+(page.index+1)+'/'+page.pages}:action(key.id);if(!a)continue;
      const slot=availableKeys[Math.round((count>1?key.index/(count-1):.5)*(availableKeys.length-1))];if(!slot)continue;
      const {x,y,rotation,kw,kh}=slot;
      let name=a.name;
      let fs=Math.min(14,w*.037);while(fs>11&&textWidth(name,fs)>kw-14)fs-=.5;name=singleLine(name,fs,kw-14);
      svg+=`<g class="dial-rim-key" ${key.next?'data-page="next"':`data-action="${escape(key.id)}"`} transform="translate(${x} ${y}) rotate(${rotation})" role="button" tabindex="0" aria-label="${key.next?'Next shortcuts page':'Run '+escape(a.name)}"><title>${escape(a.name)}</title><rect class="dial-key-face" x="${-kw/2}" y="${-kh/2}" width="${kw}" height="${kh}" rx="${kh*.4}" fill="url(#dialKey)" stroke="url(#dialBevel)" stroke-width="1" filter="url(#dialKeyShadow)"/><text class="dial-label" x="0" y="0" dominant-baseline="central" font-weight="650" font-size="${fs}">${escape(name)}</text></g>`;
      if(!key.next)rimSlots.push({id:key.id,x,y});
    }
    svg+='</g>';
    svg+=`<g data-zone="outer" class="dial-press" role="button" tabindex="0" aria-label="${escape(selected.name)}"><circle class="dial-surface" cx="${g.cx}" cy="${g.cy}" r="${ringR}" fill="url(#dialBg)" stroke="url(#dialBevel)" stroke-width="1.5" filter="url(#dialShadow)"/>`;
    if(scroll)svg+=scrollMarks(g);
    const leftEdge=Math.max(8,g.cx-ringR),rightEdge=Math.min(w-8,g.cx+ringR);
    const leftGap=Math.max(0,g.mx-g.mr-leftEdge),rightGap=Math.max(0,rightEdge-g.mx-g.mr);
    const labelX=leftGap>=rightGap?(leftEdge+g.mx-g.mr)/2:(rightEdge+g.mx+g.mr)/2;
    const outerInfo={...selected,hint:selected.id==='left'?'hold to drag':selected.hint};
    svg+=surfaceText({...outerCircle,r:ringR-(scroll?Math.min(18,(ringR-g.mr)*.3):0)},innerCircle,outerInfo,{x:labelX,y:g.cy},font,w,h,obstacles,'dialClipOuter')+'</g>';
    svg+=`<g data-zone="inner" class="dial-press" role="button" tabindex="0" aria-label="${escape(inner.name)}"><circle class="dial-surface" cx="${g.mx}" cy="${g.my}" r="${g.mr}" fill="url(#dialInner)" stroke="url(#dialBevel)" stroke-width="1.5" filter="url(#dialShadow)"/>`;
    svg+=surfaceText(innerCircle,rightCircle,inner,{x:g.mx,y:g.my-g.mr*.3},Math.min(25,g.mr*.24),w,h,obstacles,'dialClipInner')+'</g>';
    svg+=`<g data-zone="right" class="dial-press" role="button" tabindex="0" aria-label="${escape(right.name)}"><circle class="dial-surface" cx="${g.rx}" cy="${g.ry}" r="${g.rr}" fill="url(#dialInner)" stroke="url(#dialBevel)" stroke-width="1.5" filter="url(#dialShadow)"/>`;
    svg+=surfaceText(rightCircle,null,{...right,hint:''},{x:g.rx,y:g.ry},Math.min(16,g.rr*.4),w,h,obstacles,'dialClipRight')+'</g>';
    svg+=`<g data-zone="scroll" class="dial-press dial-scroll-button ${scroll?'active':''}" role="button" tabindex="0" aria-label="Hold Scroll, tilt up or down, return to neutral to stop" aria-pressed="${scroll}"><circle class="dial-surface" cx="${sb.x}" cy="${sb.y}" r="${sb.r}" fill="url(#dialInner)" stroke="url(#dialBevel)" stroke-width="1.5" filter="url(#dialShadow)"/>`;
    svg+=surfaceText(scrollCircle,null,{id:'scroll',name:'Scroll',hint:'hold'},{x:sb.x,y:sb.y},Math.min(15,sb.r*.36),w,h,controlObstacles,'dialClipScroll')+'</g>';
    const ix=g.cx+(g.cx>w/2?-g.r+3:g.r-3);svg+=`<circle class="dial-index" cx="${ix}" cy="${g.cy}" r="4" fill="#bfbfbf" pointer-events="none"/>`;
    if(editing)for(const [zone,x,y,r] of [['outer',g.cx,g.cy,g.r],['inner',g.mx,g.my,g.mr],['right',g.rx,g.ry,g.rr],['scroll',sb.x,sb.y,sb.r]]){
      svg+=`<circle class="dial-edit-outline" cx="${x}" cy="${y}" r="${r}"/><circle data-resize="${zone}" class="dial-handle" cx="${x-r*.82}" cy="${y-r*.57}" r="13"/>`;
    }
    $('dialStage').setAttribute('viewBox',`0 0 ${w} ${h}`);$('dialStage').innerHTML=svg;
    glass?.layout(g,w,h,scroll);
    if(focusZone)$('dialStage').querySelector('[data-zone="'+focusZone+'"]')?.focus({preventScroll:true});
    else if(focusAction)$('dialStage').querySelector('[data-action="'+CSS.escape(focusAction)+'"]')?.focus({preventScroll:true});
    else if(focusPage)$('dialStage').querySelector('[data-page]')?.focus({preventScroll:true});
    $('dialPreset').textContent='Saved grips · '+p.name;
    $('dialMenuToggle').hidden=editing;
    $('dialEditbar').hidden=!editing;renderState();
  }
  function detent(){
    B.detent();clearTimeout(feedbackTimer);$('dialRoot').classList.remove('detent');
    void $('dialRoot').offsetWidth;$('dialRoot').classList.add('detent');
    feedbackTimer=setTimeout(()=>$('dialRoot').classList.remove('detent'),110);
  }
  function fireRim(id){
    if(editing||scroll||menuOpen||!B.ready()||B.busy())return;
    const a=action(id);if(!a)return;B.tap(a);notice(a.name+' sent.');detent();
  }
  function holdRim(point){
    const a=action(point.actionId);
    if(a?.key!=='backspace'||!B.ready()||B.busy())return;
    point.heldShortcut=true;point.release=B.press(a,false);detent();
  }
  function nextPage(){rimPage++;render();}
  const stage=$('dialStage');
  stage.addEventListener('pointerdown',e=>{
    const target=e.target.closest('[data-action],[data-page],[data-zone],[data-resize]');if(!target || pointers.has(e.pointerId))return;
    const zone=target.dataset.action?'shortcut':target.dataset.page?'page':target.dataset.resize||target.dataset.zone;
    e.preventDefault();if(!editing && (menuOpen||B.busy()||(!B.ready()&&zone!=='page'))){notice('Connect to the computer first.');return;}
    if(!editing&&scroll&&zone!=='scroll'&&zone!=='page')return;
    const g={...geometry},rect=stage.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
    const point={zone,actionId:target.dataset.action,transform:target.getAttribute('transform'),resize:!!target.dataset.resize,x,y,g,start:structuredClone(view()),sb:{...scrollGeometry},element:target,moved:false};
    if(editing){if(pointers.size||controlDrag)return;}
    else if(zone==='shortcut')holdRim(point);
    else if(zone!=='bezel'&&zone!=='shortcut'&&zone!=='page'&&zone!=='scroll'){
      const a=assigned(zone);
      if(a)point.release=B.press(a);
    }
    if(!editing&&zone==='scroll'){point.scrolling=true;setScrollHeld(true);point.element=stage.querySelector('[data-zone=scroll]');}
    if(zone!=='bezel')point.element.classList.add('active');
    pointers.set(e.pointerId,point);try{stage.setPointerCapture(e.pointerId);}catch{}
  });
  stage.addEventListener('pointermove',e=>{
    const p=pointers.get(e.pointerId);if(!p)return;e.preventDefault();
    const rect=stage.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
    p.moved=p.moved||Math.hypot(x-p.x,y-p.y)>12;
    if(p.zone==='shortcut'){
      if(editing){
        const nearest=[...rimSlots].sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
        p.dropId=nearest?.id;p.element.setAttribute('transform',`translate(${x-p.x} ${y-p.y}) ${p.transform}`);
      }else if(p.moved){if(p.release)p.release();p.element.classList.remove('active');}
      return;
    }
    if(p.zone==='page')return;
    if(editing){const v=view(),dx=x-p.x,dy=y-p.y,g=p.g,s=p.start;
      if(p.resize){const [cx,cy,key,scale]=p.zone==='outer'?[g.cx,g.cy,'r',rect.width]:p.zone==='inner'?[g.mx,g.my,'mr',g.r]:p.zone==='scroll'?[p.sb.x,p.sb.y,'sr',g.r]:[g.rx,g.ry,'rr',g.mr];
        v[key]=(p.zone==='scroll'?p.sb.r/g.r:s[key])+(Math.hypot(x-cx,y-cy)-Math.hypot(p.x-cx,p.y-cy))/scale;
      }else if(p.zone==='outer'||p.zone==='bezel'){v.x=s.x+dx/rect.width;v.y=s.y+dy/rect.height;}
      else if(p.zone==='inner'){v.mx=s.mx+dx/g.r;v.my=s.my+dy/g.r;}
      else if(p.zone==='scroll'){v.sx=(p.sb.x+dx-g.cx)/g.clickR;v.sy=(p.sb.y+dy-g.cy)/g.clickR;}
      else{v.rx=s.rx+dx/g.mr;v.ry=s.ry+dy/g.mr;}
      Object.assign(v,M.view(v));render();return;
    }

  });
  function end(e){
    const p=pointers.get(e.pointerId);if(!p)return;pointers.delete(e.pointerId);
    if(p.release)p.release(e.type==='pointerup');
    if(p.scrolling&&!Array.from(pointers.values()).some(p=>p.scrolling))setScrollHeld(false);
    if(!p.scrolling||!scroll)p.element.classList.remove('active');
    if(p.zone==='shortcut'){
      if(editing){if(e.type==='pointerup'&&p.dropId)draft.order=M.reorder(draft.order,draft.order.indexOf(p.actionId),draft.order.indexOf(p.dropId));render();}
      else if(e.type==='pointerup'&&!p.moved&&!p.heldShortcut)fireRim(p.actionId);
    }else if(p.zone==='page'&&e.type==='pointerup'&&!p.moved)nextPage();
  }
  for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,end);
  stage.addEventListener('keydown',e=>{
    if(editing||menuOpen||e.repeat||![' ','Enter'].includes(e.key))return;
    const el=e.target,zone=el.dataset.action?'shortcut':el.dataset.page?'page':el.dataset.zone;
    if(!zone||pointers.has('keyboard'))return;e.preventDefault();
    if(scroll&&zone!=='scroll'&&zone!=='page')return;
    if(zone==='shortcut'||zone==='page'){const point={zone,actionId:el.dataset.action,element:el,moved:false};if(zone==='shortcut')holdRim(point);pointers.set('keyboard',point);return;}
    if(zone==='scroll'){if(B.ready()&&!B.busy()){setScrollHeld(true);pointers.set('keyboard',{zone,scrolling:true,element:stage.querySelector('[data-zone=scroll]')});}return;}
    if(scroll)return;
    const a=assigned(zone);
    if(B.ready()&&!B.busy()&&a)pointers.set('keyboard',{release:B.press(a),element:el});
  });
  stage.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter')end({pointerId:'keyboard',type:'pointerup'});});
  stage.addEventListener('click',e=>{
    if(e.detail!==0||editing||menuOpen)return;
    const el=e.target.closest('[data-action],[data-page]');if(!el)return;
    if(el.dataset.page)nextPage();else fireRim(el.dataset.action);
  });
  function detachMotion(){
    const v=view(),root=$('dialRoot');
    if(!v.motionFree){v.motionX=parseFloat($('dialMotion').style.left)/root.clientWidth;v.motionY=parseFloat($('dialMotion').style.top)/root.clientHeight;v.motionFree=1;}
  }
  function startControl(e,el){
    if(!editing||pointers.size||controlDrag)return;
    e.preventDefault();e.stopImmediatePropagation();detachMotion();
    const control=$('dialMotion');
    controlDrag={id:e.pointerId,x:e.clientX,y:e.clientY,left:parseFloat(control.style.left),top:parseFloat(control.style.top),before:structuredClone(view())};
    try{el.setPointerCapture(e.pointerId);}catch{}
  }
  function moveControl(e){
    const d=controlDrag;if(!d||d.id!==e.pointerId)return;e.preventDefault();
    const root=$('dialRoot'),v=view();
    v.motionX=(d.left+e.clientX-d.x)/root.clientWidth;
    v.motionY=(d.top+e.clientY-d.y)/root.clientHeight;
    Object.assign(v,M.view(v));render();
  }
  function endControl(e){
    if(!controlDrag||controlDrag.id!==e.pointerId)return;
    if(e.type!=='pointerup')Object.assign(view(),controlDrag.before);
    else{const el=$('dialMotion'),v=view(),root=$('dialRoot');
      v.motionX=parseFloat(el.style.left)/root.clientWidth;
      v.motionY=parseFloat(el.style.top)/root.clientHeight;
    }
    controlDrag=null;render();
  }
  for(const id of ['dialMotionGrip','dialMotion']){
    const el=$(id);el.addEventListener('pointerdown',e=>startControl(e,el),true);
    el.addEventListener('pointermove',moveControl);
    for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,endControl);
  }
  function beginEdit(){pause();editing=true;editOrientation=orientation();before=structuredClone(data);draft=structuredClone(data.presets[data.current]);draft.order=order();detachMotion();notice('Drag circles, Scroll, rim keys, or the Motion grip. Light circle handles resize.');render();}
  function finishEdit(save){releaseAll();if(save){data.presets[data.current]=draft;persist();}else data=before;
    editing=false;draft=null;settingsOpen=false;$('dialEditor').hidden=true;notice(save?'Layout saved on this phone.':'Layout changes canceled.');render();}
  function customize(){settingsOpen=true;releaseAll();$('dialEditor').hidden=false;$('dialName').value=current().name;
    for(const [key] of sliders)$('dialRange_'+key).value=view()[key];
    const all=actions(),options=all.map(a=>`<option value="${escape(a.id)}">${escape(a.name)}</option>`).join('');
    for(const id of ['dialOuterAction','dialInnerAction','dialRightAction','dialAddAction'])$(id).innerHTML=options;
    $('dialOuterAction').value=assigned('outer').id;$('dialInnerAction').value=assigned('inner').id;$('dialRightAction').value=assigned('right').id;renderOrder();
  }
  function renderOrder(){const ids=order();draft.order=ids;
    $('dialOrder').innerHTML=ids.map((id,i)=>`<li class="dial-order-row" data-index="${i}"><span>${escape(action(id)?.name||id)}</span><button type="button" data-move="-1" aria-label="Move ${escape(action(id)?.name)} earlier" ${i===0?'disabled':''}>↑</button><button type="button" data-move="1" aria-label="Move ${escape(action(id)?.name)} later" ${i===ids.length-1?'disabled':''}>↓</button><button type="button" data-remove="1" aria-label="Remove ${escape(action(id)?.name)} from dial" ${ids.length===1?'disabled':''}>×</button></li>`).join('');
  }
  $('dialOrder').addEventListener('click',e=>{const row=e.target.closest('[data-index]');if(!row)return;const i=Number(row.dataset.index);
    if(e.target.dataset.move)draft.order=M.reorder(draft.order,i,i+Number(e.target.dataset.move));
    else if(e.target.dataset.remove && draft.order.length>1){draft.hidden=[...(draft.hidden||[]),draft.order[i]];draft.order.splice(i,1);}renderOrder();render();
  });
  // Touch-friendly row reordering; arrows provide an accessible alternative.
  let rowDrag=null;
  $('dialOrder').addEventListener('pointerdown',e=>{if(e.target.tagName!=='SPAN')return;e.preventDefault();try{e.target.setPointerCapture(e.pointerId);}catch{}rowDrag={id:e.pointerId,index:Number(e.target.parentElement.dataset.index),y:e.clientY};});
  $('dialOrder').addEventListener('pointerup',e=>{if(!rowDrag||rowDrag.id!==e.pointerId)return;const rows=[...$('dialOrder').children];const to=rows.findIndex(el=>{const r=el.getBoundingClientRect();return e.clientY>=r.top&&e.clientY<=r.bottom;});if(to>=0&&Math.abs(e.clientY-rowDrag.y)>12){draft.order=M.reorder(draft.order,rowDrag.index,to);renderOrder();render();}rowDrag=null;});
  $('dialOrder').addEventListener('pointercancel',()=>{rowDrag=null;});
  $('dialName').addEventListener('input',e=>{draft.name=e.target.value.trim().slice(0,24)||'My grip';render();});
  for(const [id,key] of [['dialOuterAction','outer'],['dialInnerAction','inner'],['dialRightAction','right']])$(id).addEventListener('change',e=>{draft[key]=e.target.value;render();});
  $('dialAdd').onclick=()=>{const id=$('dialAddAction').value;draft.hidden=(draft.hidden||[]).filter(s=>s!==id);if(!draft.order.includes(id))draft.order.push(id);renderOrder();render();};
  $('dialReset').onclick=()=>{draft.views[editOrientation]=M.defaults(editOrientation);render();detachMotion();customize();render();};
  $('dialEditorBack').onclick=()=>{settingsOpen=false;$('dialEditor').hidden=true;render();};
  $('dialCustomize').onclick=customize;$('dialEdit').onclick=()=>{closeMenu();beginEdit();};
  $('dialSave').onclick=()=>finishEdit(true);$('dialCancel').onclick=()=>finishEdit(false);
  $('dialMotion').onclick=()=>{if(!editing)setMotion(!B.motionEnabled());};
  $('dialMore').onclick=()=>{closeMenu();pause();B.more();};
  $('dialSettings').onclick=()=>{closeMenu();pause();B.settings();};
  function closeMenu(focus=false){menuOpen=false;$('dialMenu').hidden=true;$('dialMenuToggle').setAttribute('aria-expanded','false');if(focus)$('dialMenuToggle').focus();}
  $('dialMenuToggle').onclick=()=>{
    if(menuOpen){closeMenu();return;}
    pause();menuOpen=true;$('dialMenu').hidden=false;$('dialMenuToggle').setAttribute('aria-expanded','true');
    const feedback=B.feedback();$('dialRingHaptics').checked=feedback.haptics;$('dialRingSound').checked=feedback.sound;
    $('dialFeedbackHint').textContent=feedback.support;
  };
  document.addEventListener('pointerdown',e=>{
    swallowMenuClick=false;
    if(!menuOpen||$('dialMenu').contains(e.target)||$('dialMenuToggle').contains(e.target))return;
    swallowMenuClick=true;e.preventDefault();e.stopImmediatePropagation();closeMenu();
  },true);
  document.addEventListener('click',e=>{if(swallowMenuClick){swallowMenuClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('keydown',e=>{if(menuOpen&&e.key==='Escape'){e.preventDefault();closeMenu(true);}});
  for(const [id,key] of [['dialRingHaptics','haptics'],['dialRingSound','sound']])$(id).onchange=e=>B.setFeedback(key,e.target.checked);
  function showPresets(){pause();settingsOpen=true;$('dialPresets').hidden=false;
    $('dialPresetList').innerHTML=data.presets.map((p,i)=>`<div><button data-use="${i}">${escape(p.name)}${i===data.current?' ✓':''}</button><button data-delete="${i}" ${data.presets.length===1?'disabled':''} aria-label="Delete ${escape(p.name)} preset">Delete</button></div>`).join('');
    $('dialPresetCopy').disabled=data.presets.length>=8;
  }
  $('dialPreset').onclick=()=>{closeMenu();showPresets();};
  $('dialPresetList').onclick=e=>{if(e.target.dataset.use!==undefined){data.current=Number(e.target.dataset.use);persist();settingsOpen=false;$('dialPresets').hidden=true;render();}
    else if(e.target.dataset.delete!==undefined&&data.presets.length>1){data.presets.splice(Number(e.target.dataset.delete),1);data.current=0;persist();showPresets();}};
  $('dialPresetCopy').onclick=()=>{if(data.presets.length>=8)return;const copy=structuredClone(current());copy.name=(copy.name+' copy').slice(0,24);data.presets.push(copy);data.current=data.presets.length-1;persist();showPresets();};
  $('dialPresetClose').onclick=()=>{settingsOpen=false;$('dialPresets').hidden=true;render();};
  function resize(){if(editing&&orientation()!==editOrientation)finishEdit(false);if(!resizeFrame)resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;releaseAll();render();});}
  window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
  window.addEventListener('pagehide',()=>{closeMenu();pause();});window.addEventListener('blur',pause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){closeMenu();pause();if(editing)finishEdit(false);}});
  window.Dial={pause,refresh:()=>{if(!pointers.size)render();},
    macroPin(id,pinned){const key='macro:'+id;for(const preset of data.presets){preset.hidden=(preset.hidden||[]).filter(s=>s!==key);if(!pinned){preset.order=preset.order.filter(s=>s!==key);preset.hidden.push(key);}}persist();render();},
    connected:()=>{renderState();if(firstConnection){firstConnection=false;setMotion(true);}},disconnected:pause};
  render();
})();
