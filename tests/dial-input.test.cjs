const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const script=require('node:fs').readFileSync(require('node:path').join(__dirname,'../www/index.html'),'utf8');
function harness(){
  const frames=[],runs=[],timers=[],pending=new Map();let now=0;
  const c=vm.createContext({window:{},ws:{readyState:1,send:m=>frames.push(JSON.parse(m))},send:m=>frames.push(m),
    freeMotion:false,dialScrolling:false,CAL:{on:false},LAYOUT:{editing:false},document:{hidden:false},
    $:()=>({hidden:true}),drawer:{classList:{contains:()=>false}},S:{scrollPx:30,scrollInvert:false},
    pressFeedback(){},haptic(){},dialDetent(){},setMicUI(){},performance:{now:()=>1000},fYaw:{reset(){}},fPitch:{reset(){}},sentLog:[],engageT:0,
    setTimeout:(fn,delay)=>{const timer=()=>{if(pending.delete(timer))fn();};timers.push(timer);pending.set(timer,now+delay);return timer;},clearTimeout:timer=>pending.delete(timer),
    runAction:(name,steps)=>runs.push({name,steps}),openActions(){},openDrawer(){},cancelAction(){}});
  vm.runInContext(script.slice(script.indexOf('const dialHeld ='),script.indexOf('</script>',script.indexOf('const dialHeld ='))),c);
  return {c,frames,runs,timers,run:s=>vm.runInContext(s,c),advance(ms){const end=now+ms;while(pending.size){const [timer,at]=[...pending].sort((a,b)=>a[1]-b[1])[0];if(at>end)break;now=at;timer();}now=end;}};
}

function rimHarness(){
  const h=harness(),source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../www/dial.js'),'utf8');
  h.run(`var handlers={},pointers=new Map(),editing=false,menuOpen=false,scroll=false,controlDrag=null,geometry={},scrollGeometry={},
    B=window.wandBridge,structuredClone=x=>({...x}),view=()=>({}),detent=()=>{},notice=()=>{},nextPage=()=>{},
    action=id=>({name:id,key:id==='key:backspace'?'backspace':'enter'}),
    fireRim=id=>B.tap(action(id)),
    el={dataset:{action:'key:backspace'},getAttribute(){return ''},closest(){return this},classList:{add(){},remove(){}}},
    stageNode={hidden:true,addEventListener:(name,fn)=>handlers[name]=fn,getBoundingClientRect:()=>({left:0,top:0})},
    $=()=>stageNode,
    event=(type,x=0)=>({type,target:el,pointerId:1,clientX:x,clientY:0,preventDefault(){}});`);
  h.run(source.slice(source.indexOf('  function holdRim('),source.indexOf('  function nextPage(')));
  h.run(source.slice(source.indexOf("  const stage=$('dialStage');"),source.indexOf('  function detachMotion()')));
  return h;
}

test('rim Backspace starts on touch and never adds a second delete on release',()=>{
  const h=rimHarness();h.run("handlers.pointerdown(event('pointerdown'))");
  assert.deepEqual(h.frames.map(f=>f.s),[1]);h.advance(425);
  h.run("handlers.pointerup(event('pointerup'));handlers.lostpointercapture(event('lostpointercapture'))");h.advance(1000);
  assert.deepEqual(h.frames.map(f=>f.s),[1,0,1,0]);
});

test('sliding away, pointer cancellation, and lost capture stop rim Backspace',()=>{
  for(const cancel of ["handlers.pointermove(event('pointermove',20))","handlers.pointercancel(event('pointercancel'))","handlers.lostpointercapture(event('lostpointercapture'))"]){
    const h=rimHarness();h.run("handlers.pointerdown(event('pointerdown'))");h.run(cancel);h.advance(1000);
    h.run("handlers.pointerup(event('pointerup'))");h.advance(1000);
    assert.deepEqual(h.frames.map(f=>f.s),[1,0]);
  }
});

test('keyboard hold repeats rim Backspace, while other rim shortcuts remain completed taps',()=>{
  const h=rimHarness();h.run("handlers.keydown({...event('keydown'),key:' ',repeat:false})");h.advance(425);
  h.run("handlers.keyup({key:' '})");h.advance(1000);assert.deepEqual(h.frames.map(f=>f.s),[1,0,1,0]);
  const other=rimHarness();other.run("el.dataset.action='key:enter';handlers.pointerdown(event('pointerdown'))");other.advance(1000);
  assert.equal(other.frames.length,0);other.run("handlers.pointerup(event('pointerup'))");other.advance(60);
  assert.deepEqual(other.frames.map(f=>[f.key,f.s]),[['enter',1],['enter',0]]);
});

test('Backspace taps delete once and holding repeats after a delay until release',()=>{
  const h=harness();h.run('var release=window.wandBridge.press({key:"backspace"})');
  h.advance(424);assert.deepEqual(h.frames.map(f=>f.s),[1]);
  h.advance(1);assert.deepEqual(h.frames.map(f=>f.s),[1,0,1]);
  h.advance(140);assert.deepEqual(h.frames.map(f=>f.s),[1,0,1,0,1,0,1]);
  h.run('release();release()');const count=h.frames.length;h.advance(1000);
  assert.equal(h.frames.length,count);assert.equal(h.frames.at(-1).s,0);
  const tap=harness();tap.run('window.wandBridge.tap({key:"backspace"})');tap.advance(1000);
  assert.deepEqual(tap.frames.map(f=>f.s),[1,0]);
});

test('two contacts share one Backspace repeat and the final release stops it',()=>{
  const h=harness();h.run('var a=window.wandBridge.press({key:"backspace"}),b=window.wandBridge.press({key:"backspace"});a();a()');
  h.advance(425);assert.deepEqual(h.frames.map(f=>f.s),[1,0,1]);
  h.run('b()');h.advance(1000);assert.deepEqual(h.frames.map(f=>f.s),[1,0,1,0]);
});

test('stop, hidden menus, and connection replacement cancel Backspace without replay',()=>{
  for(const interrupt of ['window.wandBridge.stop()','document.hidden=true','ws={readyState:1,send(){throw Error("replacement socket used")}}']){
    const h=harness();h.run('var release=window.wandBridge.press({key:"backspace"})');h.advance(425);
    h.run(interrupt);h.advance(1000);assert.deepEqual(h.frames.map(f=>f.s),[1,0,1,0]);
    h.run('document.hidden=false;release()');h.advance(1000);assert.equal(h.frames.length,4);
  }
});

test('an old Backspace release cannot stop a fresh hold on the same connection',()=>{
  const h=harness();h.run('var old=window.wandBridge.press({key:"backspace"});window.wandBridge.stop();var fresh=window.wandBridge.press({key:"backspace"});old()');
  h.advance(425);assert.deepEqual(h.frames.map(f=>f.s),[1,0,1,0,1]);
  h.run('fresh()');h.advance(1000);assert.equal(h.frames.at(-1).s,0);
});
test('two fingers sharing Mic retain F8 until both release; duplicate releases are harmless',()=>{
  const h=harness();
  h.run('var a=window.wandBridge.press({key:"f8"}); var b=window.wandBridge.press({key:"f8"}); a();a()');
  assert.deepEqual(h.frames.map(f=>f.s),[1]);
  h.run('b();b()');assert.deepEqual(h.frames.map(f=>f.s),[1,0]);
});
test('a held dial button releases on its original connection, never a replacement socket',()=>{
  const h=harness();h.run('var release=window.wandBridge.press({button:"l"});ws={readyState:1,send(){throw Error("wrong socket")}};release()');
  assert.deepEqual(h.frames.map(f=>[f.btn,f.s]),[['l',1],['l',0]]);
});
test('macros run only on completed taps and cannot replay across reconnects',()=>{
  const h=harness();h.run('var a=window.wandBridge.press({name:"Copy",steps:["ctrl+c"]});a(false)');assert.equal(h.runs.length,0);
  h.run('a=window.wandBridge.press({name:"Copy",steps:["ctrl+c"]});ws={readyState:1};a(true)');assert.equal(h.runs.length,0);
  h.run('a=window.wandBridge.press({name:"Copy",steps:["ctrl+c"]});a(true)');assert.equal(h.runs.length,1);
});
test('offline and calibration touches cannot send button frames',()=>{
  const h=harness();h.run('ws.readyState=3;window.wandBridge.press({button:"l"})();ws.readyState=1;CAL.on=true;window.wandBridge.press({button:"r"})()');
  assert.equal(h.frames.length,0);
});

test('direct shortcut taps send their own key and can be stopped without a stuck press',()=>{
  const h=harness();h.run('window.wandBridge.tap({name:"Enter",key:"enter"})');
  assert.deepEqual(h.frames.map(f=>[f.key,f.s]),[['enter',1]]);
  h.run('window.wandBridge.stop()');h.timers.shift()();
  assert.deepEqual(h.frames.map(f=>[f.key,f.s]),[['enter',1],['enter',0]]);
});

test('rapid direct taps remain separate and macros still use the safe sequence runner',()=>{
  const h=harness();h.run('window.wandBridge.tap({button:"l"});window.wandBridge.tap({button:"l"})');
  h.timers.forEach(fn=>fn());
  assert.deepEqual(h.frames.map(f=>f.s),[1,0,1,0]);
  h.run('window.wandBridge.tap({name:"Copy",steps:["ctrl+c"]})');assert.equal(h.runs.length,1);
});

test('scroll inversion applies once and scrolling preserves the pointer motion preference',()=>{
  const h=harness();
  h.run('freeMotion=true;window.wandBridge.scrolling(true);window.wandBridge.wheel(.25);S.scrollInvert=true;window.wandBridge.wheel(.25);window.wandBridge.scrolling(false)');
  assert.deepEqual(h.frames.map(f=>f.v),[.25,-.25]);
  assert.equal(h.run('freeMotion'),true);assert.equal(h.run('dialScrolling'),false);
});
