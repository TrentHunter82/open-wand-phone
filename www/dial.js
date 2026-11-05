(function () {
  'use strict';
  const M=window.DialModel, B=window.wandBridge, $=id=>document.getElementById(id);
  const STORAGE='wand.dial.v1';
  let data;try{data=M.normalize(JSON.parse(localStorage.getItem(STORAGE)));}catch{data=M.normalize();}
  let editing=false,draft=null,before=null,scroll=false,firstConnection=true,settingsOpen=false;
  const pointers=new Map();
  let geometry=null,resizeFrame=0;
  const current=()=>editing?draft:data.presets[data.current];
  const orientation=()=>innerWidth>innerHeight?'landscape':'portrait';
  let editOrientation=orientation();
  const view=()=>current().views[editing?editOrientation:orientation()];
  function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(data));return true;}
    catch{notice('Safari could not save this layout. It works for this session.');return false;}}
  function notice(text){$('dialNotice').textContent=text;}
  function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  const micIcon=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" pointer-events="none"><rect x="-5" y="-15" width="10" height="20" rx="5" fill="currentColor" stroke="none"/><path d="M-10 -3v3a10 10 0 0 0 20 0v-3M0 10v8M-6 18H6"/></g>`;
  function actions(){return B.actions();}
  function action(id){return actions().find(a=>a.id===id);}
  function order(){const p=current(),all=actions(),ids=new Set(all.map(a=>a.id));
    const result=[...p.order.filter(id=>ids.has(id)),...all.filter(a=>a.pinned && !p.order.includes(a.id) && !p.hidden?.includes(a.id)).map(a=>a.id)];
    return result.length?result:['left'];}
  const initialHTML=`<div id="dialRoot">
    <svg id="dialStage" xmlns="http://www.w3.org/2000/svg" aria-label="Air mouse dial"></svg>
    <header class="dial-header"><div><div class="dial-brand">OPEN WAND</div><div class="dial-connection"><span id="dialConnectionDot" class="dial-dot"></span><span id="dialConnection">Offline</span></div></div><div class="dial-tools"><button id="dialMore">•••<br>More</button><button id="dialEdit">✎<br>Edit</button></div></header>
    <button id="dialPreset" aria-label="Choose saved grip">My grip ▾</button>
    <div id="dialMode" class="dial-mode" role="group" aria-label="Dial mode"><button id="dialClickMode" aria-pressed="true">Click</button><button id="dialScrollMode" aria-pressed="false">Scroll</button></div>
    <button id="dialMotion" aria-pressed="false"><span class="dial-dot"></span><span id="dialMotionText">Motion paused</span><span aria-hidden="true">Ⅱ</span></button>
    <div id="dialEditbar" class="dial-editbar" hidden><button id="dialCancel">Cancel</button><button id="dialCustomize">Sizes & actions</button><button id="dialSave">Save layout</button></div>
    <div id="dialNotice" role="status" aria-live="polite"></div>
    <footer class="dial-footer"><button id="dialShortcuts">••• &nbsp; Shortcuts · Macros</button><button id="dialSettings">Settings</button></footer>
  </div>`;
  $('app').insertAdjacentHTML('beforeend',initialHTML);
  document.body.classList.add('dial-view');
  // These settings belong to the previous pad layout. Keep their stored values
  // for the calibration pad, without presenting inactive dial controls.
  for(const id of ['cTapClick','cDragLock','cStrip','cTwoFinger','cMirror','cShowHot'])$(id).closest('label').hidden=true;
  const clutchRow=$('sClutch').closest('.row');clutchRow.hidden=true;
  const feedbackHint=$('hapticReal').closest('.realRow')?.nextElementSibling;
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
    <div id="dialSliders"></div><label for="dialInnerAction">Mic circle assignment</label><select id="dialInnerAction"></select><label for="dialRightAction">Small circle assignment</label><select id="dialRightAction"></select>
    <h3>Rotary actions</h3><p class="dial-hint">Use the arrows or drag a row to reorder. The bezel selects an action; the large ring presses it.</p><ol id="dialOrder"></ol>
    <label for="dialAddAction">Add a shortcut or macro</label><select id="dialAddAction"></select><button id="dialAdd">Add action</button><button id="dialReset">Reset this orientation</button>
    <p class="dial-hint">Create custom macros in More. Save this grip, then use the grip menu to save a copy (up to eight presets).</p>
  </section><section id="dialPresets" hidden aria-label="Saved grips"><h2>Saved grips</h2><div id="dialPresetList"></div><button id="dialPresetCopy">Save a copy of current grip</button><button id="dialPresetClose">Back</button></section>`);
  const sliders=[['r','Outer wheel size',.5,1.3],['bw','Function selector thickness',.1,.25],['mr','Mic circle size',.25,.65],['rr','Right Click size',.25,.55],
    ['x','Wheel horizontal position',.25,1.25],['y','Wheel vertical position',.28,.75],
    ['mx','Mic horizontal offset',-.6,.6],['my','Mic vertical offset',-.6,.6],
    ['rx','Right Click horizontal offset',-.6,.6],['ry','Right Click vertical offset',-.6,.6],
    ['scrollX','Mode switch horizontal position',0,.7],['scrollY','Mode switch vertical position',.12,.85],
    ['motionX','Motion switch horizontal position',0,.7],['motionY','Motion switch vertical position',.12,.9]];
  $('dialSliders').innerHTML=sliders.map(([key,label,min,max])=>`<label for="dialRange_${key}">${label}</label><input id="dialRange_${key}" type="range" min="${min}" max="${max}" step="0.01">`).join('');
  for(const [key] of sliders) $('dialRange_'+key).addEventListener('input',e=>{
    const v=view();v[key]=Number(e.target.value);Object.assign(v,M.view(v));render();
  });
  function setMotion(on){
    if(on && (!B.ready() || editing || settingsOpen || B.busy())) {notice('Connect and close menus before enabling motion.');return;}
    if(!on) {releaseAll();B.stop();}
    B.motion(!!on);renderState();
  }
  function pause(){releaseAll();B.stop();B.motion(false);renderState();}
  function renderState(){
    const live=B.motionEnabled();
    $('dialMotion').setAttribute('aria-pressed',String(live));
    $('dialMotionText').textContent=live?'Motion ON':'Motion paused';
    $('dialConnection').textContent=B.connection();
    $('dialConnectionDot').classList.toggle('connected',B.ready());
  }
  function releaseAll(){for(const p of pointers.values()) {if(p.release)p.release();}pointers.clear();B.scrolling(false);
    $('dialStage').querySelectorAll('.active').forEach(el=>el.classList.remove('active'));}
  function label(x,y,lines,size){return `<text class="dial-label" x="${x}" y="${y}" font-size="${size}" font-weight="650">${lines.map((line,i)=>`<tspan x="${x}" dy="${i?size*1.25:0}" ${i?'class="dial-secondary" font-size="'+size*.56+'"':''}>${escape(line)}</tspan>`).join('')}</text>`;}
  function render(){
    const focusZone=$('dialStage').contains(document.activeElement)?document.activeElement.dataset.zone:null;
    const root=$('dialRoot'),w=root.clientWidth,h=root.clientHeight,v=view(),p=current();
    geometry=M.geometry(v,w,h);const g=geometry;
    const ids=order();if(!ids.includes(p.selected))p.selected=ids[0]||'left';
    const selected=action(p.selected)||action('left'),inner=action(p.inner)||action('mic'),right=action(p.right)||action('right');
    const font=Math.max(14,Math.min(25,w*.055)),selectedIndex=Math.max(0,ids.indexOf(p.selected));
    const ringR=g.clickR;
    let svg=`<defs><radialGradient id="dialBg" cx="27%" cy="12%" r="100%"><stop stop-color="#4b4c51"/><stop offset=".35" stop-color="#37383e"/><stop offset=".82" stop-color="#303137"/><stop offset="1" stop-color="#202125"/></radialGradient><linearGradient id="dialInner" x2=".8" y2="1"><stop stop-color="#4b4c51"/><stop offset=".25" stop-color="#37383d"/><stop offset="1" stop-color="#232428"/></linearGradient><filter id="dialShadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="5" dy="8" stdDeviation="7" flood-color="#111216" flood-opacity=".8"/></filter></defs>`;
    svg+=`<g class="dial-bezel" data-zone="bezel" role="slider" tabindex="0" aria-label="Rotary action selector" aria-valuemin="1" aria-valuemax="${ids.length}" aria-valuenow="${selectedIndex+1}" aria-valuetext="${escape(selected.name)}"><circle cx="${g.cx}" cy="${g.cy}" r="${g.r}" fill="#24252a" stroke="#414248" stroke-width="1.5"/>`;
    for(let i=-4;i<=4;i++){
      const angle=(g.cx>w/2?Math.PI:0)+i*.39,idx=(selectedIndex+i+ids.length*10)%ids.length,a=action(ids[idx]);
      if(!a || Math.abs(i)>Math.floor((ids.length-1)/2))continue;
      const labelR=(g.r+ringR)/2;
      const x=g.cx+Math.cos(angle)*labelR,y=g.cy+Math.sin(angle)*labelR;
      const rotation=angle*180/Math.PI-270;
      const bezelName=a.name.length>12?a.name.slice(0,11)+'…':a.name;
      svg+=`<text class="dial-label" x="${x}" y="${y}" font-size="${Math.max(9,Math.min(w*.037,g.r*.06))}" transform="rotate(${rotation} ${x} ${y})" ${i===0?'fill="#f3977e"':''}>${escape(bezelName)}</text>`;
    }
    svg+='</g>';
    svg+=`<g data-zone="outer" class="dial-press" role="button" tabindex="0" aria-label="${escape(scroll?'Rotate to scroll':selected.name)}"><circle class="dial-surface" cx="${g.cx}" cy="${g.cy}" r="${ringR}" fill="url(#dialBg)" stroke="#48494e" stroke-width="1" filter="url(#dialShadow)"/>`;
    const leftEdge=Math.max(8,g.cx-ringR),rightEdge=Math.min(w-8,g.cx+ringR);
    const leftGap=Math.max(0,g.mx-g.mr-leftEdge),rightGap=Math.max(0,rightEdge-g.mx-g.mr);
    const labelX=leftGap>=rightGap?(leftEdge+g.mx-g.mr)/2:(rightEdge+g.mx+g.mr)/2;
    const outerFont=Math.min(font,Math.max(13,Math.max(leftGap,rightGap)*.18));
    if(!scroll && selected.id==='left') svg+=`<text class="dial-label" x="${labelX}" y="${g.cy-22}" font-size="${outerFont}" font-weight="750"><tspan x="${labelX}">LEFT CLICK</tspan><tspan x="${labelX}" dy="25" class="dial-secondary" font-size="11">tap · hold to drag</tspan></text></g>`;
    else svg+=label(labelX,g.cy-12,[scroll?'SCROLL':(selected.name.length>13?selected.name.slice(0,12)+'…':selected.name).toUpperCase(),scroll?'rotate the ring':selected.hint],outerFont)+'</g>';
    svg+=`<g data-zone="inner" class="dial-press" role="button" tabindex="0" aria-label="${escape(inner.name)}"><circle class="dial-surface" cx="${g.mx}" cy="${g.my}" r="${g.mr}" fill="url(#dialInner)" stroke="#55565b" stroke-width="1" filter="url(#dialShadow)"/><g style="color:#eee6db">${p.inner==='mic'?micIcon(g.mx,g.my-g.mr*.58,.85):''}</g>`;
    svg+=label(g.mx,g.my-g.mr*.20,[inner.name.toUpperCase(),inner.hint],Math.min(font,g.mr*.19))+'</g>';
    svg+=`<g data-zone="right" class="dial-press" role="button" tabindex="0" aria-label="${escape(right.name)}"><circle class="dial-surface" cx="${g.rx}" cy="${g.ry}" r="${g.rr}" fill="url(#dialInner)" stroke="#55565b" stroke-width="1" filter="url(#dialShadow)"/>${label(g.rx,g.ry-2,[right.name],Math.min(13,g.rr*.28))}</g>`;
    const ix=g.cx+(g.cx>w/2?-g.r+3:g.r-3);svg+=`<circle cx="${ix}" cy="${g.cy}" r="4" fill="#f3977e" pointer-events="none"/>`;
    if(editing)for(const [zone,x,y,r] of [['outer',g.cx,g.cy,g.r],['inner',g.mx,g.my,g.mr],['right',g.rx,g.ry,g.rr]]){
      svg+=`<circle class="dial-edit-outline" cx="${x}" cy="${y}" r="${r}"/><circle data-resize="${zone}" class="dial-handle" cx="${x-r*.82}" cy="${y-r*.57}" r="13"/>`;
    }
    $('dialStage').setAttribute('viewBox',`0 0 ${w} ${h}`);$('dialStage').innerHTML=svg;
    if(focusZone)$('dialStage').querySelector('[data-zone="'+focusZone+'"]')?.focus({preventScroll:true});
    for(const [id,x,y] of [['dialMode',v.scrollX,v.scrollY],['dialMotion',v.motionX,v.motionY]]){
      const el=$(id);el.style.left=Math.min(w-el.offsetWidth-10,Math.max(10,w*x))+'px';el.style.top=Math.min(h-el.offsetHeight-50,Math.max(122,h*y))+'px';
    }
    $('dialClickMode').setAttribute('aria-pressed',String(!scroll));$('dialScrollMode').setAttribute('aria-pressed',String(scroll));
    $('dialPreset').textContent=p.name+' ▾';$('dialPreset').hidden=editing;
    $('dialEditbar').hidden=!editing;renderState();
  }
  function select(step){const ids=order(),p=current();p.selected=ids[((Math.max(0,ids.indexOf(p.selected))+step)%ids.length+ids.length)%ids.length];if(!editing)persist();notice('Selected: '+(action(p.selected)?.name||'Left click'));render();}
  const stage=$('dialStage');
  stage.addEventListener('pointerdown',e=>{
    const target=e.target.closest('[data-zone],[data-resize]');if(!target || pointers.has(e.pointerId))return;
    e.preventDefault();if(!editing && (B.busy() || !B.ready())){notice('Connect to the computer first.');return;}
    const g={...geometry},rect=stage.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
    const zone=target.dataset.resize||target.dataset.zone;
    const point={zone,resize:!!target.dataset.resize,x,y,g,start:structuredClone(view()),angle:Math.atan2(y-g.cy,x-g.cx),acc:0,element:target};
    if(editing){if(pointers.size)return;}
    else if(zone!=='bezel' && !(zone==='outer' && scroll)){
      const p=current(),a=action(zone==='outer'?p.selected:zone==='inner'?p.inner:p.right);
      if(a)point.release=B.press(a);
      target.classList.add('active');
    }
    if(!editing&&zone==='outer'&&scroll){point.scrolling=true;B.scrolling(true);}
    pointers.set(e.pointerId,point);try{stage.setPointerCapture(e.pointerId);}catch{}
  });
  stage.addEventListener('pointermove',e=>{
    const p=pointers.get(e.pointerId);if(!p)return;e.preventDefault();
    const rect=stage.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
    if(editing){const v=view(),dx=x-p.x,dy=y-p.y,g=p.g,s=p.start;
      if(p.resize){const [cx,cy,old,key,scale]=p.zone==='outer'?[g.cx,g.cy,g.r,'r',rect.width]:p.zone==='inner'?[g.mx,g.my,g.mr,'mr',g.r]:[g.rx,g.ry,g.rr,'rr',g.mr];
        v[key]=s[key]+(Math.hypot(x-cx,y-cy)-Math.hypot(p.x-cx,p.y-cy))/scale;
      }else if(p.zone==='outer'||p.zone==='bezel'){v.x=s.x+dx/rect.width;v.y=s.y+dy/rect.height;}
      else if(p.zone==='inner'){v.mx=s.mx+dx/g.r;v.my=s.my+dy/g.r;}
      else{v.rx=s.rx+dx/g.mr;v.ry=s.ry+dy/g.mr;}
      Object.assign(v,M.view(v));render();return;
    }
    if(p.zone==='bezel'||p.zone==='outer'&&scroll){
      const angle=Math.atan2(y-p.g.cy,x-p.g.cx),delta=M.delta(p.angle,angle);p.angle=angle;p.acc+=delta;
      if(p.zone==='bezel'){
        const steps=Math.trunc(p.acc/.28);if(steps){p.acc-=steps*.28;select(-steps);B.haptic();}
      }else{if(Math.abs(delta)<1){B.wheel(delta*p.g.r/B.scrollPixels());if(Math.abs(p.acc)>.15){B.haptic();p.acc=0;}}}
    }
  });
  function end(e){const p=pointers.get(e.pointerId);if(!p)return;pointers.delete(e.pointerId);if(p.release)p.release(e.type==='pointerup');if(p.scrolling&&!Array.from(pointers.values()).some(p=>p.scrolling))B.scrolling(false);p.element.classList.remove('active');}
  for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,end);
  stage.addEventListener('keydown',e=>{
    const zone=e.target.dataset.zone;if(!zone||editing)return;
    if(zone==='bezel'&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();select(e.key==='ArrowRight'?1:-1);return;}
    if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();if(zone==='outer'&&scroll)return;
      const p=current(),a=action(zone==='outer'?p.selected:zone==='inner'?p.inner:p.right);
      if(B.ready()&&!B.busy()&&a&&!pointers.has('keyboard'))pointers.set('keyboard',{release:B.press(a),element:e.target});}
  });
  stage.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter')end({pointerId:'keyboard',type:'pointerup'});});
  function beginEdit(){pause();editing=true;editOrientation=orientation();before=structuredClone(data);draft=structuredClone(data.presets[data.current]);notice('Drag circles to move them. Drag the light handles to resize.');render();}
  function finishEdit(save){releaseAll();if(save){data.presets[data.current]=draft;persist();}else data=before;
    editing=false;draft=null;settingsOpen=false;$('dialEditor').hidden=true;notice(save?'Layout saved on this phone.':'Layout changes canceled.');render();}
  function customize(){settingsOpen=true;releaseAll();$('dialEditor').hidden=false;$('dialName').value=current().name;
    for(const [key] of sliders)$('dialRange_'+key).value=view()[key];
    const all=actions(),options=all.map(a=>`<option value="${escape(a.id)}">${escape(a.name)}</option>`).join('');
    for(const id of ['dialInnerAction','dialRightAction','dialAddAction'])$(id).innerHTML=options;
    $('dialInnerAction').value=current().inner;$('dialRightAction').value=current().right;renderOrder();
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
  for(const [id,key] of [['dialInnerAction','inner'],['dialRightAction','right']])$(id).addEventListener('change',e=>{draft[key]=e.target.value;render();});
  $('dialAdd').onclick=()=>{const id=$('dialAddAction').value;draft.hidden=(draft.hidden||[]).filter(s=>s!==id);if(!draft.order.includes(id))draft.order.push(id);renderOrder();render();};
  $('dialReset').onclick=()=>{draft.views[editOrientation]=M.defaults(editOrientation);customize();render();};
  $('dialEditorBack').onclick=()=>{settingsOpen=false;$('dialEditor').hidden=true;render();};
  $('dialCustomize').onclick=customize;$('dialEdit').onclick=beginEdit;
  $('dialSave').onclick=()=>finishEdit(true);$('dialCancel').onclick=()=>finishEdit(false);
  $('dialMotion').onclick=()=>{if(!editing)setMotion(!B.motionEnabled());};
  function mode(value){releaseAll();scroll=value;render();notice(scroll?'Rotate the outer ring to scroll.':'The outer ring presses the selected action.');}
  $('dialClickMode').onclick=()=>mode(false);$('dialScrollMode').onclick=()=>mode(true);
  for(const id of ['dialMore','dialShortcuts'])$(id).onclick=()=>{pause();B.more();};
  $('dialSettings').onclick=()=>{pause();B.settings();};
  function showPresets(){pause();settingsOpen=true;$('dialPresets').hidden=false;
    $('dialPresetList').innerHTML=data.presets.map((p,i)=>`<div><button data-use="${i}">${escape(p.name)}${i===data.current?' ✓':''}</button><button data-delete="${i}" ${data.presets.length===1?'disabled':''} aria-label="Delete ${escape(p.name)} preset">Delete</button></div>`).join('');
    $('dialPresetCopy').disabled=data.presets.length>=8;
  }
  $('dialPreset').onclick=showPresets;
  $('dialPresetList').onclick=e=>{if(e.target.dataset.use!==undefined){data.current=Number(e.target.dataset.use);persist();settingsOpen=false;$('dialPresets').hidden=true;render();}
    else if(e.target.dataset.delete!==undefined&&data.presets.length>1){data.presets.splice(Number(e.target.dataset.delete),1);data.current=0;persist();showPresets();}};
  $('dialPresetCopy').onclick=()=>{if(data.presets.length>=8)return;const copy=structuredClone(current());copy.name=(copy.name+' copy').slice(0,24);data.presets.push(copy);data.current=data.presets.length-1;persist();showPresets();};
  $('dialPresetClose').onclick=()=>{settingsOpen=false;$('dialPresets').hidden=true;render();};
  function resize(){if(editing&&orientation()!==editOrientation)finishEdit(false);if(!resizeFrame)resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;releaseAll();render();});}
  window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
  window.addEventListener('pagehide',pause);window.addEventListener('blur',pause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();if(editing)finishEdit(false);}});
  window.Dial={pause,refresh:()=>{if(!pointers.size)render();},
    macroPin(id,pinned){const key='macro:'+id;for(const preset of data.presets){preset.hidden=(preset.hidden||[]).filter(s=>s!==key);if(!pinned){preset.order=preset.order.filter(s=>s!==key);preset.hidden.push(key);}}persist();render();},
    connected:()=>{renderState();if(firstConnection){firstConnection=false;setMotion(true);}},disconnected:pause};
  render();
})();
