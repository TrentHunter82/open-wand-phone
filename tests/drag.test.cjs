const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const script=fs.readFileSync(require('node:path').join(__dirname,'../www/index.html'),'utf8');
function harness() {
  const frames=[];
  const c=vm.createContext({window:{},leftHeld:false,clutched:false,freeMotion:false,dialScrolling:false,dialMotionHolds:new Set(),
    ws:{readyState:1,send:message=>frames.push(JSON.parse(message))},document:{hidden:false},drawer:{classList:{contains:()=>false}},
    LAYOUT:{editing:false},CAL:{on:false},dragTimer:0,dragLatched:false,lastTapEndT:0,
    sentLog:[],engageT:0,performance:{now:()=>1000},
    fYaw:{reset(){},filter:x=>x},fPitch:{reset(){},filter:x=>x},
    send:f=>frames.push(f),setClutchLabel(){},IDLE_LABEL:'Idle',
    $:()=>({hidden:true,classList:{remove(){}}}),undoRecent(){},scrollId:null,traceOn:false,
    pressFeedback(){},dialDetent(){},openActions(){},openDrawer(){},cancelAction(){},
    deadzone:x=>x,shape:x=>x,traceAdd(){},S:{guard:0,reach:135,invertX:false,invertY:false},
    screenW:1920,REF_DT:1/60,sentCount:0,movedAcc:0,
    clutch:{classList:{remove(){}}},haptic(){},clutchId:1});
  vm.runInContext(script.slice(script.indexOf('function beginLeftDrag()'),script.indexOf('holdButton($("btnL"), beginLeftDrag')),c);
  vm.runInContext(script.slice(script.indexOf('function processRates('),script.indexOf('/* ---------------- trace')),c);
  vm.runInContext(script.slice(script.indexOf('function releaseClutch()'),script.indexOf('function endScroll()')),c);
  const bridgeStart=script.indexOf('const dialHeld =');
  vm.runInContext(script.slice(bridgeStart,script.indexOf('</script>',bridgeStart)),c);
  return {frames,run:s=>vm.runInContext(s,c)};
}

test('the dial click bubble and movement trigger can be held and released independently',()=>{
  const h=harness();
  h.run(`const B=window.wandBridge;
    processRates(1,0,1/60);
    const click=B.press({button:'l'});processRates(1,0,1/60);
    const move=B.holdMotion();processRates(1,0,1/60);
    move();processRates(1,0,1/60);click();`);
  assert.deepEqual(h.frames.map(f=>[f.t,f.s]),[['b',1],['m',undefined],['b',0]]);
});

test('trigger contacts share movement and release leaves continuous mode intact',()=>{
  const h=harness();
  h.run(`const B=window.wandBridge,a=B.holdMotion(),b=B.holdMotion();
    a();a();processRates(1,0,1/60);
    b();processRates(1,0,1/60);
    B.motion(true);const move=B.holdMotion();move();processRates(1,0,1/60);
    B.motion(false);processRates(1,0,1/60);`);
  assert.deepEqual(h.frames.map(f=>f.t),['m','m']);
});
test('holding L enables motion without the clutch; releasing drops and stops motion',()=>{
  const h=harness();
  h.run('beginLeftDrag(); processRates(1,0,1/60); endLeftDrag(); processRates(1,0,1/60)');
  assert.deepEqual(h.frames.map(f=>[f.t,f.s]),[['b',1],['m',undefined],['b',0]]);
});
test('releasing the clutch during an L drag does not release the left button',()=>{
  const h=harness();
  h.run('beginLeftDrag(); clutched=true; releaseClutch(); processRates(1,0,1/60)');
  assert.equal(h.run('leftHeld'),true);
  assert.deepEqual(h.frames.map(f=>f.t),['b','m']);
});
test('cancellation clears dragging; offline and layout editing cannot start it',()=>{
  const h=harness();
  h.run('beginLeftDrag(); endLeftDrag(false); endLeftDrag(false)');
  assert.equal(h.frames.length,2);
  h.run('ws.readyState=3; beginLeftDrag()');
  assert.equal(h.run('leftHeld'),false);
  h.run('ws.readyState=1; LAYOUT.editing=true; beginLeftDrag()');
  assert.equal(h.run('leftHeld'),false);
});

test('free motion works without holding and pauses during held finger scrolling',()=>{
  const h=harness();
  h.run('freeMotion=true;processRates(1,0,1/60);dialScrolling=true;processRates(1,0,1/60);dialScrolling=false;freeMotion=false;processRates(1,0,1/60)');
  assert.deepEqual(h.frames.map(f=>f.t),['m']);
});

test('pointer stays frozen while the finger-scroll loop owns motion and resumes on release',()=>{
  const h=harness();
  h.run('freeMotion=true;dialScrolling=true;processRates(5,-.4,1/60)');assert.equal(h.frames.length,0);
  h.run('dialScrolling=false;processRates(.5,.1,1/60)');
  assert.equal(h.frames[0].t,'m');assert.equal(h.run('freeMotion'),true);
});
