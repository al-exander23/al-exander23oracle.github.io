// ALX Oracle v5.4 — real-time smoke engine.
// WebGL renders continuously moving smoke in the room, across the approved hero, and inside the glass sphere.
// Core oracle logic, SceneController and #screen ownership remain untouched.

const stage = document.getElementById('stage');
const orbWrap = document.getElementById('orbWrap');
const screen = document.getElementById('screen');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function makeCanvas(className) {
  const canvas = document.createElement('canvas');
  canvas.className = `v54-smoke-canvas ${className}`;
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

function buildBackdrop() {
  document.querySelectorAll('.v53-backdrop,.v53-ambient-smoke').forEach((el) => el.remove());
  if (!stage || stage.querySelector('.v54-backdrop')) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'v54-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');

  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  img.src = 'assets/v5/ambient.webp?v=5.4.0';
  backdrop.appendChild(img);
  stage.prepend(backdrop);
}

const VERTEX = `
attribute vec2 a_position;
void main(){
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_energy;
uniform float u_alpha;
uniform float u_mode;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash(i);
  float b = hash(i + vec2(1.0,0.0));
  float c = hash(i + vec2(0.0,1.0));
  float d = hash(i + vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

float fbm(vec2 p){
  float v = 0.0;
  float a = 0.52;
  mat2 r = mat2(0.80,0.60,-0.60,0.80);
  for(int i=0;i<5;i++){
    v += a * noise(p);
    p = r * p * 2.03 + 7.13;
    a *= 0.50;
  }
  return v;
}

vec2 warp(vec2 p, float t){
  float x = fbm(p + vec2(0.0, t*0.07));
  float y = fbm(p + vec2(5.2, -t*0.055));
  return vec2(x,y)-0.5;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time;
  float density = 0.0;
  float mask = 1.0;
  float bright = 0.0;

  if(u_mode < 0.5){
    // Whole-screen room haze: broad, slow, never blob-like.
    vec2 p = (uv - 0.5) * vec2(u_resolution.x/u_resolution.y, 1.0);
    vec2 w = warp(p*1.55, t*0.55);
    float a = fbm(p*2.15 + w*1.65 + vec2(t*0.018,-t*0.032));
    float b = fbm(p*4.40 - w*1.10 + vec2(-t*0.012,t*0.024));
    density = smoothstep(0.50,0.82,a*0.72+b*0.36);
    float edge = 1.0-smoothstep(0.12,0.82,length((uv-0.5)*vec2(0.72,1.0)));
    float vertical = (1.0-smoothstep(0.06,1.04,uv.y)) * 0.55 + 0.45;
    mask = mix(0.62,1.0,edge) * vertical;
    bright = b;
  } else if(u_mode < 1.5){
    // Smoke that lives over the approved reference art.
    vec2 p = (uv - 0.5) * vec2(u_resolution.x/u_resolution.y, 1.0);
    vec2 w = warp(p*2.05, t*0.75);
    float a = fbm(p*2.75 + w*1.75 + vec2(t*0.024,-t*0.045));
    float b = fbm(p*5.30 - w*0.92 + vec2(-t*0.020,t*0.032));
    density = smoothstep(0.48,0.81,a*0.73+b*0.39);
    float side = smoothstep(0.10,0.42,abs(uv.x-0.5));
    float title = 1.0-smoothstep(0.05,0.33,distance(uv,vec2(0.50,0.19)));
    float lower = 1.0-smoothstep(0.12,0.48,distance(uv,vec2(0.50,0.69)));
    mask = clamp(0.22 + side*0.44 + title*0.56 + lower*0.26,0.0,1.0);
    bright = b;
  } else {
    // Smoke inside the glass sphere: domain-warped, slowly rotating, phase-reactive.
    vec2 p = uv - 0.5;
    float r = length(p);
    float angle = atan(p.y,p.x);
    float speed = 0.45 + u_energy*0.42;
    float cs = cos(t*0.055*speed);
    float sn = sin(t*0.055*speed);
    p = mat2(cs,-sn,sn,cs) * p;

    vec2 w1 = warp(p*5.1, t*speed);
    vec2 w2 = warp(p*8.0 + w1*1.4, -t*0.72*speed);
    float n1 = fbm(p*5.7 + w1*1.65 + vec2(t*0.022*speed,-t*0.040*speed));
    float n2 = fbm(p*9.0 - w2*1.10 + vec2(-t*0.030*speed,t*0.025*speed));
    float spiral = 0.5 + 0.5*sin(angle*3.0 - t*0.33*speed + r*18.0 + n1*3.0);
    float ribbon = smoothstep(0.38,0.78,n1*0.60+n2*0.33+spiral*0.20);
    float core = smoothstep(0.40,0.76,fbm(p*3.3+w2*1.55+vec2(0.0,-t*0.035*speed)));
    density = max(ribbon,core*0.72);
    mask = 1.0-smoothstep(0.43,0.505,r);
    mask *= smoothstep(0.01,0.10,r+0.05);
    bright = n2 + spiral*0.25;
  }

  density *= mask;
  float alpha = density * u_alpha * (0.64 + u_energy*0.36);
  alpha *= smoothstep(0.02,0.22,density);

  vec3 cold = vec3(0.18,0.57,0.82);
  vec3 ice = vec3(0.88,0.97,1.0);
  vec3 color = mix(cold,ice,clamp(bright*0.88 + density*0.35,0.0,1.0));
  color *= 0.72 + density*0.48;

  gl_FragColor = vec4(color, clamp(alpha,0.0,0.92));
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'shader compile error';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

class SmokeGL {
  constructor(canvas, mode, alpha, dprCap = 1.5) {
    this.canvas = canvas;
    this.mode = mode;
    this.alpha = alpha;
    this.dprCap = dprCap;
    this.gl = canvas.getContext('webgl', {
      alpha:true,
      premultipliedAlpha:false,
      antialias:false,
      depth:false,
      stencil:false,
      preserveDrawingBuffer:false,
      powerPreference:'high-performance'
    });
    if (!this.gl) throw new Error('WebGL unavailable');

    const gl = this.gl;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'program link error');
    this.program = program;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);

    this.aPosition = gl.getAttribLocation(program,'a_position');
    this.uResolution = gl.getUniformLocation(program,'u_resolution');
    this.uTime = gl.getUniformLocation(program,'u_time');
    this.uEnergy = gl.getUniformLocation(program,'u_energy');
    this.uAlpha = gl.getUniformLocation(program,'u_alpha');
    this.uMode = gl.getUniformLocation(program,'u_mode');
    gl.useProgram(program);
    gl.enableVertexAttribArray(this.aPosition);
    gl.vertexAttribPointer(this.aPosition,2,gl.FLOAT,false,0,0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0,0,0,0);

    this.lastW = 0;
    this.lastH = 0;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    const width = Math.max(2, Math.round(rect.width*dpr));
    const height = Math.max(2, Math.round(rect.height*dpr));
    if (width === this.lastW && height === this.lastH) return;
    this.lastW = this.canvas.width = width;
    this.lastH = this.canvas.height = height;
    this.gl.viewport(0,0,width,height);
  }

  render(time, energy) {
    this.resize();
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform2f(this.uResolution,this.canvas.width,this.canvas.height);
    gl.uniform1f(this.uTime,time);
    gl.uniform1f(this.uEnergy,energy);
    gl.uniform1f(this.uAlpha,this.alpha);
    gl.uniform1f(this.uMode,this.mode);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES,0,6);
  }
}

class Smoke2D {
  constructor(canvas, mode, alpha) {
    this.canvas = canvas;
    this.mode = mode;
    this.alpha = alpha;
    this.ctx = canvas.getContext('2d');
    const count = mode === 2 ? 30 : mode === 1 ? 36 : 40;
    this.particles = Array.from({length:count},(_,i)=>({
      x:Math.random(), y:Math.random(), r:.035+Math.random()*.11,
      vx:(Math.random()-.5)*.00025, vy:-(.00018+Math.random()*.00038),
      phase:Math.random()*Math.PI*2, seed:i*1.37
    }));
  }
  resize(){
    const rect=this.canvas.getBoundingClientRect();
    const dpr=Math.min(window.devicePixelRatio||1,1.25);
    const w=Math.max(2,Math.round(rect.width*dpr)),h=Math.max(2,Math.round(rect.height*dpr));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}
  }
  render(time,energy){
    this.resize();
    const c=this.ctx,w=this.canvas.width,h=this.canvas.height;
    c.clearRect(0,0,w,h);c.globalCompositeOperation='lighter';
    for(const p of this.particles){
      const speed=.65+energy*.65;
      p.x+=p.vx*speed*w*.016+Math.sin(time*.33+p.phase)*.00042;
      p.y+=p.vy*speed*h*.016;
      if(p.y<-.15){p.y=1.12;p.x=Math.random()}
      if(p.x<-.15)p.x=1.12;if(p.x>1.15)p.x=-.12;
      if(this.mode===2){
        const dx=p.x-.5,dy=p.y-.5;if(dx*dx+dy*dy>.24){p.x=.5+(Math.random()-.5)*.7;p.y=.5+(Math.random()-.5)*.7}
      }
      const rr=p.r*Math.min(w,h)*(1+Math.sin(time*.45+p.seed)*.16);
      const g=c.createRadialGradient(p.x*w,p.y*h,0,p.x*w,p.y*h,rr);
      g.addColorStop(0,`rgba(215,246,255,${.12*this.alpha*(.7+energy*.3)})`);
      g.addColorStop(.38,`rgba(93,190,239,${.085*this.alpha})`);
      g.addColorStop(1,'rgba(35,105,160,0)');
      c.fillStyle=g;c.beginPath();c.arc(p.x*w,p.y*h,rr,0,Math.PI*2);c.fill();
    }
    c.globalCompositeOperation='source-over';
  }
}

function makeEngine(canvas, mode, alpha, dprCap) {
  try { return new SmokeGL(canvas, mode, alpha, dprCap); }
  catch (error) {
    console.warn('[ALX v5.4] WebGL smoke unavailable; using animated 2D fallback:', error);
    return new Smoke2D(canvas, mode, alpha);
  }
}

function installCanvases() {
  if (!stage || !orbWrap) return [];
  document.querySelectorAll('.v53-ambient-smoke,.v53-hero-smoke,.v53-orb-interior,.v53-front-haze').forEach((el)=>el.remove());

  const scene = makeCanvas('v54-scene-smoke');
  stage.prepend(scene);

  const hero = makeCanvas('v54-hero-smoke');
  const heroImage = document.getElementById('v5HeroArt');
  if (heroImage?.nextSibling) orbWrap.insertBefore(hero, heroImage.nextSibling);
  else orbWrap.prepend(hero);

  const orb = makeCanvas('v54-orb-smoke');
  if (screen) orbWrap.insertBefore(orb, screen);
  else orbWrap.appendChild(orb);

  const touch = document.createElement('div');
  touch.className = 'v54-touch-ring';
  touch.setAttribute('aria-hidden','true');
  orbWrap.appendChild(touch);

  return [
    makeEngine(scene,0,0.42,1.1),
    makeEngine(hero,1,0.46,1.25),
    makeEngine(orb,2,0.84,1.65)
  ];
}

function installTouch() {
  if (!orbWrap) return;
  let timer = 0;
  orbWrap.addEventListener('pointerdown',()=>{
    orbWrap.classList.remove('v54-touch');
    void orbWrap.offsetWidth;
    orbWrap.classList.add('v54-touch');
    clearTimeout(timer);
    timer=setTimeout(()=>orbWrap.classList.remove('v54-touch'),740);
  },{passive:true});
}

function phaseTarget() {
  if (!orbWrap) return .45;
  if (orbWrap.classList.contains('thinking')) return 1.18;
  if (orbWrap.classList.contains('phase-phrase')) return .78;
  if (orbWrap.classList.contains('phase-reveal')) return .56;
  return .46;
}

buildBackdrop();
const engines = installCanvases();
installTouch();

document.documentElement.classList.add('v54-live-smoke');

let energy=.46;
let last=performance.now();
let elapsed=0;
let frame=0;

function animate(now){
  const dt=Math.min(.05,(now-last)/1000||.016);
  last=now;
  elapsed+=dt;
  const target=phaseTarget();
  energy += (target-energy)*(1-Math.pow(.001,dt*1.15));

  if (!document.hidden) {
    // Orb remains fluid. Larger ambient canvases render at 30fps to keep iPhone WebView smooth.
    engines.forEach((engine,index)=>{
      if(index===2 || frame%2===0) engine.render(elapsed, index===2 ? energy : .46 + (energy-.46)*.34);
    });
  }
  frame++;
  requestAnimationFrame(animate);
}

if (reduceMotion) {
  engines.forEach((engine,index)=>engine.render(1.25,index===2?.46:.38));
} else {
  requestAnimationFrame(animate);
}
