const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const script=require('node:fs').readFileSync(require('node:path').join(__dirname,'../www/index.html'),'utf8');
function harness(){
  const frames=[],runs=[];
  const c=vm.createContext({window:{},ws:{readyState:1,send:m=>frames.push(JSON.parse(m))},send:m=>frames.push(m),
    freeMotion:false,dialScrolling:false,CAL:{on:false},LAYOUT:{editing:false},document:{hidden:false},
    $:()=>({hidden:true}),drawer:{classList:{contains:()=>false}},S:{scrollPx:30,scrollInvert:false},
    pressFeedback(){},haptic(){},setMicUI(){},performance:{now:()=>1000},fYaw:{reset(){}},fPitch:{reset(){}},sentLog:[],engageT:0,
    runAction:(name,steps)=>runs.push({name,steps}),openActions(){},openDrawer(){},cancelAction(){}});
  vm.runInContext(script.slice(script.indexOf('const dialHeld ='),script.indexOf('</script>',script.indexOf('const dialHeld ='))),c);
  return {c,frames,runs,run:s=>vm.runInContext(s,c)};
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
