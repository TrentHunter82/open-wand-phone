/* Decorative only: this renderer never sends input or writes grip settings. */
(function (global) {
  'use strict';
  const STORAGE='wand.appearance.v1';
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(v)?v:0));
  const material=value=>['liquid','smoke','still'].includes(value)?value:'liquid';
  function advance(state,target,dt) {
    // A damped spring gives a tilt or touch a small, settling slosh.
    const t=clamp(dt,0,.04),out={...state};
    for(const axis of ['x','y']){
      const speed=axis+'v';out[speed]=clamp((state[speed]+(clamp(target[axis],-.65,.65)-state[axis])*20*t)*Math.exp(-3.5*t),-2,2);
      out[axis]=clamp(state[axis]+out[speed]*t,-.8,.8);
    }
    return out;
  }
  function resolution(w,h,dpr,quality=1) {
    const scale=Math.min(clamp(dpr,1,1.75),Math.sqrt(1200000/Math.max(1,w*h)))*clamp(quality,.5,1);
    return {width:Math.max(1,Math.round(w*scale)),height:Math.max(1,Math.round(h*scale))};
  }
  const vertex=`attribute vec2 position;
    void main(){gl_Position=vec4(position,0.0,1.0);}`;
  const fragment=`precision highp float;
    uniform vec2 resolution, viewport, tilt;
    uniform vec3 outerCircle, innerCircle, rightCircle;
    uniform vec3 ripples[4];
    uniform float time, smoke, still, mic, scrolling;
    float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float f=0.0,a=.5;mat2 m=mat2(.8,-.6,.6,.8);
      for(int i=0;i<4;i++){f+=a*noise(p);p=m*p*2.03+7.1;a*=.5;}return f;}
    float wave(vec2 p,float t){
      return sin(p.x*5.1+p.y*2.9+t*.75)*.038+sin(p.x*-3.9+p.y*6.3-t*.57)*.028
        +sin(p.x*9.7+p.y*3.5+t*.31)*.012;
    }
    void main(){
      vec2 pixel=vec2(gl_FragCoord.x/resolution.x,1.0-gl_FragCoord.y/resolution.y)*viewport;
      vec3 circle=outerCircle;float layer=0.0;
      if(distance(pixel,innerCircle.xy)<innerCircle.z){circle=innerCircle;layer=1.0;}
      if(distance(pixel,rightCircle.xy)<rightCircle.z){circle=rightCircle;layer=2.0;}
      vec2 p=(pixel-circle.xy)/circle.z;float radius=length(p);
      if(radius>1.0)discard;
      float t=time+layer*3.7;
      float ripple=0.0;
      for(int i=0;i<4;i++){
        float age=time-ripples[i].z;
        float d=distance(pixel,ripples[i].xy)/max(circle.z,70.0);
        ripple+=sin(d*30.0-age*7.5)*exp(-d*2.1-age*1.5)*smoothstep(0.0,.16,age)*step(0.0,age);
      }
      vec3 deep=vec3(.018,.065,.098),cyan=vec3(.065,.40,.47),silver=vec3(.42,.62,.66);
      float warm=mic*step(.5,layer)*(1.0-step(1.5,layer));
      cyan=mix(cyan,vec3(.53,.24,.18),warm*.85);
      silver=mix(silver,vec3(.8,.52,.39),warm*.8);
      vec3 col;
      if(smoke>.5){
        vec2 q=p*1.7+tilt*.7;
        vec2 drift=vec2(t*.075,-t*.11);
        vec2 warp=vec2(fbm(q+drift),fbm(q-2.3-drift*.7));
        float cloud=fbm(q*2.1+warp*3.0+drift+vec2(ripple*.22,0));
        float folds=fbm(q*3.2+warp*4.5-drift*.45);
        float wisps=pow(clamp(1.0-abs(cloud-.52)*4.6,0.0,1.0),4.0);
        float mist=smoothstep(.32,.85,cloud)*.46+wisps*.28;
        col=deep+cyan*mist+silver*wisps*folds*.24;
      }else{
        vec2 q=p+tilt*.23;
        float surface=-.13+tilt.x*p.x*.65+tilt.y*.22;
        surface+=sin(p.x*3.8-t*.8)*(.042+length(tilt)*.09)+sin(p.x*8.0+t*.61)*.018+ripple*.035;
        float filled=smoothstep(surface-.012,surface+.018,p.y);
        float h=wave(q,t)+ripple*.038;
        vec2 grad=vec2(wave(q+vec2(.025,0),t)-h,wave(q+vec2(0,.025),t)-h)/.025;
        vec3 normal=normalize(vec3(-grad*.8,1.0));
        float shine=pow(max(dot(normal,normalize(vec3(-.6,-.8,1.7))),0.0),30.0);
        vec2 refract=q*3.7+grad*.24+vec2(t*.055,-t*.035);
        float caustic=pow(1.0-abs(sin(refract.x+sin(refract.y*1.4)))*abs(sin(refract.y-sin(refract.x*.8))),10.0);
        float contour=exp(-abs(p.y-surface)*120.0);
        col=mix(deep*.8,deep+cyan*(.16+caustic*.40)+silver*shine*.28,filled);
        col+=silver*contour*.48+cyan*(ripple*.075+scrolling*.045)*filled;
        col+=cyan*exp(-abs(p.y-surface-.06)*12.0)*.10;
      }
      // A deep vignette keeps white type readable even under a moving highlight.
      float edge=smoothstep(.55,1.0,radius);
      col*=1.0-edge*.48;
      col+=silver*pow(max(0.0,1.0-length(p-vec2(-.4,-.65))*.6),4.0)*.025;
      col=mix(col,deep*.8,still);
      float alpha=1.0-smoothstep(.99,1.0,radius);
      gl_FragColor=vec4(col*alpha,alpha);
    }`;

  function mount(root) {
    const canvas=document.createElement('canvas');canvas.id='dialLiquid';canvas.setAttribute('aria-hidden','true');
    root.prepend(canvas);
    const menu=document.getElementById('dialMenu'),panel=document.createElement('div');panel.className='dial-appearance';
    panel.innerHTML='<label for="dialMaterial">Under the glass</label><select id="dialMaterial"><option value="liquid">Liquid</option><option value="smoke">Smoke</option><option value="still">Still glass</option></select><p id="dialMaterialHint"></p>';
    menu.append(panel);
    const select=panel.querySelector('select'),hint=panel.querySelector('p');
    let mode='liquid';try{mode=material(JSON.parse(localStorage.getItem(STORAGE))?.material);}catch{}
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let gl,program,buffer,uniforms={},available=false,lost=false,frame=0,clock=0,last=0,lastDraw=0,quality=1,slow=0,geometry=null;
    let spring={x:0,y:0,xv:0,yv:0},target={x:0,y:0},ripples=Array.from({length:4},()=>[-1000,-1000,-100]),rippleIndex=0,lastTouch=0;
    const activePointers=new Set();
    function setHint(){hint.textContent=!available?'Glass lighting is active. Animated effects are unavailable in this browser.':mode==='still'?'Still reflections, with no continuous animation.':reduced.matches?'Reduce Motion is on; this material stays still.':mode==='smoke'?'Slow silver-blue wisps respond to touch and tilt.':'Tilt to slosh. Touch the glass to send ripples through the liquid.';}
    function init(){
      try{
        gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,stencil:false,powerPreference:'low-power'});
        if(!gl)throw Error('No WebGL');
        const shaders=[];
        try{
          for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
            const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
            if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('Material shader unavailable');
          }
          program=gl.createProgram();shaders.forEach(shader=>gl.attachShader(program,shader));gl.linkProgram(program);
          if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Material shader unavailable');
        }finally{shaders.forEach(shader=>gl.deleteShader(shader));}
        gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
        const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
        for(const name of ['resolution','viewport','tilt','outerCircle','innerCircle','rightCircle','time','smoke','still','mic','scrolling','ripples[0]'])uniforms[name]=gl.getUniformLocation(program,name);
        available=true;lost=false;root.classList.add('glass-ready');
      }catch{
        if(gl&&program)gl.deleteProgram(program);if(gl&&buffer)gl.deleteBuffer(buffer);
        available=false;root.classList.remove('glass-ready');
      }
      canvas.hidden=!available;setHint();wake();
    }
    function blocked(){
      return document.hidden||root.classList.contains('editing')||!menu.hidden||
        ['dialEditor','dialPresets','actionsPanel'].some(id=>!document.getElementById(id).hidden)||
        document.getElementById('drawer').classList.contains('open')||document.getElementById('startOverlay').style.display!=='none';
    }
    function animated(){return mode!=='still'&&!reduced.matches&&!blocked();}
    function paint(dt){
      if(!available||!geometry)return;
      const {g,w,h,scroll}=geometry,size=resolution(w,h,devicePixelRatio||1,quality);
      if(canvas.width!==size.width||canvas.height!==size.height){canvas.width=size.width;canvas.height=size.height;gl.viewport(0,0,canvas.width,canvas.height);}
      spring=advance(spring,animated()?target:{x:0,y:0},dt);
      gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);gl.uniform2f(uniforms.viewport,w,h);
      gl.uniform3f(uniforms.outerCircle,g.cx,g.cy,g.clickR);gl.uniform3f(uniforms.innerCircle,g.mx,g.my,g.mr);gl.uniform3f(uniforms.rightCircle,g.rx,g.ry,g.rr);
      gl.uniform2f(uniforms.tilt,spring.x,spring.y);gl.uniform1f(uniforms.time,clock);
      gl.uniform1f(uniforms.smoke,mode==='smoke'?1:0);gl.uniform1f(uniforms.still,mode==='still'?1:0);gl.uniform1f(uniforms.scrolling,scroll?1:0);
      gl.uniform1f(uniforms.mic,root.querySelector('[data-zone="inner"].active')?1:0);
      gl.uniform3fv(uniforms['ripples[0]'],new Float32Array(ripples.flat()));
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,6);
    }
    function tick(now){
      frame=0;if(!available||lost||document.hidden)return;
      const elapsed=last?Math.min((now-last)/1000,.1):0;last=now;
      const live=animated();if(live)clock+=elapsed;
      if(!lastDraw||now-lastDraw>=32||!live){
        if(live&&lastDraw&&now-lastDraw>80){if(++slow>12){quality=Math.max(.65,quality*.8);slow=0;}}else slow=0;
        const drawDelta=lastDraw?Math.min((now-lastDraw)/1000,.04):0;
        lastDraw=now;paint(live?drawDelta:0);
      }
      if(live)frame=requestAnimationFrame(tick);
    }
    function wake(){if(!frame&&available&&!lost&&!document.hidden){last=0;lastDraw=0;frame=requestAnimationFrame(tick);}}
    function cancel(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;activePointers.clear();target={x:0,y:0};}
    function disturb(e){
      if(!available||reduced.matches||mode==='still'||blocked())return;
      const b=root.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top;
      ripples[rippleIndex]=[x,y,clock];rippleIndex=(rippleIndex+1)%4;
      spring.xv=clamp(spring.xv+(x/b.width-.5)*.8,-2,2);spring.yv=clamp(spring.yv+.25,-2,2);wake();
    }
    root.addEventListener('pointerdown',e=>{if(e.target.closest('[data-zone],[data-action]')){activePointers.add(e.pointerId);disturb(e);}},true);
    root.addEventListener('pointermove',e=>{
      if(e.pointerType==='mouse'&&!e.buttons){const b=root.getBoundingClientRect();target={x:(e.clientX-b.left)/b.width*.5-.25,y:(e.clientY-b.top)/b.height*.3-.15};}
      if(activePointers.has(e.pointerId)&&performance.now()-lastTouch>110){lastTouch=performance.now();disturb(e);}
    },{passive:true});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])root.addEventListener(event,e=>{activePointers.delete(e.pointerId);wake();},true);
    root.addEventListener('pointerleave',()=>{if(!activePointers.size)target={x:0,y:0};});
    window.addEventListener('devicemotion',e=>{
      if(!animated())return;
      const a=e.accelerationIncludingGravity;if(!a||!Number.isFinite(a.x)||!Number.isFinite(a.y))return;
      const angle=(screen.orientation?.angle||window.orientation||0)*Math.PI/180;
      const x=a.x*Math.cos(angle)-a.y*Math.sin(angle),z=Number.isFinite(a.z)?a.z:0;
      target={x:clamp(-x/9.81,-.65,.65),y:clamp(z/9.81*.3,-.3,.3)};
    },{passive:true});
    select.value=mode;root.dataset.material=mode;
    select.addEventListener('change',()=>{
      mode=material(select.value);root.dataset.material=mode;
      try{localStorage.setItem(STORAGE,JSON.stringify({material:mode}));}catch{}
      spring={x:0,y:0,xv:0,yv:0};ripples=Array.from({length:4},()=>[-1000,-1000,-100]);setHint();wake();
    });
    reduced.addEventListener('change',()=>{setHint();wake();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();else wake();});
    window.addEventListener('pagehide',cancel);window.addEventListener('pageshow',wake);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;available=false;cancel();root.classList.remove('glass-ready');canvas.hidden=true;setHint();});
    canvas.addEventListener('webglcontextrestored',init);
    const observer=new MutationObserver(wake);
    for(const el of [root,menu,...['dialEditor','dialPresets','actionsPanel','drawer','startOverlay'].map(id=>document.getElementById(id))].filter(Boolean))observer.observe(el,{attributes:true,attributeFilter:['class','hidden','style']});
    init();
    return {layout(g,w,h,scroll){geometry={g,w,h,scroll};wake();},wake};
  }
  const api={mount,material,advance,resolution};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.DialGlass=api;
})(typeof window==='undefined'?globalThis:window);
