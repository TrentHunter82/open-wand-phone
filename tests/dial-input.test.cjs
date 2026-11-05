const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const script=require('node:fs').readFileSync(require('node:path').join(__dirname,'../www/index.html'),'utf8');
function harness(){
  const frames=[],runs=[],timers=[];
  const c=vm.createContext({window:{},ws:{readyState:1,send:m=>frames.push(JSON.parse(m))},send:m=>frames.push(m),
    freeMotion:false,dialScrolling:false,CAL:{on:false},LAYOUT:{editing:false},document:{hidden:false},
    $:()=>({hidden:true}),drawer:{classList:{contains:()=>false}},S:{scrollPx:30,scrollInvert:false},
    pressFeedback(){},haptic(){},dialDetent(){},setMicUI(){},performance:{now:()=>1000},fYaw:{reset(){}},fPitch:{reset(){}},sentLog:[],engageT:0,
    setTimeout:fn=>timers.push(fn),runAction:(name,steps)=>runs.push({name,steps}),openActions(){},openDrawer(){},cancelAction(){}});
  vm.runInContext(script.slice(script.indexOf('const dialHeld ='),script.indexOf('</script>',script.indexOf('const dialHeld ='))),c);
  return {c,frames,runs,timers,run:s=>vm.runInContext(s,c)};
}
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
