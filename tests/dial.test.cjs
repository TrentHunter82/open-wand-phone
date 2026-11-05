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
