const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const script=fs.readFileSync(require('node:path').join(__dirname,'../www/index.html'),'utf8');
function harness() {
  const frames=[];
  const c=vm.createContext({window:{},leftHeld:false,clutched:false,freeMotion:false,dialScrolling:false,ws:{readyState:1},
    LAYOUT:{editing:false},CAL:{on:false},dragTimer:0,dragLatched:false,lastTapEndT:0,
    sentLog:[],engageT:0,performance:{now:()=>1000},
    fYaw:{reset(){},filter:x=>x},fPitch:{reset(){},filter:x=>x},
    send:f=>frames.push(f),setClutchLabel(){},IDLE_LABEL:'Idle',
    $:()=>({classList:{remove(){}}}),undoRecent(){},scrollId:null,traceOn:false,
    deadzone:x=>x,shape:x=>x,traceAdd(){},S:{guard:0,reach:135,invertX:false,invertY:false},
    screenW:1920,REF_DT:1/60,sentCount:0,movedAcc:0,
    clutch:{classList:{remove(){}}},haptic(){},clutchId:1});
  vm.runInContext(script.slice(script.indexOf('function beginLeftDrag()'),script.indexOf('holdButton($("btnL"), beginLeftDrag')),c);
  vm.runInContext(script.slice(script.indexOf('function processRates('),script.indexOf('/* ---------------- trace')),c);
  vm.runInContext(script.slice(script.indexOf('function releaseClutch()'),script.indexOf('function endScroll()')),c);
  return {frames,run:s=>vm.runInContext(s,c)};
}
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

test('free motion works without holding and pauses during held motion scrolling',()=>{
  const h=harness();
  h.run('freeMotion=true;processRates(1,0,1/60);dialScrolling=true;processRates(1,0,1/60);dialScrolling=false;freeMotion=false;processRates(1,0,1/60)');
  assert.deepEqual(h.frames.map(f=>f.t),['m']);
});

test('held Scroll receives only the vertical rate and pointer motion resumes after release',()=>{
  const h=harness();
  h.run('var scrollFrames=[];window.Dial={scrollRate:(up,dt)=>scrollFrames.push([up,dt])};freeMotion=true;dialScrolling=true;processRates(5,-.4,1/60)');
  assert.equal(h.frames.length,0);
  assert.equal(h.run('JSON.stringify(scrollFrames)'),JSON.stringify([[-.4,1/60]]));
  h.run('dialScrolling=false;processRates(.5,.1,1/60)');
  assert.equal(h.frames[0].t,'m');assert.equal(h.run('freeMotion'),true);
});
