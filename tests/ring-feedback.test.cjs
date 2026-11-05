const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const script=require('node:fs').readFileSync(require('node:path').join(__dirname,'../www/index.html'),'utf8');
function harness({vibration=false,native=false,active=true}={}){
  const requests=[],sounds=[],clicks=[];
  const c=vm.createContext({S:{haptics:true,ringTickSound:false},now:0,performance:{now:()=>c.now},
    navigator:{userActivation:{isActive:active},...(vibration?{vibrate:n=>{requests.push(n);return true;}}:{})},
    document:{body:{appendChild(){}},createElement:tag=>({...(native&&tag==='input'?{switch:true}:{}),setAttribute(){},style:{},appendChild(){},click(){clicks.push(tag);}})},
    clickSound:force=>sounds.push(force)});
  vm.runInContext(script.slice(script.indexOf('let ringSwitch ='),script.indexOf('// Every control carries')),c);
  return {requests,sounds,clicks,run:s=>vm.runInContext(s,c)};
}
test('ring feedback requests vibration once per detent and throttles very fast events',()=>{
  const h=harness({vibration:true});h.run('dialDetent();now=10;dialDetent();now=50;dialDetent()');
  assert.deepEqual(h.requests,[7,7]);assert.equal(h.clicks.length,0);
});
test('disabled haptics stay silent, while tick sound can be enabled independently',()=>{
  const h=harness({vibration:true,native:true});h.run('S.haptics=false;S.ringTickSound=true;dialDetent()');
  assert.equal(h.requests.length,0);assert.equal(h.clicks.length,0);assert.deepEqual(h.sounds,[true]);
});
test('native switch feedback is only attempted during user activation when vibration is unavailable',()=>{
  const h=harness({native:true});h.run('dialDetent()');assert.deepEqual(h.clicks,['label']);
  const inactive=harness({native:true,active:false});inactive.run('dialDetent()');assert.equal(inactive.clicks.length,0);
});
