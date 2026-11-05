const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../www/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function harness(stored = {}) {
  const timers = [], frames = [], nodes = new Map();
  const socket = { readyState: 1, send: data => frames.push(JSON.parse(data)) };
  const context = vm.createContext({
    localStorage: { getItem: () => JSON.stringify(stored), setItem() {} },
    setTimeout: fn => timers.push(fn), ws: socket,
    $: id => { if (!nodes.has(id)) nodes.set(id, { textContent: '' }); return nodes.get(id); },
  });
  vm.runInContext(script.slice(script.indexOf('const DEFAULTS'), script.indexOf('/* ---------------- state')), context);
  vm.runInContext(script.slice(script.indexOf('const KEY_NAMES'), script.indexOf('function openActions()')), context);
  return { context, frames, socket, timers,
    eval: code => vm.runInContext(code, context),
    async tick() { assert.ok(timers.length); timers.shift()(); await Promise.resolve(); },
  };
}

test('existing shortcuts and motion tuning survive migration', () => {
  const h = harness({ hotkeys: ['enter', 'backspace', 'space'], reach: 123, betaUnit: 'hz100' });
  assert.equal(h.eval('JSON.stringify(S.hotkeys)'), '["enter","backspace","space"]');
  assert.equal(h.eval('S.reach'), 123);
  assert.equal(h.eval('S.redoCombo'), 'ctrl+y');
  assert.equal(h.eval('S.macros.length'), 0);
  assert.equal(h.eval('S.motionScrollDeg'), 9);
});

test('motion-scroll speed saves independently and invalid stored speeds are bounded',()=>{
  for(const [stored,expected] of [[2,2],[4,4],[6,6],[12,12],[1,2],[99,18],['fast',9],[null,9]]){
    const h=harness({motionScrollDeg:stored,reach:123});
    assert.equal(h.eval('S.motionScrollDeg'),expected);assert.equal(h.eval('S.reach'),123);
  }
});

test('macro validation rejects unknown, empty and excessive steps', () => {
  const h = harness();
  assert.equal(h.eval('JSON.stringify(macroSteps("ctrl+a, ctrl+c"))'), '["ctrl+a","ctrl+c"]');
  for (const value of ['', 'ctrl+a,', 'nonsense', Array(13).fill('enter').join(',')]) {
    assert.equal(h.eval(`macroSteps(${JSON.stringify(value)})`), null);
  }
});

test('macro migration preserves more than three definitions and stable unique identities', () => {
  const stored = Array.from({length:40},(_,i)=>({id:'same',name:'Macro '+i,steps:'ctrl+c',pinned:i%2===0}));
  const h=harness({macros:stored});
  assert.equal(h.eval('S.macros.length'),32);
  assert.equal(h.eval('new Set(S.macros.map(m=>m.id)).size'),32);
  assert.equal(h.eval('S.macros[4].steps'),'ctrl+c');
  assert.equal(h.eval('S.macros[4].pinned'),true);
  assert.equal(h.eval('JSON.stringify(normalizeMacros(S.macros))===JSON.stringify(S.macros)'),true);
  assert.equal(h.eval('normalizeMacros([null,7,{name:"Old",steps:"enter"}])[0].pinned'),false);
});

test('layout editing cannot execute a macro through its direct socket path', async () => {
  const h=harness();
  h.eval('var LAYOUT={editing:true}');
  await h.eval('runAction("Copy",["ctrl+c"])');
  assert.equal(h.frames.length,0);
});

test('steps release modifiers before the next shortcut and ignore overlapping runs', async () => {
  const h = harness();
  const done = h.eval('runAction("Copy all", ["ctrl+a", "ctrl+c"])');
  await h.eval('runAction("Undo", ["ctrl+z"])');
  for (let i = 0; i < 4; i++) await h.tick();
  await done;
  assert.deepEqual(h.frames.map(f => [f.key, f.s]), [['ctrl+a', 1], ['ctrl+a', 0], ['ctrl+c', 1], ['ctrl+c', 0]]);
});

test('cancellation releases the current key and never resumes on a new connection', async () => {
  const h = harness();
  const done = h.eval('runAction("Copy all", ["ctrl+a", "ctrl+c"])');
  h.eval('cancelAction("Stopped"); ws = {readyState: 1, send() { throw Error("New socket used"); }}');
  await h.tick(); await h.tick(); await done;
  assert.deepEqual(h.frames.map(f => [f.key, f.s]), [['ctrl+a', 1], ['ctrl+a', 0]]);
});

test('offline actions send nothing', async () => {
  const h = harness();
  h.socket.readyState = 3;
  await h.eval('runAction("Undo", ["ctrl+z"])');
  assert.equal(h.frames.length, 0);
});

test('built-in actions use the connected computer platform without rewriting custom shortcuts', () => {
  const h = harness({hotkeys:['ctrl+c'], macros:[{name:'Copy',steps:'ctrl+c'}]});
  assert.equal(h.eval('JSON.stringify(builtinActions("darwin", "ctrl+y").map(a=>a.steps[0]))'),
    '["cmd+c","cmd+v","cmd+z","cmd+shift+z"]');
  assert.equal(h.eval('builtinActions("win32", "ctrl+shift+z")[3].steps[0]'), 'ctrl+shift+z');
  assert.equal(h.eval('S.hotkeys[0]'), 'ctrl+c');
});
