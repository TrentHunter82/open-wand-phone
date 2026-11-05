const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const M=require('../www/dial-model.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../www/dial.js'),'utf8');

function harness(){
  let now=1000,pose={pitch:10*Math.PI/180,t:now,axis:'top'},serial=0,busy=false,online=true,scrolling=false;
  const callbacks=new Map(),frames=[];
  const context=vm.createContext({M,scroll:false,scrollFilter:{angle:0},scrollBaseline:null,scrollAxis:null,scrollFrame:0,scrollLastFrame:0,scrollStarted:0,scrollTurn:0,
    editing:false,menuOpen:false,pointers:new Map(),controlDrag:null,geometry:{cx:100,cy:100},
    performance:{now:()=>now},requestAnimationFrame:fn=>{callbacks.set(++serial,fn);return serial;},cancelAnimationFrame:id=>callbacks.delete(id),
    B:{motionScrollPose:()=>pose,scrollSensitivity:()=>6,ready:()=>online,busy:()=>busy,stop(){},haptic(){},scrolling:on=>scrolling=on,wheel:v=>frames.push(v)},
    render(){},view:()=>({}),$:()=>({querySelectorAll:()=>[],setAttribute(){}}),matchMedia:()=>({matches:false})});
  vm.runInContext(source.slice(source.indexOf('  function releaseAll()'),source.indexOf('  const textMeasure=')),context);
  return {frames,callbacks,run:code=>vm.runInContext(code,context),
    pose(degrees){pose={pitch:degrees*Math.PI/180,t:now,axis:'top'};},missing(){pose=null;},busy(){busy=true;},offline(){online=false;},
    scrolling:()=>scrolling,
    step(ms=33,fresh=true){now+=ms;if(pose&&fresh)pose={...pose,t:now};const pending=[...callbacks.values()];callbacks.clear();pending.forEach(fn=>fn(now));},
    start(){vm.runInContext('setScrollHeld(true)',context);},stop(){vm.runInContext('setScrollHeld(false)',context);}};
}

test('stationary tilted pose keeps scrolling at the cap, neutral stops, and downward tilt reverses',()=>{
  const h=harness();h.start();for(let i=0;i<8;i++)h.step();assert.equal(h.frames.length,0);
  h.pose(40);for(let i=0;i<60;i++)h.step();
  assert.ok(h.frames.length>50);assert.ok(h.frames.slice(-10).every(v=>Math.abs(v-6*.033)<1e-8));
  const count=h.frames.length;h.pose(10);for(let i=0;i<10;i++)h.step();assert.equal(h.frames.length,count);
  h.pose(-15);h.step();assert.ok(h.frames.at(-1)<0);
});

test('release cancels the loop and each fresh hold uses its current angle as neutral',()=>{
  const h=harness();h.start();h.pose(40);for(let i=0;i<12;i++)h.step();const pending=[...h.callbacks.values()];
  h.stop();const count=h.frames.length;pending.forEach(fn=>fn(2000));
  assert.equal(h.frames.length,count);assert.equal(h.callbacks.size,0);assert.equal(h.scrolling(),false);
  h.start();for(let i=0;i<20;i++)h.step();assert.equal(h.frames.length,count);
});

test('stale or missing pose stops output and fresh data recenters instead of replaying a held tilt',()=>{
  const h=harness();h.start();h.pose(40);for(let i=0;i<20;i++)h.step();const count=h.frames.length;
  h.step(600,false);assert.equal(h.frames.length,count);
  for(let i=0;i<10;i++)h.step();assert.equal(h.frames.length,count);
  h.pose(55);for(let i=0;i<10;i++)h.step();assert.ok(h.frames.length>count);
  const beforeMissing=h.frames.length;h.missing();h.step();assert.equal(h.frames.length,beforeMissing);
});

test('menus and connection loss cancel sustained scrolling immediately',()=>{
  for(const interrupt of ['busy','offline']){
    const h=harness();h.start();h.pose(40);for(let i=0;i<15;i++)h.step();const count=h.frames.length;
    h[interrupt]();h.step();assert.equal(h.frames.length,count);assert.equal(h.scrolling(),false);assert.equal(h.callbacks.size,0);
  }
});
