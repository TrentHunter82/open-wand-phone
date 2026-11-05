/* Shared, deterministic dial settings and geometry. No browser dependencies. */
(function (root) {
  'use strict';
  const clamp = (n, lo, hi, fallback) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
  const defaults = (orientation) => ({x:.96,y:.53,r:.94,bw:.17,mx:-.13,my:0,mr:.41,rx:0,ry:.45,rr:.38,
    scrollX:.045,scrollY:.18,sx:-.50,sy:.60,sr:.12,motionX:.045,motionY:.9,motionFree:0,dockX:.04,dockY:.055,
    ...(orientation==='landscape'?{x:.68,y:.54,scrollX:.2,scrollY:.34,motionX:.25,motionY:.65}:{})});
  const baseOrder = ['left','key:enter','key:space','key:backspace','copy','paste','undo','redo'];
  function view(value = {}) {
    const d = defaults(), out = {};
    const limits = {x:[.25,1.25],y:[.28,.75],r:[.5,1.3],bw:[.1,.25],mx:[-.6,.6],my:[-.6,.6],mr:[.25,.65],
      rx:[-.6,.6],ry:[-.6,.6],rr:[.25,.55],scrollX:[0,.7],scrollY:[.12,.85],sx:[-1,1],sy:[-1,1],sr:[.08,.22],motionX:[0,.9],motionY:[.03,.9],motionFree:[0,1],dockX:[0,.8],dockY:[.03,.85]};
    for (const [k,[lo,hi]] of Object.entries(limits)) out[k]=clamp(value?.[k],lo,hi,d[k]);
    // Keep nested buttons within their parents with a usable surrounding band.
    for (const [x,y,limit] of [['mx','my',1-out.bw-out.mr],['rx','ry',.92-out.rr]]) {
      const dist=Math.hypot(out[x],out[y]);
      if(dist>limit) {out[x]*=limit/dist;out[y]*=limit/dist;}
    }
    return out;
  }
  function preset(p = {}, i = 0) {
    if(!p || typeof p!=="object") p={};
    return {id:'p'+i,name:typeof p.name==='string' ? p.name.slice(0,24) : 'My grip',
      views:{portrait:view(p.views?.portrait),landscape:view(p.views?.landscape || defaults("landscape"))},
      order:Array.isArray(p.order) ? [...new Set(p.order.filter(s=>typeof s==='string' && s.length<100))].slice(0,64) : [...baseOrder],
      outer:typeof p.outer==='string' ? p.outer : 'left',inner:typeof p.inner==='string' ? p.inner : 'mic',right:typeof p.right==='string' ? p.right : 'right',
      hidden:Array.isArray(p.hidden)?p.hidden.filter(s=>typeof s==='string').slice(0,64):[],
      selected:typeof p.selected==='string' ? p.selected : 'left'};
  }
  function normalize(raw) {
    const presets=Array.isArray(raw?.presets) && raw.presets.length ? raw.presets.slice(0,8).map(preset) : [preset()];
    return {presets,current:clamp(raw?.current,0,presets.length-1,0)|0};
  }
  function geometry(v, w, h) {
    const r=Math.min(w*v.r,h*.48), mr=Math.max(48,r*v.mr), rr=Math.min(mr*.6,Math.max(23,mr*v.rr));
    const bezelWidth=Math.min(r*.27,Math.max(40,r*v.bw)),clickR=r-bezelWidth;
    const project=(x,y,limit)=>{const d=Math.hypot(x,y),k=d>limit?Math.max(0,limit)/d:1;return [x*k,y*k];};
    const [ox,oy]=project(v.mx*r,v.my*r,clickR-mr);
    const [ix,iy]=project(v.rx*mr,v.ry*mr,mr-rr-8);
    let cx=w*v.x,cy=h*v.y,mx=cx+ox,my=cy+oy,rx=mx+ix,ry=my+iy;
    // Translate the entire assembly if necessary: nesting remains exact and
    // the small Right Click target can never disappear beyond a screen edge.
    const dx=Math.max(rr+8,Math.min(w-rr-8,rx))-rx;
    const dy=Math.max(110+rr,Math.min(h-70-rr,ry))-ry;
    return {cx:cx+dx,cy:cy+dy,r,clickR,bezelWidth,mx:mx+dx,my:my+dy,mr,rx:rx+dx,ry:ry+dy,rr};
  }
  function delta(a,b) { return ((b-a+Math.PI*3)%(Math.PI*2))-Math.PI; }
  function reorder(list, from, to) {
    const out=[...list];
    if(from<0 || from>=out.length || to<0 || to>=out.length) return out;
    out.splice(to,0,out.splice(from,1)[0]);return out;
  }
  const overlaps=(a,b,gap=0)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
  function scrollButton(v,g,w,h,obstacles=[]) {
    const wanted={x:g.cx+v.sx*g.clickR,y:g.cy+v.sy*g.clickR},size=Math.max(24,Math.min(64,g.r*v.sr));
    const clear=(x,y,r,inside)=>{
      if(x<r+8||x>w-r-8||y<r+70||y>h-r-16)return false;
      if(inside&&Math.hypot(x-g.cx,y-g.cy)+r+5>g.clickR)return false;
      if(Math.hypot(x-g.mx,y-g.my)<g.mr+r+8||Math.hypot(x-g.rx,y-g.ry)<g.rr+r+8)return false;
      return !obstacles.some(o=>Math.hypot(x-Math.max(o.x,Math.min(x,o.x+o.w)),y-Math.max(o.y,Math.min(y,o.y+o.h)))<r+5);
    };
    // Preserve the existing circles. If an unusually tight grip has no room
    // inside the wheel, keep Scroll nearby and clear of the other buttons.
    for(const inside of [true,false])for(let r=size;;r=Math.max(24,r-4)){
      if(clear(wanted.x,wanted.y,r,inside))return {...wanted,r,inside};
      let best=null,score=Infinity;
      for(let y=r+70;y<=h-r-16;y+=10)for(let x=r+8;x<=w-r-8;x+=10){
        if(!clear(x,y,r,inside))continue;
        const distance=Math.hypot(x-wanted.x,y-wanted.y);
        if(distance<score){score=distance;best={x,y,r,inside};}
      }
      if(best)return best;if(r===24)break;
    }
    // Extremely small viewports still get a visible target; normal phone sizes
    // always find a clear position above.
    return {x:Math.max(32,Math.min(w-32,wanted.x)),y:Math.max(94,Math.min(h-40,wanted.y)),r:24,inside:false};
  }
  function scrollStep(state,upRate,dt,degreesPerNotch=9) {
    if(!Number.isFinite(upRate)||!Number.isFinite(dt)||dt<=0)return {rate:0,notches:0};
    const seconds=Math.min(.05,dt),degrees=Math.max(-720,Math.min(720,upRate*180/Math.PI));
    if(Math.abs(degrees)<=2.5)return {rate:0,notches:0};
    const input=Math.sign(degrees)*(Math.abs(degrees)-2.5),previous=Number.isFinite(state?.rate)&&Math.sign(state.rate)===Math.sign(input)?state.rate:0;
    const rate=previous+(input-previous)*(1-Math.exp(-seconds/.075));
    const gain=clamp(degreesPerNotch,2,18,9),limit=6*Math.max(1,6/gain);
    const speed=Math.max(-limit,Math.min(limit,rate/gain));
    // The receivers use native wheel units: positive scrolls upward.
    return {rate,notches:speed*seconds};
  }
  function placeControl(rect,bounds,obstacles=[]) {
    const cx=x=>Math.max(bounds.left,Math.min(bounds.right-rect.w,x)),cy=y=>Math.max(bounds.top,Math.min(bounds.bottom-rect.h,y));
    const xs=[cx(rect.x)],ys=[cy(rect.y)];
    for(const o of obstacles){xs.push(cx(o.x-rect.w-8),cx(o.x+o.w+8));ys.push(cy(o.y-rect.h-8),cy(o.y+o.h+8));}
    const choices=xs.flatMap(x=>ys.map(y=>({...rect,x,y}))).sort((a,b)=>Math.hypot(a.x-rect.x,a.y-rect.y)-Math.hypot(b.x-rect.x,b.y-rect.y));
    return choices.find(r=>!obstacles.some(o=>overlaps(r,o,6)))||choices[0];
  }
  function rimKeys(g,w,h,obstacles=[]) {
    const radius=(g.r+g.clickR)/2,kw=Math.max(62,Math.min(100,radius*.42*.88)),kh=Math.max(28,Math.min(42,g.bezelWidth-10));
    const candidates=[],side=g.cx>w/2?Math.PI:0;
    // Sample the reachable half of the rim, reserving space for floating controls.
    for(let offset=1.45;offset>=-1.45;offset-=.02){
      const angle=side+offset,x=g.cx+Math.cos(angle)*radius,y=g.cy+Math.sin(angle)*radius;
      let rotation=((angle*180/Math.PI-270+540)%360)-180;
      if(rotation>90)rotation-=180;if(rotation<-90)rotation+=180;
      const a=rotation*Math.PI/180,bw=Math.abs(Math.cos(a))*kw+Math.abs(Math.sin(a))*kh,bh=Math.abs(Math.sin(a))*kw+Math.abs(Math.cos(a))*kh;
      const box={x:x-bw/2,y:y-bh/2,w:bw,h:bh};
      if(box.x<8||box.y<8||box.x+bw>w-8||box.y+bh>h-8||obstacles.some(o=>overlaps(box,o,5)))continue;
      candidates.push({x,y,rotation,angle,box,kw,kh});
    }
    let best=[];
    for(let seed=0;seed<Math.min(20,candidates.length);seed++){
      const chosen=[];
      for(const c of candidates.slice(seed))if(!chosen.length||Math.abs(c.angle-chosen.at(-1).angle)*radius>=kw+10){
        if(!chosen.some(p=>overlaps(p.box,c.box,4)))chosen.push(c);
      }
      if(chosen.length>best.length)best=chosen;
    }
    return best.slice(0,8);
  }
  function rimPage(list, page, radius, width, available) {
    const capacity=available===undefined?Math.max(3,Math.min(8,Math.floor((radius-width/2)*2.1/84)+1)):Math.max(2,Math.min(8,available));
    const size=list.length>capacity?capacity-1:capacity;
    const pages=Math.max(1,Math.ceil(list.length/size));
    const index=((page%pages)+pages)%pages;
    return {items:list.slice(index*size,(index+1)*size),index,pages,slots:pages>1?capacity:Math.max(1,list.length)};
  }
  const api={defaults,baseOrder,view,preset,normalize,geometry,delta,reorder,rimPage,placeControl,rimKeys,scrollButton,scrollStep};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.DialModel=api;
})(typeof window==='undefined' ? globalThis : window);
