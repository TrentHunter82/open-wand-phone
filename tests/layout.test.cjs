const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require('node:path').join(__dirname, '../www/index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function harness() {
  const context = vm.createContext({innerWidth:375, innerHeight:667});
  vm.runInContext(script.slice(script.indexOf('function layoutOrientation()'), script.indexOf('function layoutBounds()')), context);
  return code => vm.runInContext(code, context);
}
test('saved locations scale with available phone space and clamp to its edges', () => {
  const run=harness();
  run('var bounds={x:12,y:72,w:351,h:577}; var size={w:90,h:110}');
  assert.equal(run('layoutPosition({x:1,y:1},bounds,size).x'),273);
  assert.equal(run('layoutPosition({x:1,y:1},bounds,size).y'),539);
  assert.equal(run('layoutPosition({x:-20,y:90},bounds,size).x'),12);
  assert.equal(run('layoutPosition({x:-20,y:90},bounds,size).y'),539);
  assert.equal(run('layoutPosition({x:NaN,y:0},bounds,size)'),null);
  assert.equal(run('layoutPosition({x:1,y:1},bounds,{w:1000,h:1000}).x'),12);
});
test('portrait and landscape use separate layouts', () => {
  const run=harness();
  assert.equal(run('layoutOrientation()'),'portrait');
  assert.equal(run('innerWidth=844;innerHeight=390;layoutOrientation()'),'landscape');
});
test('invalid stored layouts cannot break the editor', () => {
  const run=harness();
  assert.equal(run('JSON.stringify(normalizeLayouts({portrait:3,landscape:[]}))'),'{}');
  assert.equal(run('JSON.stringify(normalizeLayouts({portrait:{btnMic:{x:0.2,y:0.4},clutch:null,scroll:{x:"bad",y:0}}}))'),
    '{"portrait":{"btnMic":{"x":0.2,"y":0.4}}}');
});
test('overlapping drops are rejected while touching edges are allowed', () => {
  const run=harness();
  run('var a={left:0,top:0,right:100,bottom:100}');
  assert.equal(run('layoutOverlap(a,{left:50,top:50,right:150,bottom:150})'),true);
  assert.equal(run('layoutOverlap(a,{left:100,top:0,right:200,bottom:100})'),false);
});
test('editor blocks mouse, wheel and keyboard frames but permits heartbeats', () => {
  const frames=[];
  const context=vm.createContext({LAYOUT:{editing:true},ws:{readyState:1,send:f=>frames.push(JSON.parse(f))}});
  vm.runInContext(script.slice(script.indexOf('function send(obj)'),script.indexOf('function setStatus')),context);
  vm.runInContext('["m","b","k","w","p"].forEach(t=>send({t}))',context);
  assert.deepEqual(frames,[{t:'p'}]);
});
test('resizing keeps usable targets, fits the viewport, and preserves button proportions', () => {
  const run=harness();
  run('var b={x:0,y:0,w:350,h:500}; var n={w:80,h:100}');
  assert.equal(run('layoutSize("clutch",{w:1,h:1},n,b).w'),140);
  assert.equal(run('layoutSize("scroll",{w:500,h:900},n,b).h'),500);
  assert.equal(run('layoutSize("btnMic",{w:160,h:110},n,b).h'),200);
});
test('smart placement snaps spacing and finds nearby unoccupied space', () => {
  const run=harness();
  run('var b={x:0,y:0,w:350,h:500}; var size={w:80,h:80}; var obstacles=[{left:100,top:100,right:180,bottom:180}]');
  assert.equal(run('smartPosition({x:196,y:100},size,b,obstacles).x'),190);
  run('var p=smartPosition({x:110,y:110},size,b,obstacles,true)');
  assert.equal(run('layoutOverlap({left:p.x,top:p.y,right:p.x+80,bottom:p.y+80},obstacles[0])'),false);
  assert.equal(run('smartPosition({x:0,y:0},size,b,[{left:0,top:0,right:350,bottom:500}],true)'),null);
});

test('reflowed compact controls retain their sizes when the saved layout is applied', () => {
  const run=harness();
  run('var b={x:0,y:0,w:600,h:350}');
  assert.equal(run('layoutSize("more",{w:54,h:58},{w:54,h:58},b).w'),54);
  assert.equal(run('layoutSize("btnMic",{w:56,h:56},{w:56,h:56},b).h'),56);
});
test('live reflow anchors the dragged control and relocates neighbors without overlap', () => {
  const run=harness();
  run('var b={x:0,y:0,w:350,h:500}; var items=[{key:"a",x:0,y:0,w:80,h:80},{key:"b",x:90,y:0,w:80,h:80},{key:"c",x:180,y:0,w:80,h:80}]; var target={x:90,y:0,w:100,h:100}; var before=JSON.stringify(items); var plan=reflowLayout(items,"a",target,b)');
  assert.equal(run('plan.a.x'),90);
  assert.equal(run('plan.a.w'),100);
  assert.equal(run('plan.b.w'),80);
  assert.equal(run('JSON.stringify(items)===before'),true);
  assert.equal(run('Object.values(plan).every((p,i,all)=>all.slice(i+1).every(q=>!layoutOverlap({left:p.x,top:p.y,right:p.x+p.w,bottom:p.y+p.h},{left:q.x,top:q.y,right:q.x+q.w,bottom:q.y+q.h})))'),true);
  assert.equal(run('JSON.stringify(reflowLayout(items,"a",target,b))===JSON.stringify(plan)'),true);
});
test('impossible reflow fails without mutating the starting layout', () => {
  const run=harness();
  run('var items=[{key:"a",x:0,y:0,w:80,h:80},{key:"b",x:90,y:0,w:80,h:80}]; var before=JSON.stringify(items)');
  assert.equal(run('reflowLayout(items,"a",{x:0,y:0,w:170,h:80},{x:0,y:0,w:170,h:80})'),null);
  assert.equal(run('JSON.stringify(items)===before'),true);
});
test('moving into empty space leaves other controls where they were', () => {
  const run=harness();
  run('var items=[{key:"a",x:0,y:0,w:80,h:80},{key:"b",x:100,y:0,w:80,h:80}]; var plan=reflowLayout(items,"a",{x:0,y:200,w:80,h:80},{x:0,y:0,w:350,h:500})');
  assert.equal(run('plan.b.x'),100);
  assert.equal(run('plan.b.y'),0);
});
