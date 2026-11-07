const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const M=require('../www/dial-model.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../www/dial.js'),'utf8');

function harness(){
  let now=1000,serial=0,busy=false,online=true,scrolling=false;
  const callbacks=new Map(),frames=[],nodes=new Map(),handlers={};
  function node(id){
    if(!nodes.has(id)){
      const classes=new Set();nodes.set(id,{hidden:true,clientWidth:390,clientHeight:844,dataset:{},textContent:'',
        classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v),contains:v=>classes.has(v)},
        setAttribute(){},getAttribute(){return '';},querySelectorAll:()=>[],querySelector:()=>node('scrollTarget'),
        addEventListener:(name,fn)=>handlers[name]=fn,getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){},closest(){return this;}});
    }
    return nodes.get(id);
  }
  node('scrollTarget').dataset.zone='scroll';
  const context=vm.createContext({M,scroll:false,scrollFilter:{speed:0},scrollInput:null,scrollFrame:0,scrollLastFrame:0,scrollTurn:0,
    editing:false,menuOpen:false,settingsOpen:false,pointers:new Map(),controlDrag:null,geometry:{cx:100,cy:100},scrollGeometry:{x:160,y:600},
    performance:{now:()=>now},requestAnimationFrame:fn=>{callbacks.set(++serial,fn);return serial;},cancelAnimationFrame:id=>callbacks.delete(id),
    B:{scrollSensitivity:()=>6,ready:()=>online,busy:()=>busy,stop(){},haptic(){},scrolling:on=>scrolling=on,wheel:v=>frames.push(v)},
    render(){},view:()=>({}),$:node,matchMedia:()=>({matches:false}),getComputedStyle:()=>({getPropertyValue:()=>0}),
    structuredClone,holdRim(){throw Error('Background shortcut fired');},assigned(){throw Error('Background pad fired');},notice(){},nextPage(){},fireRim(){throw Error('Background action fired');}});
  vm.runInContext(source.slice(source.indexOf('  function hideScrollPopup()'),source.indexOf('  const textMeasure=')),context);
  vm.runInContext(source.slice(source.indexOf("  const stage=$('dialStage');"),source.indexOf('  function detachMotion()')),context);
  return {frames,callbacks,node,handlers,run:code=>vm.runInContext(code,context),busy(){busy=true;},offline(){online=false;},
    scrolling:()=>scrolling,
    step(ms=33){now+=ms;const pending=[...callbacks.values()];callbacks.clear();pending.forEach(fn=>fn(now));},
    start(){vm.runInContext('setScrollHeld(true)',context);},stop(){vm.runInContext('setScrollHeld(false)',context);},
    move(y){vm.runInContext(`moveScrollFinger(${y})`,context);},
    pointer(type,y=600,id=1,target=node('scrollTarget')){handlers[type]({type,target,pointerId:id,clientX:160,clientY:y,preventDefault(){}});},
    key(type,key,shiftKey=false){handlers[type]({key,shiftKey,target:node('scrollTarget'),preventDefault(){}});}};
}

test('finger offset sustains capped scrolling, center stops, and downward drag reverses',()=>{
  const h=harness();h.start();for(let i=0;i<8;i++)h.step();assert.equal(h.frames.length,0);
  assert.equal(h.node('dialScrollOverlay').hidden,false);assert.ok(h.node('dialRoot').classList.contains('scroll-focus'));
  h.move(500);for(let i=0;i<60;i++)h.step();
  assert.ok(h.frames.length>50);assert.ok(h.frames.slice(-10).every(v=>Math.abs(v-24*.033)<1e-8));
  const count=h.frames.length;h.move(600);for(let i=0;i<10;i++)h.step();assert.equal(h.frames.length,count);
  h.move(700);h.step();assert.ok(h.frames.at(-1)<0);
});

test('release closes the popup, restores pointer input, and fresh holds start stationary',()=>{
  const h=harness();h.start();h.move(500);for(let i=0;i<12;i++)h.step();const pending=[...h.callbacks.values()];
  h.stop();const count=h.frames.length;pending.forEach(fn=>fn(2000));
  assert.equal(h.frames.length,count);assert.equal(h.callbacks.size,0);assert.equal(h.scrolling(),false);
  assert.equal(h.node('dialScrollOverlay').hidden,true);assert.equal(h.node('dialRoot').classList.contains('scroll-focus'),false);
  h.start();for(let i=0;i<20;i++)h.step();assert.equal(h.frames.length,count);
});

test('suspended animation cannot replay an old scroll command',()=>{
  const h=harness();h.start();h.move(500);for(let i=0;i<12;i++)h.step();const count=h.frames.length;
  h.step(600);for(let i=0;i<10;i++)h.step();assert.equal(h.frames.length,count);
  h.move(550);h.step();assert.ok(h.frames.length>count);
});

test('menus, editor, and connection loss cancel the pop-up and scrolling',()=>{
  for(const interrupt of [h=>h.busy(),h=>h.offline(),h=>h.run('menuOpen=true'),h=>h.run('editing=true'),h=>h.run('settingsOpen=true')]){
    const h=harness();h.start();h.move(500);for(let i=0;i<15;i++)h.step();const count=h.frames.length;
    interrupt(h);h.step();assert.equal(h.frames.length,count);assert.equal(h.scrolling(),false);assert.equal(h.callbacks.size,0);
    assert.equal(h.node('dialScrollOverlay').hidden,true);
  }
});

test('pointer drag uses the actual touch origin and cancellation ends the gesture',()=>{
  for(const end of ['pointerup','pointercancel','lostpointercapture']){
    const h=harness();h.pointer('pointerdown',610);for(let i=0;i<5;i++)h.step();assert.equal(h.frames.length,0);
    h.pointer('pointermove',570);for(let i=0;i<8;i++)h.step();assert.ok(h.frames.at(-1)>0);
    h.pointer('pointermove',610);const center=h.frames.length;h.step();assert.equal(h.frames.length,center);
    h.pointer(end,610);h.step();assert.equal(h.scrolling(),false);assert.equal(h.node('dialScrollOverlay').hidden,true);
  }
});

test('extra touches and background actions are blocked while Scroll owns the input',()=>{
  const h=harness();h.pointer('pointerdown');const pad=h.node('pad');pad.dataset.zone='outer';
  h.pointer('pointerdown',400,2,pad);h.pointer('pointerdown',600,3);h.handlers.click({detail:0,target:pad});
  assert.equal(h.run('pointers.size'),1);h.pointer('pointerup');assert.equal(h.scrolling(),false);
});

test('keyboard arrows choose direction only while held, with Escape and key release closing',()=>{
  const h=harness();h.key('keydown',' ');for(let i=0;i<5;i++)h.step();assert.equal(h.frames.length,0);
  h.key('keydown','ArrowUp');for(let i=0;i<10;i++)h.step();assert.ok(h.frames.at(-1)>0);
  h.key('keyup','ArrowUp');const count=h.frames.length;h.step();assert.equal(h.frames.length,count);
  h.key('keydown','ArrowDown',true);h.step();assert.ok(h.frames.at(-1)<0);
  h.key('keyup',' ');assert.equal(h.scrolling(),false);assert.equal(h.node('dialScrollOverlay').hidden,true);
  h.key('keydown','Enter');h.key('keydown','Escape');assert.equal(h.scrolling(),false);
});
