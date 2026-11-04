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
    assert.ok(Math.hypot(v.mx,v.my)+v.mr<=.91001);
    assert.ok(Math.hypot(v.rx,v.ry)+v.rr<=.92001);
  }
});
test('Right Click stays fully on screen and thumb-sized at phone sizes',()=>{
  for(const [w,h] of [[375,667],[390,844],[430,932],[844,390]]){
    const g=M.geometry(M.defaults(w>h?'landscape':'portrait'),w,h);
    assert.ok(g.rr>=23);
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
    assert.ok(Math.hypot(g.mx-g.cx,g.my-g.cy)+g.mr<=g.r*.91+1e-7);
    assert.ok(g.rx-g.rr>=0 && g.rx+g.rr<=375);
    assert.ok(g.ry-g.rr>=0 && g.ry+g.rr<=667);
  }
});
