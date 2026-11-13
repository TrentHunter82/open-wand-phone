/* Decorative only: this renderer never sends input or writes grip settings. */
(function (global) {
  'use strict';
  const STORAGE='wand.appearance.v1';
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(v)?v:0));
  const material=value=>['liquid','smoke','still'].includes(value)?value:'liquid';
  const skin = value => ['graphite','titanium','silver','glass'].includes(value) ? value : 'graphite';
  function appearance(value) {
    return {skin:skin(value?.skin),material:material(value?.material)};
  }
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
  function motionSample(event,angle=0) {
    const a=event.accelerationIncludingGravity||{},r=event.rotationRate||{},rad=clamp(angle,-360,360)*Math.PI/180;
    const rate=key=>clamp(r[key],-720,720),gx=clamp(a.x,-30,30)*Math.cos(rad)-clamp(a.y,-30,30)*Math.sin(rad);
    const speed=Math.hypot(rate('alpha'),rate('beta'),rate('gamma'));
    return {tilt:{x:clamp(-gx/9.81,-.65,.65),y:clamp(a.z/9.81*.3,-.3,.3)},
      push:{x:clamp((rate('alpha')+rate('gamma')*.5)/95,-1,1),y:clamp(rate('beta')/95,-1,1)},
      energy:speed<2?0:clamp(speed/90,0,1.8),dt:clamp(event.interval/1000,.008,.05)};
  }
  const vertex=`attribute vec2 position;
    void main(){gl_Position=vec4(position,0.0,1.0);}`;
  const fragment=`precision highp float;
    uniform vec2 resolution, viewport, tilt, flow;
    uniform vec3 outerCircle, innerCircle, rightCircle, leftCircle, scrollCircle;
    uniform vec3 ripples[4];
    uniform float time, smoke, still, mic, scrolling, activity, finish, wheelRadius;
    uniform vec4 pressed;
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
      if(finish>.5 && distance(pixel,outerCircle.xy)>outerCircle.z){
        circle=vec3(outerCircle.xy,wheelRadius);layer=3.0;
      }
      if(distance(pixel,innerCircle.xy)<innerCircle.z){circle=innerCircle;layer=1.0;}
      if(distance(pixel,rightCircle.xy)<rightCircle.z){circle=rightCircle;layer=2.0;}
      if(finish>.5 && distance(pixel,leftCircle.xy)<leftCircle.z){circle=leftCircle;layer=4.0;}
      if(finish>.5 && distance(pixel,scrollCircle.xy)<scrollCircle.z){circle=scrollCircle;layer=5.0;}
      vec2 p=(pixel-circle.xy)/circle.z;float radius=length(p);
      if(radius>1.0)discard;
      if(finish>.5){
        // A shallow machined face catches one broad light and a narrow edge light.
        float rim=step(2.5,layer)*(1.0-step(3.5,layer));
        float accent=step(3.5,layer)*step(2.5,finish);
        float titanium=step(1.5,finish)*(1.0-step(2.5,finish));
        vec3 base=mix(vec3(.13),vec3(.165),titanium);
        base=mix(base,vec3(.42,.40,.365),rim*titanium);
        base=mix(base,vec3(.18),rim*(1.0-titanium));
        float bright=max(rim*step(2.5,finish),accent);
        base=mix(base,vec3(.59),bright);
        vec3 light=normalize(vec3(-.62+tilt.x*.8,-.75+tilt.y*.8,1.35));
        float bevel=smoothstep(.89,.99,radius);
        vec3 normal=normalize(vec3(p*(.14+bevel*1.7),1.0));
        float diffuse=max(dot(normal,light),0.0);
        float reflection=exp(-pow((p.x*.62+p.y*.78+tilt.x*.55+tilt.y*.4+.35)*2.4,2.0));
        float brushing=sin(radius*circle.z*1.4);
        float grain=(noise(pixel*.18)-.5)*.005+brushing*.002;
        float edge=pow(smoothstep(.94,1.0,radius),2.0);
        float edgeLight=max(dot(normalize(vec3(p,0.0)),light),0.0);
        float down=pressed.x*(1.0-rim);
        if(layer>.5 && layer<1.5)down=pressed.y;
        if(layer>1.5 && layer<2.5)down=pressed.z;
        if(layer>3.5 && layer<4.5)down=pressed.w;
        if(layer>4.5)down=scrolling;
        vec3 metal=base*(.72+diffuse*.38)+vec3(reflection*(.11+bright*.08)+grain);
        metal+=vec3(bevel*pow(edgeLight,3.0)*.42);
        metal*=1.0-edge*.4-down*.12;
        // Contact shadows sit on the parent face, below each raised button.
        if(layer<.5 || rim>.5){
          float micShadow=1.0-smoothstep(0.0,10.0,distance(pixel,innerCircle.xy+vec2(0,5))-innerCircle.z);
          float leftShadow=1.0-smoothstep(0.0,8.0,distance(pixel,leftCircle.xy+vec2(0,4))-leftCircle.z);
          float scrollShadow=1.0-smoothstep(0.0,8.0,distance(pixel,scrollCircle.xy+vec2(0,4))-scrollCircle.z);
          metal*=1.0-max(micShadow,max(leftShadow,scrollShadow))*.55;
        }
        if(layer>.5 && layer<1.5){
          float rightShadow=1.0-smoothstep(0.0,8.0,distance(pixel,rightCircle.xy+vec2(0,4))-rightCircle.z);
          metal*=1.0-rightShadow*.55;
        }
        float alpha=1.0-smoothstep(.995,1.0,radius);
        gl_FragColor=vec4(metal*alpha,alpha);
        return;
      }
      float t=time+layer*3.7;
      float ripple=0.0;
      for(int i=0;i<4;i++){
        float age=time-ripples[i].z;
        float d=distance(pixel,ripples[i].xy)/max(circle.z,70.0);
        ripple+=sin(d*30.0-age*7.5)*exp(-d*2.1-age*1.5)*smoothstep(0.0,.16,age)*step(0.0,age);
      }
      vec3 deep=vec3(.014),liquidLight=vec3(.27),silver=vec3(.62);
      float held=mic*step(.5,layer)*(1.0-step(1.5,layer));
      liquidLight+=vec3(held*.10);silver+=vec3(held*.12);
      vec3 col;
      if(smoke>.5){
        vec2 q=p*1.7+tilt*.9;
        float turn=flow.x*.8; q=mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*q;
        vec2 drift=vec2(t*.075,-t*.11)+flow*.85;
        vec2 warp=vec2(fbm(q+drift),fbm(q-2.3-drift*.7));
        float cloud=fbm(q*2.1+warp*(3.0+activity*.6)+drift+vec2(ripple*.3,0));
        float folds=fbm(q*3.2+warp*4.5-drift*.45);
        float wisps=pow(clamp(1.0-abs(cloud-.52)*4.6,0.0,1.0),4.0);
        float mist=smoothstep(.32,.85,cloud)*.46+wisps*.28;
        col=deep+liquidLight*mist+silver*wisps*folds*.24;
      }else{
        vec2 q=p+tilt*.35+flow*.22;
        float surface=-.13+tilt.x*p.x*.65+tilt.y*.22;
        surface+=sin(p.x*3.8-t*.8)*(.042+length(tilt)*.15+activity*.065)+sin(p.x*8.0+t*.61)*.018+ripple*.035;
        float filled=smoothstep(surface-.012,surface+.018,p.y);
        float h=wave(q,t)+ripple*.038;
        vec2 grad=vec2(wave(q+vec2(.025,0),t)-h,wave(q+vec2(0,.025),t)-h)/.025;
        vec3 normal=normalize(vec3(-grad*.8,1.0));
        float shine=pow(max(dot(normal,normalize(vec3(-.6,-.8,1.7))),0.0),30.0);
        vec2 refract=q*3.7+grad*.24+vec2(t*.055,-t*.035);
        float caustic=pow(1.0-abs(sin(refract.x+sin(refract.y*1.4)))*abs(sin(refract.y-sin(refract.x*.8))),10.0);
        float contour=exp(-abs(p.y-surface)*120.0);
        col=mix(deep*.8,deep+liquidLight*(.16+caustic*.40)+silver*shine*.28,filled);
        col+=silver*contour*.48+liquidLight*(ripple*.075+scrolling*.045)*filled;
        col+=liquidLight*exp(-abs(p.y-surface-.06)*12.0)*.10;
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
    panel.innerHTML='<label for="dialSkin">Skin</label><select id="dialSkin"><option value="graphite">Graphite</option><option value="titanium">Titanium</option><option value="silver">Silver / Graphite</option><option value="glass">Original glass</option></select><div id="dialGlassOptions"><label for="dialMaterial">Under the glass</label><select id="dialMaterial"><option value="liquid">Liquid</option><option value="smoke">Smoke</option><option value="still">Still glass</option></select></div><p id="dialMaterialHint"></p>';
    menu.append(panel);
    const select=panel.querySelector('#dialMaterial'),skinSelect=panel.querySelector('#dialSkin'),hint=panel.querySelector('p');
    let saved = appearance();
    try { saved = appearance(JSON.parse(localStorage.getItem(STORAGE))); } catch {}
    let mode = saved.material, selectedSkin = saved.skin;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let gl,program,buffer,uniforms={},available=false,lost=false,frame=0,clock=0,last=0,lastDraw=0,quality=1,slow=0,geometry=null;
    let spring={x:0,y:0,xv:0,yv:0},target={x:0,y:0},ripples=Array.from({length:4},()=>[-1000,-1000,-100]),rippleIndex=0,lastTouch=0;
    let energy=0,energyTarget=0,flow={x:0,y:0},flowTarget={x:0,y:0};
    const activePointers=new Set();
    function setHint(){
      panel.querySelector('#dialGlassOptions').hidden = selectedSkin !== 'glass';
      if (selectedSkin !== 'glass') {
        hint.textContent = reduced.matches ? 'Reduce Motion keeps the metal lighting still.' : available ? 'Metal reflections follow your hand. Pressed controls sink slightly.' : 'Static metal lighting is active.';
      } else {
        hint.textContent=!available?'Glass lighting is active. Animated effects are unavailable in this browser.':mode==='still'?'Still reflections, with no continuous animation.':reduced.matches?'Reduce Motion is on; this material stays still.':mode==='smoke'?'Soft silver wisps respond to touch and tilt.':'Tilt to slosh. Touch the glass to send ripples through the liquid.';
      }
    }
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
        gl.useProgram(program);gl.disable(gl.DITHER);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
        const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
        for(const name of ['resolution','viewport','tilt','outerCircle','innerCircle','rightCircle','leftCircle','scrollCircle','finish','wheelRadius','pressed','time','smoke','still','mic','scrolling','flow','activity','ripples[0]'])uniforms[name]=gl.getUniformLocation(program,name);
        available=true;lost=false;root.classList.add('glass-ready');
      }catch{
        if(gl&&program)gl.deleteProgram(program);if(gl&&buffer)gl.deleteBuffer(buffer);
        available=false;root.classList.remove('glass-ready');
      }
      canvas.hidden=!available;setHint();wake();
    }
    function blocked(){
      return document.hidden||root.classList.contains('editing')||!menu.hidden||
        ['dialEditor','dialPresets','dialDictation','actionsPanel'].some(id=>!document.getElementById(id).hidden)||
        document.getElementById('drawer').classList.contains('open')||document.getElementById('startOverlay').style.display!=='none';
    }
    function animated(){return (selectedSkin!=='glass'||mode!=='still')&&!reduced.matches&&!blocked();}
    function paint(dt){
      if(!available||!geometry)return;
      const {g,w,h,scroll}=geometry,size=resolution(w,h,devicePixelRatio||1,quality);
      if(canvas.width!==size.width||canvas.height!==size.height){canvas.width=size.width;canvas.height=size.height;gl.viewport(0,0,canvas.width,canvas.height);}
      spring=advance(spring,animated()?target:{x:0,y:0},dt);
      energy+=(energyTarget-energy)*(1-Math.exp(-dt*7));energyTarget*=Math.exp(-dt*2);
      flow.x+=flowTarget.x*dt*.65;flow.y+=flowTarget.y*dt*.65;
      flowTarget.x*=Math.exp(-dt*3);flowTarget.y*=Math.exp(-dt*3);
      gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);gl.uniform2f(uniforms.viewport,w,h);
      gl.uniform3f(uniforms.outerCircle,g.cx,g.cy,g.clickR);gl.uniform3f(uniforms.innerCircle,g.mx,g.my,g.mr);gl.uniform3f(uniforms.rightCircle,g.rx,g.ry,g.rr);
      const left = g.left || {x:0,y:0,r:0}, scrollButton = g.scroll || {x:0,y:0,r:0};
      gl.uniform3f(uniforms.leftCircle,left.x,left.y,left.r);
      gl.uniform3f(uniforms.scrollCircle,scrollButton.x,scrollButton.y,scrollButton.r);
      gl.uniform1f(uniforms.wheelRadius,g.r);
      gl.uniform1f(uniforms.finish,{glass:0,graphite:1,titanium:2,silver:3}[selectedSkin]);
      const down = zone => root.querySelector('[data-zone="'+zone+'"].active') ? 1 : 0;
      gl.uniform4f(uniforms.pressed,down('outer'),down('inner'),down('right'),down('left'));
      gl.uniform2f(uniforms.tilt,spring.x,spring.y);gl.uniform2f(uniforms.flow,flow.x,flow.y);gl.uniform1f(uniforms.activity,energy);gl.uniform1f(uniforms.time,clock);
      gl.uniform1f(uniforms.smoke,mode==='smoke'?1:0);gl.uniform1f(uniforms.still,mode==='still'?1:0);gl.uniform1f(uniforms.scrolling,scroll?1:0);
      gl.uniform1f(uniforms.mic,root.querySelector('[data-zone="inner"].active')?1:0);
      gl.uniform3fv(uniforms['ripples[0]'],new Float32Array(ripples.flat()));
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,6);
    }
    function tick(now){
      frame=0;if(!available||lost||document.hidden)return;
      const elapsed=last?Math.min((now-last)/1000,.1):0;last=now;
      const live=animated();if(live)clock+=elapsed*(1+energy*.9);
      if(!lastDraw||now-lastDraw>=32||!live){
        if(live&&lastDraw&&now-lastDraw>80){if(++slow>12){quality=Math.max(.65,quality*.8);slow=0;}}else slow=0;
        const drawDelta=lastDraw?Math.min((now-lastDraw)/1000,.04):0;
        lastDraw=now;paint(live?drawDelta:0);
      }
      if(live)frame=requestAnimationFrame(tick);
    }
    function wake(){if(!frame&&available&&!lost&&!document.hidden){last=0;lastDraw=0;frame=requestAnimationFrame(tick);}}
    function cancel(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;activePointers.clear();target={x:0,y:0};flowTarget={x:0,y:0};energyTarget=0;}
    function disturb(e){
      if(!available||reduced.matches||(selectedSkin==='glass'&&mode==='still')||blocked())return;
      const b=root.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top;
      ripples[rippleIndex]=[x,y,clock];rippleIndex=(rippleIndex+1)%4;
      energyTarget=Math.max(energyTarget,.3);
      const impulse = selectedSkin==='glass' ? .8 : .08;
      spring.xv=clamp(spring.xv+(x/b.width-.5)*impulse,-2,2);spring.yv=clamp(spring.yv+impulse*.3,-2,2);wake();
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
      const sample=motionSample(e,screen.orientation?.angle||window.orientation||0);
      target=sample.tilt;
      spring.xv=clamp(spring.xv+sample.push.x*sample.dt*4,-2,2);
      spring.yv=clamp(spring.yv+sample.push.y*sample.dt*4,-2,2);
      energyTarget=Math.max(energyTarget,sample.energy);flowTarget=sample.push;
    },{passive:true});
    function applyAppearance() {
      select.value=mode;skinSelect.value=selectedSkin;
      root.dataset.material=mode;root.dataset.skin=selectedSkin;
      spring={x:0,y:0,xv:0,yv:0};energy=energyTarget=0;flow={x:0,y:0};flowTarget={x:0,y:0};
      ripples=Array.from({length:4},()=>[-1000,-1000,-100]);
      setHint();wake();
    }
    function saveAppearance() {
      try { localStorage.setItem(STORAGE,JSON.stringify({skin:selectedSkin,material:mode})); } catch {}
      applyAppearance();
      window.Dial?.refresh();
    }
    select.addEventListener('change',()=>{mode=material(select.value);saveAppearance();});
    skinSelect.addEventListener('change',()=>{selectedSkin=skin(skinSelect.value);saveAppearance();});
    applyAppearance();
    reduced.addEventListener('change',()=>{setHint();wake();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();else wake();});
    window.addEventListener('pagehide',cancel);window.addEventListener('pageshow',wake);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;available=false;cancel();root.classList.remove('glass-ready');canvas.hidden=true;setHint();});
    canvas.addEventListener('webglcontextrestored',init);
    const observer=new MutationObserver(wake);
    for(const el of [root,menu,...['dialEditor','dialPresets','dialDictation','actionsPanel','drawer','startOverlay'].map(id=>document.getElementById(id))].filter(Boolean))observer.observe(el,{attributes:true,attributeFilter:['class','hidden','style']});
    init();
    return {layout(g,w,h,scroll){geometry={g,w,h,scroll};wake();},wake};
  }
  const api={mount,material,skin,appearance,advance,resolution,motionSample};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.DialGlass=api;
})(typeof window==='undefined'?globalThis:window);
