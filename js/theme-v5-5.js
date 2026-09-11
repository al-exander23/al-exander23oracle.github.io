// ALX Oracle v5.5 — integrated real-time smoke scene.
// The approved transparent hero sits over one continuous room background.
// Smoke is drawn every frame; the stable #screen remains outside transformed layers.

const stage = document.getElementById('stage');
const orbWrap = document.getElementById('orbWrap');
const screen = document.getElementById('screen');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function canvas(className) {
  const el = document.createElement('canvas');
  el.className = `v55-smoke-canvas ${className}`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function buildBackdrop() {
  document.querySelectorAll('.v53-backdrop,.v53-ambient-smoke,.v54-backdrop').forEach((el) => el.remove());
  if (!stage || stage.querySelector('.v55-backdrop')) return;
  const wrap = document.createElement('div');
  wrap.className = 'v55-backdrop';
  wrap.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  img.src = 'assets/v5/ambient.webp?v=5.5.0';
  wrap.appendChild(img);
  stage.prepend(wrap);
}

const VS = `
attribute vec2 a_position;
void main(){ gl_Position=vec4(a_position,0.0,1.0); }
`;

const FS = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_energy;
uniform float u_alpha;
uniform float u_mode;

float h(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float n(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=h(i),b=h(i+vec2(1.,0.)),c=h(i+vec2(0.,1.)),d=h(i+vec2(1.,1.));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
float f(vec2 p){
  float v=0.,a=.5; mat2 r=mat2(.80,.60,-.60,.80);
  for(int i=0;i<5;i++){ v+=a*n(p); p=r*p*2.02+5.1; a*=.5; }
  return v;
}
vec2 w(vec2 p,float t){ return vec2(f(p+vec2(0.,t*.055)),f(p+vec2(4.7,-t*.041)))-.5; }

void main(){
  vec2 uv=gl_FragCoord.xy/u_resolution.xy;
  float t=u_time;
  float density=0.;
  float mask=1.;
  float light=0.;

  if(u_mode<.5){
    vec2 p=(uv-.5)*vec2(u_resolution.x/u_resolution.y,1.);
    vec2 q=w(p*1.65,t*.42);
    float a=f(p*2.05+q*1.35+vec2(t*.011,-t*.020));
    float b=f(p*3.8-q*.8+vec2(-t*.009,t*.016));
    density=smoothstep(.58,.82,a*.72+b*.28);
    mask=.52+.48*(1.-smoothstep(.22,.82,length((uv-.5)*vec2(.72,1.))));
    light=b;
  } else if(u_mode<1.5){
    vec2 p=(uv-.5)*vec2(u_resolution.x/u_resolution.y,1.);
    vec2 q=w(p*2.1,t*.56);
    float a=f(p*2.6+q*1.45+vec2(t*.016,-t*.028));
    float b=f(p*4.7-q*.85+vec2(-t*.013,t*.021));
    density=smoothstep(.57,.82,a*.72+b*.31);
    float title=1.-smoothstep(.08,.34,distance(uv,vec2(.50,.18)));
    float side=smoothstep(.16,.44,abs(uv.x-.5));
    float base=1.-smoothstep(.15,.42,distance(uv,vec2(.50,.78)));
    mask=clamp(.18+title*.52+side*.22+base*.18,0.,1.);
    light=b;
  } else {
    vec2 p=uv-.5;
    float r=length(p);
    float ang=atan(p.y,p.x);
    float speed=.42+u_energy*.30;
    float cs=cos(t*.040*speed),sn=sin(t*.040*speed);
    p=mat2(cs,-sn,sn,cs)*p;
    vec2 q1=w(p*4.6,t*speed);
    vec2 q2=w(p*7.0+q1*1.1,-t*.64*speed);
    float a=f(p*5.0+q1*1.45+vec2(t*.017*speed,-t*.029*speed));
    float b=f(p*8.0-q2*.85+vec2(-t*.020*speed,t*.017*speed));
    float swirl=.5+.5*sin(ang*2.5-t*.22*speed+r*14.0+a*2.0);
    density=smoothstep(.55,.80,a*.64+b*.24+swirl*.12);
    density=max(density,smoothstep(.60,.83,f(p*3.0+q2*1.2))*0.55);
    mask=1.-smoothstep(.43,.505,r);
    light=b+swirl*.12;
  }

  density*=mask;
  float alpha=density*u_alpha*(.72+u_energy*.20);
  vec3 deep=vec3(.10,.39,.61);
  vec3 ice=vec3(.79,.94,1.0);
  vec3 color=mix(deep,ice,clamp(light*.72+density*.28,0.,1.));
  gl_FragColor=vec4(color,clamp(alpha,0.,.56));
}`;

function shader(gl,type,source){
  const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const m=gl.getShaderInfoLog(s)||'shader error';gl.deleteShader(s);throw new Error(m)}
  return s;
}

class GLNoise {
  constructor(el,mode,alpha,dprCap){
    this.el=el;this.mode=mode;this.alpha=alpha;this.dprCap=dprCap;
    const gl=el.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,depth:false,stencil:false,powerPreference:'high-performance'});
    if(!gl) throw new Error('WebGL unavailable'); this.gl=gl;
    const p=gl.createProgram(); gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,VS)); gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,FS)); gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)||'link error'); this.p=p;
    const b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    this.ap=gl.getAttribLocation(p,'a_position'); this.ur=gl.getUniformLocation(p,'u_resolution'); this.ut=gl.getUniformLocation(p,'u_time'); this.ue=gl.getUniformLocation(p,'u_energy'); this.ua=gl.getUniformLocation(p,'u_alpha'); this.um=gl.getUniformLocation(p,'u_mode');
    gl.useProgram(p); gl.enableVertexAttribArray(this.ap); gl.vertexAttribPointer(this.ap,2,gl.FLOAT,false,0,0); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.clearColor(0,0,0,0);
    this.w=0;this.h=0;
  }
  resize(){
    const r=this.el.getBoundingClientRect(), d=Math.min(window.devicePixelRatio||1,this.dprCap), w=Math.max(2,Math.round(r.width*d)), h=Math.max(2,Math.round(r.height*d));
    if(w===this.w&&h===this.h)return;this.w=this.el.width=w;this.h=this.el.height=h;this.gl.viewport(0,0,w,h);
  }
  render(t,e){
    this.resize();const g=this.gl;g.useProgram(this.p);g.uniform2f(this.ur,this.el.width,this.el.height);g.uniform1f(this.ut,t);g.uniform1f(this.ue,e);g.uniform1f(this.ua,this.alpha);g.uniform1f(this.um,this.mode);g.clear(g.COLOR_BUFFER_BIT);g.drawArrays(g.TRIANGLES,0,6);
  }
}

class SmokeFallback {
  constructor(el,mode,alpha){this.el=el;this.mode=mode;this.alpha=alpha;this.ctx=el.getContext('2d');this.ps=Array.from({length:mode===2?20:26},()=>({x:Math.random(),y:Math.random(),r:.05+Math.random()*.10,vx:(Math.random()-.5)*.00018,vy:-.00016-Math.random()*.00025,p:Math.random()*6.28}))}
  resize(){const r=this.el.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,1.15),w=Math.max(2,Math.round(r.width*d)),h=Math.max(2,Math.round(r.height*d));if(this.el.width!==w||this.el.height!==h){this.el.width=w;this.el.height=h}}
  render(t,e){this.resize();const c=this.ctx,w=this.el.width,h=this.el.height;c.clearRect(0,0,w,h);c.globalCompositeOperation='lighter';for(const p of this.ps){const s=.65+e*.45;p.x+=p.vx*s*w*.016+Math.sin(t*.25+p.p)*.00022;p.y+=p.vy*s*h*.016;if(p.y<-.12){p.y=1.08;p.x=Math.random()}if(this.mode===2){const dx=p.x-.5,dy=p.y-.5;if(dx*dx+dy*dy>.23){p.x=.5+(Math.random()-.5)*.66;p.y=.5+(Math.random()-.5)*.66}}const rr=p.r*Math.min(w,h)*(1+Math.sin(t*.3+p.p)*.10),g=c.createRadialGradient(p.x*w,p.y*h,0,p.x*w,p.y*h,rr);g.addColorStop(0,`rgba(205,241,255,${.055*this.alpha})`);g.addColorStop(.42,`rgba(82,179,226,${.035*this.alpha})`);g.addColorStop(1,'rgba(20,80,120,0)');c.fillStyle=g;c.beginPath();c.arc(p.x*w,p.y*h,rr,0,Math.PI*2);c.fill()}c.globalCompositeOperation='source-over'}
}

function engine(el,mode,alpha,dpr){try{return new GLNoise(el,mode,alpha,dpr)}catch(err){console.warn('[ALX v5.5] WebGL fallback',err);return new SmokeFallback(el,mode,alpha)}}

function install(){
  if(!stage||!orbWrap)return[];
  document.querySelectorAll('.v54-smoke-canvas,.v53-ambient-smoke,.v53-hero-smoke,.v53-orb-interior,.v53-front-haze').forEach((el)=>el.remove());
  const scene=canvas('v55-scene-smoke');stage.prepend(scene);
  const hero=canvas('v55-hero-smoke');const heroImg=document.getElementById('v5HeroArt');if(heroImg?.nextSibling)orbWrap.insertBefore(hero,heroImg.nextSibling);else orbWrap.prepend(hero);
  const orb=canvas('v55-orb-smoke');if(screen)orbWrap.insertBefore(orb,screen);else orbWrap.appendChild(orb);
  return [engine(scene,0,.19,1.05),engine(hero,1,.18,1.15),engine(orb,2,.36,1.45)];
}

function phaseEnergy(){
  if(!orbWrap)return .34;
  if(orbWrap.classList.contains('thinking'))return .92;
  if(orbWrap.classList.contains('phase-phrase'))return .66;
  if(orbWrap.classList.contains('phase-reveal'))return .45;
  return .34;
}

buildBackdrop();
const engines=install();
let energy=.34,last=performance.now(),elapsed=0,frame=0;
function tick(now){
  const dt=Math.min(.05,(now-last)/1000||.016);last=now;elapsed+=dt;
  const target=phaseEnergy();energy+=(target-energy)*(1-Math.pow(.002,dt*.82));
  if(!document.hidden){engines.forEach((e,i)=>{if(i===2||frame%2===0)e.render(elapsed,i===2?energy:.34+(energy-.34)*.18)})}
  frame++;requestAnimationFrame(tick);
}
if(reduceMotion){engines.forEach((e,i)=>e.render(1.2,i===2?.30:.22))}else requestAnimationFrame(tick);
