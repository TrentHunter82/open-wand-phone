/* Shared, deterministic dial settings and geometry. No browser dependencies. */
(function (root) {
  'use strict';
  const clamp = (n, lo, hi, fallback) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
  const defaults = (orientation) => ({x:.96,y:.53,r:.94,bw:.17,mx:-.13,my:0,mr:.41,rx:0,ry:.45,rr:.38,
    lx:-.75,ly:.22,lr:.12,
    scrollX:.045,scrollY:.18,sx:-.50,sy:.60,sr:.12,motionX:.045,motionY:.9,motionFree:0,dockX:.04,dockY:.055,
    ...(orientation==='landscape'?{x:.68,y:.54,scrollX:.2,scrollY:.34,motionX:.25,motionY:.65}:{})});
  const baseOrder = ['left','key:enter','key:space','key:backspace','copy','paste','undo','redo'];
  function view(value = {}) {
    const d = defaults(), out = {};
    const limits = {x:[.25,1.25],y:[.28,.75],r:[.5,1.3],bw:[.1,.25],mx:[-.6,.6],my:[-.6,.6],mr:[.25,.65],
      lx:[-1,1],ly:[-1,1],lr:[.08,.22],
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
    const wanted = {x:g.cx+v.sx*g.clickR, y:g.cy+v.sy*g.clickR};
    return placeBubble(wanted, g.r*v.sr, g, w, h, obstacles, []);
  }
  function clickBubble(v,g,w,h,scroll,obstacles=[]) {
    const wanted = {x:g.cx+v.lx*g.clickR, y:g.cy+v.ly*g.clickR};
    return placeBubble(wanted, g.r*v.lr, g, w, h, obstacles, [scroll]);
  }
  function placeBubble(wanted, radius, g, w, h, obstacles, otherBubbles) {
    const size = Math.max(24, Math.min(64, radius));
    const circles = [{x:g.mx, y:g.my, r:g.mr}, {x:g.rx, y:g.ry, r:g.rr}, ...otherBubbles];
    const clear=(x,y,r,inside)=>{
      if(x<r+8||x>w-r-8||y<r+70||y>h-r-16)return false;
      if(inside&&Math.hypot(x-g.cx,y-g.cy)+r+5>g.clickR)return false;
      if(circles.some(circle => Math.hypot(x-circle.x,y-circle.y)<circle.r+r+8))return false;
      return !obstacles.some(o=>Math.hypot(x-Math.max(o.x,Math.min(x,o.x+o.w)),y-Math.max(o.y,Math.min(y,o.y+o.h)))<r+5);
    };
    // Fit inside the wheel first. Tight grips can use clear space just outside it.
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
  function scrollPopup(x,y,w,h,top=0,bottom=0) {
    const height=Math.max(200,Math.min(328,h-top-bottom-24)),half=height/2;
    return {x:clamp(x,76,w-76,w/2),y:clamp(y,top+half+12,h-bottom-half-12,h/2),height,
      up:Math.max(24,Math.min(64,y-top-12)),down:Math.max(24,Math.min(64,h-bottom-y-12))};
  }
  function fingerScrollStep(state,offset,dt,sensitivity=9) {
    if(!Number.isFinite(offset)||!Number.isFinite(dt)||dt<=0)return {speed:0,notches:0};
    const seconds=Math.min(.05,dt),position=Math.max(-1,Math.min(1,offset)),neutral=.1;
    if(Math.abs(position)<=neutral)return {speed:0,notches:0};
    const amount=(Math.abs(position)-neutral)/(1-neutral),gain=clamp(sensitivity,2,18,9);
    const target=Math.sign(position)*Math.pow(amount,1.4+gain/20)*24*Math.max(1,6/gain);
    const previous=Number.isFinite(state?.speed)&&Math.sign(state.speed)===Math.sign(target)?state.speed:0;
    const speed=previous+(target-previous)*(1-Math.exp(-seconds/.045));
    return {speed,notches:speed*seconds};
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
  function rimSegments(g, slots) {
    const points = [...slots].sort((a,b)=>b.angle-a.angle);
    if (!points.length) return [];
    const wrap = (points[0].angle+points.at(-1).angle+Math.PI*2)/2;
    const edges = [wrap];
    for (let i=1;i<points.length;i++)edges.push((points[i-1].angle+points[i].angle)/2);
    edges.push(wrap-Math.PI*2);
    const point = (radius,angle) => [g.cx+radius*Math.cos(angle),g.cy+radius*Math.sin(angle)];
    return points.map((slot,index)=>{
      const start=edges[index],end=edges[index+1];
      const outerStart=point(g.r,start),outerEnd=point(g.r,end);
      const innerStart=point(g.clickR,end),innerEnd=point(g.clickR,start);
      const large=start-end>Math.PI?1:0;
      let path=`M${outerStart} A${g.r} ${g.r} 0 ${large} 0 ${outerEnd} L${innerStart} A${g.clickR} ${g.clickR} 0 ${large} 1 ${innerEnd} Z`;
      if (points.length === 1) {
        const outerMiddle=point(g.r,start-Math.PI),innerMiddle=point(g.clickR,end+Math.PI);
        path=`M${outerStart} A${g.r} ${g.r} 0 0 0 ${outerMiddle} A${g.r} ${g.r} 0 0 0 ${outerEnd} L${innerStart} A${g.clickR} ${g.clickR} 0 0 1 ${innerMiddle} A${g.clickR} ${g.clickR} 0 0 1 ${innerEnd} Z`;
      }
      return {...slot,start,end,path};
    });
  }
  function rimTextArc(g, slot, fontSize, metrics = {}) {
    // Preserve the safe label envelope from rimKeys while following the exact
    // ring radius. Baseline offset centers the letter bodies across its width.
    const middle=(g.r+g.clickR)/2, forward=Math.sin(slot.angle)<=0;
    const ascent=Number.isFinite(metrics.ascent)?metrics.ascent:fontSize*.73;
    const descent=Number.isFinite(metrics.descent)?metrics.descent:fontSize*.04;
    const center=(ascent-descent)/2;
    // On a clockwise path the tops of the glyphs point OUT, not in.
    // Reverse the baseline offset when the text direction changes at the bottom.
    const radius=middle-(forward?1:-1)*center;
    const half=Math.min((slot.kw-14)/(2*middle),.42);
    const direction=forward?1:-1, a=slot.angle-direction*half,b=slot.angle+direction*half;
    const point=t=>[g.cx+radius*Math.cos(t),g.cy+radius*Math.sin(t)];
    return {radius,length:2*half*radius,forward,
      path:`M${point(a)} A${radius} ${radius} 0 0 ${forward?1:0} ${point(b)}`};
  }
  const api={defaults,baseOrder,view,preset,normalize,geometry,delta,reorder,rimPage,rimSegments,rimTextArc,placeControl,rimKeys,scrollButton,clickBubble,scrollPopup,fingerScrollStep};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.DialModel=api;
})(typeof window==='undefined' ? globalThis : window);
