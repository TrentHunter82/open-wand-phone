const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../www/dial-model.js');
test('dial stores separate orientations, assignments, hidden actions and order',()=>{
  const d=M.normalize({presets:[{name:'Standing',views:{portrait:{r:1.1},landscape:{r:.6}},order:['left','copy','left'],hidden:['macro:a'],inner:'mic',right:'right'}]});
  assert.deepEqual(d.presets[0].order,['left','copy']);
  assert.equal(d.presets[0].views.portrait.r,1.1);assert.equal(d.presets[0].views.landscape.r,.6);
  assert.deepEqual(M.normalize(JSON.parse(JSON.stringify(d))),d);
});
test('corrupt settings cannot break the dial and nested circles stay constrained',()=>{
  for(const raw of [null,{},[],{presets:[null]},{presets:[{views:{portrait:{r:Infinity,mr:99,mx:-99,my:99,rr:99,rx:99,ry:-99}}}]}]) {
    const v=M.normalize(raw).presets[0].views.portrait;
    assert.ok(Object.values(v).every(Number.isFinite));
    assert.ok(Math.hypot(v.mx,v.my)+v.mr<=1-v.bw+.00001);
    assert.ok(Math.hypot(v.rx,v.ry)+v.rr<=.92001);
  }
});
test('Right Click stays fully on screen and thumb-sized at phone sizes',()=>{
  for(const [w,h] of [[375,667],[390,844],[430,932],[844,390]]){
    const g=M.geometry(M.defaults(w>h?'landscape':'portrait'),w,h);
    assert.ok(g.rr>=23);
    assert.ok(g.bezelWidth>=40);
    assert.ok(g.rx-g.rr>=0 && g.rx+g.rr<=w);
    assert.ok(g.ry-g.rr>=0 && g.ry+g.rr<=h);
    assert.ok(Math.hypot(g.rx-g.mx,g.ry-g.my)+g.rr<=g.mr+1);
  }
});
test('rotary angles cross their seam smoothly and reordering preserves the source',()=>{
  assert.ok(Math.abs(M.delta(Math.PI-.1,-Math.PI+.1)-.2)<1e-8);
  assert.ok(Math.abs(M.delta(-Math.PI+.1,Math.PI-.1)+.2)<1e-8);
  const a=['left','copy','paste'];assert.deepEqual(M.reorder(a,2,0),['paste','left','copy']);assert.deepEqual(a,['left','copy','paste']);
});

test('extreme resizing and repositioning preserve nesting and visible Right Click',()=>{
  for(const x of [.25,.96,1.25])for(const y of [.28,.75])for(const r of [.5,1.3])for(const mr of [.25,.65]){
    const g=M.geometry(M.view({x,y,r,mr,mx:.6,my:-.6,rx:.6,ry:.6,rr:.55}),375,667);
    assert.ok(Math.hypot(g.rx-g.mx,g.ry-g.my)+g.rr<=g.mr+1e-7);
    assert.ok(Math.hypot(g.mx-g.cx,g.my-g.cy)+g.mr<=g.clickR+1e-7);
    assert.ok(g.rx-g.rr>=0 && g.rx+g.rr<=375);
    assert.ok(g.ry-g.rr>=0 && g.ry+g.rr<=667);
  }
});

test('adding or moving the control dock preserves an existing custom wheel layout',()=>{
  const saved={x:.96,y:.61,r:.92,bw:.18,mx:-.13,my:.05,mr:.41,rx:0,ry:.45,rr:.38,scrollX:.6,scrollY:.2,motionX:.5,motionY:.3};
  const p=M.normalize({presets:[{name:'My saved grip',views:{portrait:saved}}]}).presets[0];
  for(const key of ['x','y','r','bw','mx','my','mr','rx','ry','rr'])assert.equal(p.views.portrait[key],saved[key]);
  assert.deepEqual(M.geometry(p.views.portrait,375,667),M.geometry({...p.views.portrait,dockX:.4,dockY:.4},375,667));
});

test('large pad defaults to Left Click independently of the old rotary selection',()=>{
  const d=M.normalize({presets:[{selected:'copy'}]});assert.equal(d.presets[0].outer,'left');
  d.presets[0].outer='key:enter';assert.equal(M.normalize(d).presets[0].outer,'key:enter');
});

test('Scroll is inside the wheel and outside Mic for normal phone layouts',()=>{
  for(const [w,h] of [[320,568],[375,667],[390,844],[430,932],[844,390]]){
    const v=M.defaults(w>h?'landscape':'portrait'),g=M.geometry(v,w,h),copy={...g},b=M.scrollButton(v,g,w,h);
    assert.ok(b.inside);assert.ok(b.r>=24);
    assert.ok(Math.hypot(b.x-g.cx,b.y-g.cy)+b.r<=g.clickR);
    assert.ok(Math.hypot(b.x-g.mx,b.y-g.my)>=g.mr+b.r+8);
    assert.ok(b.x-b.r>=0&&b.x+b.r<=w&&b.y-b.r>=0&&b.y+b.r<=h);
    assert.deepEqual(g,copy);
  }
});

test('Scroll finds room in tight grips without changing saved wheels',()=>{
  for(const r of [.5,1.3])for(const mr of [.25,.65])for(const x of [.25,.96,1.25]){
    const v=M.view({r,mr,x,mx:.6,my:.6}),g=M.geometry(v,375,667),copy={...g},b=M.scrollButton(v,g,375,667);
    assert.ok(Math.hypot(b.x-g.mx,b.y-g.my)>=g.mr+b.r+7.99);
    assert.ok(b.x-b.r>=0&&b.x+b.r<=375&&b.y-b.r>=0&&b.y+b.r<=667);
    assert.deepEqual(g,copy);
  }
  const d=M.normalize();d.presets[0].views.portrait.sx=-.7;d.presets[0].views.portrait.sy=.5;d.presets[0].views.portrait.sr=.15;
  assert.deepEqual(M.normalize(JSON.parse(JSON.stringify(d))),d);
});

test('scroll pitch tracks aiming elevation and ignores roll for either grip',()=>{
  const theta=20*Math.PI/180;
  assert.ok(Math.abs(M.scrollPitch([0,-Math.sin(theta),-Math.cos(theta)])-theta)<1e-10);
  assert.ok(Math.abs(M.scrollPitch([Math.cos(theta),-Math.sin(theta),0])-theta)<1e-10);
  assert.ok(Math.abs(M.scrollPitch([0,Math.cos(theta),Math.sin(theta)],'back')-theta)<1e-10);
  for(const gravity of [null,[],[0,0,0],[NaN,0,1],[0,null,1]])assert.equal(M.scrollPitch(gravity),null);
});

test('tilt scrolling sustains a stationary angle, reverses, and stops at neutral',()=>{
  const radians=degrees=>degrees*Math.PI/180;let state={angle:0};
  for(let i=0;i<180;i++)state=M.tiltScrollStep(state,radians(30),1/60,6);
  assert.equal(state.speed,6);assert.ok(state.notches>0);
  assert.equal(M.tiltScrollStep(state,0,1/60,6).notches,0);
  assert.equal(M.tiltScrollStep(state,radians(1),1/60,6).notches,0);
  assert.ok(M.tiltScrollStep(state,radians(-30),1/60,6).notches<0);
  for(const [angle,dt] of [[NaN,1/60],[Infinity,1/60],[10,NaN],[10,-1]])assert.equal(M.tiltScrollStep(state,angle,dt).notches,0);
});

test('tilt scroll caps speed without losing the physical return to neutral',()=>{
  const totals=[];
  for(const hz of [30,60,120]){
    let state={angle:0},sum=0;
    for(let i=0;i<hz;i++){state=M.tiltScrollStep(state,30*Math.PI/180,1/hz,9);sum+=state.notches;}
    totals.push(sum);assert.ok(sum>5&&sum<=6);
    assert.equal(M.tiltScrollStep(state,0,1/hz,9).speed,0);
  }
  assert.ok(Math.max(...totals)-Math.min(...totals)<.08);
  assert.ok(M.tiltScrollStep({angle:90},Math.PI/2,.05,9).notches<=.3000001);
});

test('saved faster settings retain threefold and 50 percent tilt speed headroom',()=>{
  for(const degrees of [5,15,60])for(const hz of [30,60,120]){
    let state={angle:0};const totals={2:0,4:0,6:0};
    for(let i=0;i<hz;i++){
      for(const gain of [2,4,6])totals[gain]+=M.tiltScrollStep(state,degrees*Math.PI/180,1/hz,gain).notches;
      state=M.tiltScrollStep(state,degrees*Math.PI/180,1/hz,6);
    }
    assert.ok(Math.abs(totals[2]-totals[6]*3)<1e-8);
    assert.ok(Math.abs(totals[4]-totals[6]*1.5)<1e-8);
  }
});

test('every rim action remains reachable on small screens and macro-heavy layouts',()=>{
  for(const size of [1,8,40])for(const r of [187,320,366]){
    const ids=Array.from({length:size},(_,i)=>'a'+i),first=M.rimPage(ids,0,r,50),seen=[];
    for(let page=0;page<first.pages;page++)seen.push(...M.rimPage(ids,page,r,50).items);
    assert.deepEqual(seen,ids);assert.deepEqual(M.rimPage(ids,first.pages,r,50).items,first.items);
  }
});

test('floating controls find nearby space clear of other controls and the header',()=>{
  const bounds={left:10,top:74,right:310,bottom:548},blocks=[{x:146,y:74,w:46,h:46},{x:138,y:12,w:168,h:44}];
  const target={x:150,y:80,w:122,h:46},placed=M.placeControl(target,bounds,blocks);
  const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  assert.equal(blocks.some(b=>overlap(placed,b)),false);
  assert.ok(placed.x>=bounds.left&&placed.x+placed.w<=bounds.right&&placed.y>=bounds.top&&placed.y+placed.h<=bounds.bottom);
  const clear={x:10,y:220,w:122,h:46};assert.deepEqual(M.placeControl(clear,bounds,blocks),clear);
  assert.deepEqual(target,{x:150,y:80,w:122,h:46});
});

test('rim keys fit the viewport and leave labels clear of controls in customized layouts',()=>{
  const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  for(const [w,h] of [[320,568],[375,667],[390,844],[844,390]])for(const x of [.25,.96,1.25])for(const r of [.5,.94,1.3]){
    const g=M.geometry(M.view({...M.defaults(w>h?'landscape':'portrait'),x,r}),w,h);
    const blocks=[{x:10,y:12,w:100,h:30},{x:130,y:12,w:180,h:44},{x:10,y:74,w:130,h:46},{x:148,y:74,w:46,h:46}];
    const keys=M.rimKeys(g,w,h,blocks);assert.ok(keys.length>=2);
    keys.forEach((k,i)=>{
      assert.ok(k.box.x>=8&&k.box.y>=8&&k.box.x+k.box.w<=w-8&&k.box.y+k.box.h<=h-8);
      assert.equal(blocks.some(b=>overlap(k.box,b)),false);
      assert.equal(keys.slice(i+1).some(other=>overlap(k.box,other.box)),false);
    });
    const ids=Array.from({length:40},(_,i)=>'macro:'+i),first=M.rimPage(ids,0,g.r,g.bezelWidth,keys.length),seen=[];
    for(let page=0;page<first.pages;page++)seen.push(...M.rimPage(ids,page,g.r,g.bezelWidth,keys.length).items);
    assert.deepEqual(seen,ids);assert.ok(first.slots<=keys.length);
  }
});
