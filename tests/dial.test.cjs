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

test('the click bubble inherits the previous large pad assignment',()=>{
  const d=M.normalize({presets:[{selected:'copy'}]});assert.equal(d.presets[0].outer,'left');
  d.presets[0].outer='key:enter';assert.equal(M.normalize(d).presets[0].outer,'key:enter');
});

test('the click bubble fits inside Move without covering Mic or Scroll at phone sizes',()=>{
  for(const [w,h] of [[320,568],[390,844],[430,932],[844,390]]){
    const v=M.defaults(w>h?'landscape':'portrait'),g=M.geometry(v,w,h);
    const scroll=M.scrollButton(v,g,w,h),bubble=M.clickBubble(v,g,w,h,scroll);
    assert.ok(bubble.inside&&bubble.r>=24);
    assert.ok(Math.hypot(bubble.x-g.cx,bubble.y-g.cy)+bubble.r<=g.clickR);
    for(const other of [scroll,{x:g.mx,y:g.my,r:g.mr}]){
      assert.ok(Math.hypot(bubble.x-other.x,bubble.y-other.y)>=bubble.r+other.r+8);
    }
  }
  const v=M.view({lx:-.82,ly:.3,lr:.16});
  assert.deepEqual([v.lx,v.ly,v.lr],[-.82,.3,.16]);
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

test('scroll popup fits phone viewports and shortens travel near the screen edges',()=>{
  for(const [w,h] of [[320,568],[390,844],[844,390],[320,300]])for(const y of [60,h/2,h-40])for(const x of [24,w/2,w-24]){
    const p=M.scrollPopup(x,y,w,h,20,16);
    assert.ok(p.x-66>=8&&p.x+66<=w-8);
    assert.ok(p.y-p.height/2>=32-1e-8&&p.y+p.height/2<=h-28+1e-8);
    assert.ok(p.up>=24&&p.up<=64&&p.down>=24&&p.down<=64);
  }
  assert.equal(M.scrollPopup(100,804,390,844).down,28);
});

test('finger scrolling sustains an offset, stops immediately in the center, and reverses',()=>{
  let state={speed:0};
  for(let i=0;i<180;i++)state=M.fingerScrollStep(state,1,1/60,6);
  assert.ok(Math.abs(state.speed-24)<1e-8);assert.ok(state.notches>0);
  for(const center of [0,.09,-.1])assert.equal(M.fingerScrollStep(state,center,1/60,6).notches,0);
  assert.ok(M.fingerScrollStep(state,-1,1/60,6).notches<0);
  for(const [offset,dt] of [[NaN,1/60],[Infinity,1/60],[1,NaN],[1,-1]])assert.equal(M.fingerScrollStep(state,offset,dt).notches,0);
});

test('finger scrolling is frame-rate independent and a resumed frame cannot send a large burst',()=>{
  const totals=[];
  for(const hz of [30,60,120]){
    let state={speed:0},sum=0;
    for(let i=0;i<hz;i++){state=M.fingerScrollStep(state,1,1/hz,9);sum+=state.notches;}
    totals.push(sum);assert.ok(sum>22&&sum<=24);
    assert.equal(M.fingerScrollStep(state,0,1/hz,9).speed,0);
  }
  assert.ok(Math.max(...totals)-Math.min(...totals)<.3);
  assert.ok(M.fingerScrollStep({speed:72},5,10,2).notches<=3.6000001);
});

test('saved scroll speed retains its cap and fine finger movements stay controlled',()=>{
  for(const [gain,maximum] of [[2,72],[4,36],[6,24],[9,24],[18,24]]){
    const fast=M.fingerScrollStep({speed:maximum},1,.05,gain);
    assert.equal(fast.speed,maximum);assert.ok(fast.notches<=3.6000001);
    const fine=M.fingerScrollStep({speed:0},.2,.05,gain);
    assert.ok(fine.speed>0&&fine.speed<maximum*.06);
    assert.equal(M.fingerScrollStep(fast,0,1/60,gain).notches,0);
    assert.equal(M.fingerScrollStep({speed:-maximum},-1,.05,gain).speed,-maximum);
  }
});

test('every rim action remains reachable on small screens and macro-heavy layouts',()=>{
  for(const size of [1,8,40])for(const r of [187,320,366]){
    const ids=Array.from({length:size},(_,i)=>'a'+i),first=M.rimPage(ids,0,r,50),seen=[];
    for(let page=0;page<first.pages;page++)seen.push(...M.rimPage(ids,page,r,50).items);
    assert.deepEqual(seen,ids);assert.deepEqual(M.rimPage(ids,first.pages,r,50).items,first.items);
  }
});

test('metal rim sections meet without gaps and retain each readable label position',()=>{
  for(const [w,h] of [[320,568],[390,844],[844,390]])for(const x of [.25,.96,1.25]){
    const g=M.geometry(M.view({...M.defaults(w>h?'landscape':'portrait'),x}),w,h);
    const slots=M.rimKeys(g,w,h);
    const sections=M.rimSegments(g,slots);
    assert.equal(sections.length,slots.length);
    assert.ok(Math.abs(sections[0].start-sections.at(-1).end-Math.PI*2)<1e-8);
    sections.forEach((section,i)=>{
      assert.ok(section.start>section.angle&&section.angle>section.end);
      assert.ok(Number.isFinite(section.x)&&!section.path.includes('NaN'));
      if(i)assert.equal(sections[i-1].end,section.start);
    });
    const single=M.rimSegments(g,[slots[0]]);
    assert.equal(single.length,1);assert.equal((single[0].path.match(/ A/g)||[]).length,4);
  }
});

test('curved rim text follows its ring at every size and stays inside the label allowance',()=>{
  for(const [w,h] of [[320,568],[390,844],[844,390]])for(const bw of [.1,.25]){
    const g=M.geometry(M.view({...M.defaults(w>h?'landscape':'portrait'),bw}),w,h);
    for(const slot of M.rimKeys(g,w,h))for(const size of [10.5,15]){
      const ascent=size*.73,descent=size*.04;
      const arc=M.rimTextArc(g,slot,size,{ascent,descent}),middle=(g.r+g.clickR)/2;
      const direction=arc.forward?1:-1;
      assert.ok(Math.abs(arc.radius+direction*(ascent-descent)/2-middle)<1e-8);
      assert.ok(arc.radius>g.clickR+size*.5&&arc.radius<g.r-size*.5);
      assert.ok(arc.length<=slot.kw-10&&arc.length>20);
      assert.ok(!arc.path.includes('NaN'));
      const match=arc.path.match(/^M([^ ]+) A([^ ]+) ([^ ]+) 0 0 ([01]) (.+)$/);
      assert.ok(match);
      for(const endpoint of [match[1],match[5]]){
        const [x,y]=endpoint.split(',').map(Number);
        assert.ok(Math.abs(Math.hypot(x-g.cx,y-g.cy)-arc.radius)<1e-7);
      }
      assert.equal(Number(match[4]),arc.forward?1:0);
    }
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
