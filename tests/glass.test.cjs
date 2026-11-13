const {test}=require('node:test');
const assert=require('node:assert/strict');
const G=require('../www/dial-glass.js');

test('invalid appearance choices fall back to liquid',()=>{
  for(const value of ['liquid','smoke','still'])assert.equal(G.material(value),value);
  for(const value of [null,undefined,{},'other'])assert.equal(G.material(value),'liquid');
});

test('metal skins default to Graphite and preserve the saved glass material',()=>{
  for(const skin of ['graphite','titanium','silver','glass'])assert.equal(G.skin(skin),skin);
  for(const raw of [null,{},[],{skin:'invalid'}])assert.equal(G.appearance(raw).skin,'graphite');
  assert.deepEqual(G.appearance({material:'smoke'}),{skin:'graphite',material:'smoke'});
  assert.deepEqual(G.appearance({skin:'silver',material:'still'}),{skin:'silver',material:'still'});
});

test('machining map is repeatable, mipmap-compatible and has directional tool marks',()=>{
  const map=G.metalTexture(),again=G.metalTexture();
  assert.equal(map.width&(map.width-1),0);assert.equal(map.height&(map.height-1),0);
  assert.equal(map.data.byteLength,map.width*map.height*4);assert.ok(map.data.byteLength<=262144);
  assert.deepEqual(map.data,again.data);
  let across=0,along=0;
  for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
    const i=(y*map.width+x)*4;
    assert.equal(map.data[i+3],255);
    across+=Math.abs(map.data[i+1]-map.data[(y*map.width+(x+1)%map.width)*4+1]);
    along+=Math.abs(map.data[i+1]-map.data[(((y+1)%map.height)*map.width+x)*4+1]);
  }
  assert.ok(across>along*3,'Tool marks should extend around the angle rather than form speckled noise');
});

test('a slosh impulse settles without moving the saved target',()=>{
  let state={x:0,y:0,xv:1.2,yv:-.7};const target={x:0,y:0};let peak=0;
  for(let i=0;i<600;i++){state=G.advance(state,target,1/60);peak=Math.max(peak,Math.abs(state.x));}
  assert.ok(peak>.05);assert.ok(Math.abs(state.x)<.001&&Math.abs(state.y)<.001);
  assert.deepEqual(target,{x:0,y:0});
});

test('long pauses and extreme tilt cannot make the decorative spring unstable',()=>{
  let state={x:0,y:0,xv:0,yv:0};
  for(let i=0;i<400;i++){
    state=G.advance(state,{x:i%2?100:-100,y:NaN},i%3?1/60:20);
    assert.ok(Object.values(state).every(Number.isFinite));
    assert.ok(Math.abs(state.x)<=.8&&Math.abs(state.y)<=.8&&Math.abs(state.xv)<=2&&Math.abs(state.yv)<=2);
  }
});

test('high-density animation stays within its pixel budget without changing CSS geometry',()=>{
  for(const [w,h,dpr] of [[390,844,3],[844,390,3],[430,932,3],[2560,1440,2]]){
    const size=G.resolution(w,h,dpr);
    assert.ok(size.width*size.height<1203000);assert.ok(size.width>0&&size.height>0);
    const smaller=G.resolution(w,h,dpr,.7);assert.ok(smaller.width<size.width&&smaller.height<size.height);
  }
});

test('hand rotation stirs the material even when gravity is unchanged',()=>{
  const rest=G.motionSample({accelerationIncludingGravity:{x:0,y:-9.81,z:0},rotationRate:{alpha:0,beta:0,gamma:0},interval:16});
  const turn=G.motionSample({accelerationIncludingGravity:{x:0,y:-9.81,z:0},rotationRate:{alpha:95,beta:-45,gamma:0},interval:16});
  assert.deepEqual(turn.tilt,rest.tilt);assert.equal(rest.energy,0);
  assert.ok(turn.energy>1&&turn.push.x>0&&turn.push.y<0);
});

test('missing and invalid hand-motion readings stay finite and bounded',()=>{
  for(const event of [{},{rotationRate:{alpha:Infinity,beta:NaN}},{rotationRate:{alpha:9999,gamma:-9999},accelerationIncludingGravity:{x:100,y:-100,z:100},interval:5000}]){
    const sample=G.motionSample(event,90);
    assert.ok([...Object.values(sample.tilt),...Object.values(sample.push),sample.energy,sample.dt].every(Number.isFinite));
    assert.ok(sample.energy<=1.8&&Math.abs(sample.push.x)<=1&&Math.abs(sample.push.y)<=1&&sample.dt<=.05);
  }
});
