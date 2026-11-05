/* Shared, deterministic dial settings and geometry. No browser dependencies. */
(function (root) {
  'use strict';
  const clamp = (n, lo, hi, fallback) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
  const defaults = (orientation) => ({x:.96,y:.53,r:.94,bw:.17,mx:-.13,my:0,mr:.41,rx:0,ry:.45,rr:.38,
    scrollX:.045,scrollY:.18,motionX:.045,motionY:.9,
    ...(orientation==='landscape'?{x:.68,y:.54,scrollX:.2,scrollY:.34,motionX:.25,motionY:.65}:{})});
  const baseOrder = ['left','key:enter','key:space','key:backspace','copy','paste','undo','redo'];
  function view(value = {}) {
    const d = defaults(), out = {};
    const limits = {x:[.25,1.25],y:[.28,.75],r:[.5,1.3],bw:[.1,.25],mx:[-.6,.6],my:[-.6,.6],mr:[.25,.65],
      rx:[-.6,.6],ry:[-.6,.6],rr:[.25,.55],scrollX:[0,.7],scrollY:[.12,.85],motionX:[0,.7],motionY:[.12,.9]};
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
      inner:typeof p.inner==='string' ? p.inner : 'mic',right:typeof p.right==='string' ? p.right : 'right',
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
  const api={defaults,baseOrder,view,preset,normalize,geometry,delta,reorder};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.DialModel=api;
})(typeof window==='undefined' ? globalThis : window);
