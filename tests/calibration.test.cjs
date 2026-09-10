const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../www/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);

function harness() {
  const nodes = new Map(), timers = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', style: {}, classList: { remove() {} } });
    return nodes.get(id);
  };
  const context = vm.createContext({
    $: node, clutched: false, performance: { now: () => 1000 },
    pressFeedback() {}, screenW: 3840, screenH: 1080,
    setTimeout(fn) { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }, clearInterval() {},
    dragTimer: 0, dragLatched: false, clutchId: null, scrollId: null, stripId: null,
    sentLog: [], lastTapEndT: 0, clutch: node('clutch'), strip: node('strip'),
    setClutchLabel() {}, IDLE_LABEL: 'Idle', fYaw: { reset() {} }, fPitch: { reset() {} },
    showBanner() {}, send() { throw Error('Calibration must not send cursor movement'); },
    S: { reach: 135, invertX: false, calWidth: 0 }, LS_UNDO: 'undo',
    localStorage: { setItem(key, value) { nodes.set(key, value); } },
    saveSettings() {}, refreshUI() {}, queueLayout() {},
  });
  const section = script.slice(script.indexOf('const CAL ='), script.indexOf('$("calStartBtn").addEventListener'));
  vm.runInContext(section, context);
  return { context, timers, nodes, eval: code => vm.runInContext(code, context) };
}

test('comfortable range scales to a selected display without learning the old sensitivity', () => {
  const h = harness();
  assert.equal(h.eval('reachForDisplay([30,32], 5760, 1920).reach'), 93);
  assert.equal(h.eval('reachForDisplay([-30,-32], 5760, 1920).invertX'), true);
  assert.throws(() => h.eval('reachForDisplay([30,60],3840,1920)'), /25%/);
  assert.throws(() => h.eval('reachForDisplay([-30,30],3840,1920)'), /directions/);
});

test('angle integration removes bias and rejects interrupted samples', () => {
  const h = harness();
  const samples = Array.from({length:121}, (_,i) => [i/60, Math.PI/6 + 0.01, 0]);
  h.context.samples = samples;
  const angle = h.eval('measuredAngle(samples, 0.01)');
  assert.ok(angle > 49 && angle < 52);
  samples[50][0] += 1;
  assert.throws(() => h.eval('measuredAngle(samples, 0.01)'), /paused/);
});

test('detects real edges and crossings on negative-coordinate displays but ignores other rows', () => {
  const h = harness();
  h.eval('var r = {x:-1920,y:-100,w:1920,h:1080}');
  assert.equal(h.eval('edgeReached(null,{x:-1920,y:0},r,"left")'), true);
  assert.equal(h.eval('edgeReached({x:-40,y:0},{x:30,y:0},r,"right")'), true);
  assert.equal(h.eval('edgeReached({x:-40,y:2000},{x:30,y:2000},r,"right")'), false);
  assert.equal(h.eval('edgeReached(null,{x:50,y:0},r,"right")'), false);
});

test('two live left-to-right passes enable apply, and completion does not repeat', () => {
  const h = harness();
  h.eval('CAL.on=true; CAL.preview=true; CAL.monitor={x:0,y:0,w:1920,h:1080}; var f={t:"cursor",x:0,y:20,desktop:{x:0,y:0,w:3840,h:1080},monitors:[CAL.monitor]}; CAL.layout=JSON.stringify([f.desktop,f.monitors]);');
  h.eval('calCursor(f)');
  assert.equal(h.eval('CAL.target'), 'left');
  h.eval('clutched=true; calCursor(f); f={...f,x:1919}; calCursor(f)');
  assert.equal(h.eval('CAL.passes'), 1);
  assert.equal(h.nodes.get('calBtn').disabled, true);
  h.eval('f={...f,x:0}; calCursor(f); f={...f,x:1919}; calCursor(f); calCursor(f)');
  assert.equal(h.eval('CAL.passes'), 2);
  assert.equal(h.nodes.get('calBtn').disabled, false);
});

test('cancel clears delayed measurement and display changes cancel the run', () => {
  const h = harness();
  h.eval('CAL.on=true; calRest()');
  assert.equal(h.timers.size, 1);
  h.eval('calEnd()');
  assert.equal(h.timers.size, 0);
  assert.equal(h.eval('CAL.rec'), false);
  h.eval('CAL.on=true; CAL.layout="old"; calCursor({x:0,y:0,desktop:{x:0,y:0,w:1920,h:1080},monitors:[{x:0,y:0,w:1920,h:1080}]})');
  assert.equal(h.eval('CAL.on'), false);
});

test('trial tuning is discarded on cancel and committed only after verified passes', () => {
  const h = harness();
  h.eval('CAL.on=true; CAL.preview=true; CAL.out={reach:90,invertX:true}; calApply()');
  assert.equal(h.eval('S.reach'), 135);
  h.eval('calEnd()');
  assert.equal(h.eval('S.reach'), 135);
  h.eval('CAL.on=true; CAL.preview=true; CAL.passes=2; CAL.lastReportAt=1000; calApply()');
  assert.equal(h.eval('S.reach'), 90);
  assert.equal(h.eval('S.invertX'), true);
  assert.equal(JSON.parse(h.nodes.get('undo')).reach, 135);
});
