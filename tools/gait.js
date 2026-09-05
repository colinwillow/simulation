// How the wanderer moves: the acceleration ramp, the cost of a hill, and whether he can get
// on top of a rock. All three were reported by feel -- "he really wants to run", "a steep
// hill should slow you down", "you should be able to walk over rocks" -- so all three get a
// number here rather than a look.
//
//   node tools/gait.js index.html
const THREE = require('three');
THREE.WebGLRenderer = class { constructor(){ this.domElement={addEventListener(){},style:{}}; this.shadowMap={}; this.info={render:{calls:0,triangles:0},reset(){},autoReset:true}; this.capabilities={getMaxAnisotropy:()=>1,isWebGL2:false}; } setPixelRatio(){} setSize(){} render(){} clear(){} setRenderTarget(){} getContext(){return {getExtension:()=>null};} };
THREE.CanvasTexture = class extends THREE.Texture {};
global.THREE = THREE; global.devicePixelRatio=1; global.innerWidth=1280; global.innerHeight=800;
global.matchMedia=()=>({matches:false});
const els={};
global.document={ createElement(t){ if(t==='canvas') return {width:0,height:0,getContext(){return {createRadialGradient(){return {addColorStop(){}}},fillRect(){},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},putImageData(){}}}};
  const d={children:[],style:{},addEventListener(){},classList:{toggle(){},add(){},remove(){}},querySelector(){return this.__k||(this.__k=global.document.createElement('div'))},getBoundingClientRect(){return {left:0,top:0,width:132,height:132}},setPointerCapture(){},appendChild(c){this.children.push(c);c.parent=this},removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1)},remove(){if(this.parent)this.parent.removeChild(this)},get firstChild(){return this.children[0]},set textContent(v){},set innerHTML(v){}}; return d;},
  // three's TextureLoader goes through createElementNS for its <img>, and an img it can
  // never load is fine here: nothing headless samples a texture.
  createElementNS(ns, t){ if(t==='img') return {addEventListener(){},removeEventListener(){},style:{},set src(v){},get src(){return '';}}; return this.createElement(t); },
  getElementById(id){ return els[id]||(els[id]=this.createElement('div')); }, body:{appendChild(){}} };
let cbs=[]; global.requestAnimationFrame=f=>cbs.push(f); global.addEventListener=()=>{}; global.setInterval=()=>{}; global.setTimeout=()=>{};
global.window=global; global.__t=0; global.performance={now:()=>global.__t};
const fs=require('fs');
const html=fs.readFileSync(process.argv[2]||'index.html','utf8');
const block=html.match(/<script>([\s\S]*?)<\/script>/g).find(b=>b.includes('const BUILD'));
let src=block.replace(/^<script>/,'').replace(/<\/script>$/,'');
const cut=src.lastIndexOf('})();');
src=src.slice(0,cut)+'global.__w=world;global.__p=player;global.__stick=stick;global.__h=height;global.__gY=groundY;global.__MOVE=MOVE;global.__OBP=OB_PLAYER;global.__OB=OB;global.__obRad=obRad;global.__obAdd=obAdd;global.__standOn=standOn;global.__slope=slope;global.__WAY=WAY;global.__obClear=obClear;global.__obNear=obNear;global.__setWay=setWaypoint;global.__cam=cam;'+src.slice(cut);
eval(src);
const P=global.__p, ST=global.__stick, H=global.__h, gY=global.__gY, M=global.__MOVE, W=global.__w;
const step=()=>{ const f=cbs.shift(); global.__t+=33; f(global.__t); };
const hold=(sec,fn)=>{ const n=Math.round(sec/.033); for(let i=0;i<n;i++){ fn&&fn(); step(); } };
const sp=()=>Math.hypot(P.vx,P.vz);
for(let i=0;i<40;i++) step();           // let the world settle and the ground find him

// ---------- 1. the ramp ----------
// Find flat ground, point him along it, hold the stick and time the milestones.
function flatSpot(){ for(let i=0;i<4000;i++){ const x=(Math.random()-.5)*260, z=(Math.random()-.5)*260;
  if(H(x,z)>2 && H(x,z)<11 && global.__slope(x,z)<.06) return {x,z}; } return {x:0,z:0}; }
function ramp(dirName, place){
  const q=place(); P.pos.set(q.x, gY(q.x,q.z), q.z); P.vx=P.vz=0; P.vy=0; P.grounded=1; P.gy=P.pos.y;
  global.__cam.tgt.set(q.x,P.pos.y,q.z); hold(.4,()=>{ST.L.x=0;ST.L.y=0;});
  const marks=[['firstStep',2.5],['walking',6],['jogging',10],['running',14]], out={}; let t=0, top=0, dz0=P.pos.z;
  hold(4.5,()=>{ ST.L.y=-1; ST.L.x=0; t+=.033; top=Math.max(top,sp());
    for(const [n,m] of marks) if(out[n]===undefined && sp()>=m) out[n]=+t.toFixed(2); });
  ST.L.y=0; out.topSpeed=+top.toFixed(1); out.grade=dirName;
  const t0=t; hold(2,()=>{ t+=.033; }); out.stoppedAfter=+(sp()<.5?'':'').length?0:+sp().toFixed(1);
  return out;
}
const flat=ramp('flat', flatSpot);
console.log('acceleration on the flat  ', JSON.stringify(flat));

// ---------- 1b. turning at speed ----------
// The thing that reads as skating. Get him to full speed in one direction, then ask for a
// new one and time how long the velocity takes to point there. Pinned in place, because
// what is under test is the velocity vector and not the ground he covers reaching it.
function turnTest(deg){
  const q=flatSpot(); P.pos.set(q.x,gY(q.x,q.z),q.z); P.vx=P.vz=0; P.vy=0; P.grounded=1; P.gy=P.pos.y;
  global.__cam.tgt.set(q.x,P.pos.y,q.z);
  hold(3,()=>{ P.pos.set(q.x,gY(q.x,q.z),q.z); P.vy=0; P.grounded=1; P.wx=0; P.wz=1; P.wmag=1; P.moving=1; });
  const v0=sp(), a=deg*Math.PI/180, nx=Math.sin(a), nz=Math.cos(a);
  let t=0, done=null, minSp=v0;
  hold(6,()=>{ P.pos.set(q.x,gY(q.x,q.z),q.z); P.vy=0; P.grounded=1; P.wx=nx; P.wz=nz; P.wmag=1; P.moving=1;
    t+=.033; minSp=Math.min(minSp,sp());
    const s2=sp(); if(done===null && s2>.3){ const cur=Math.atan2(P.vx,P.vz);
      let d=cur-a; d=Math.atan2(Math.sin(d),Math.cos(d));
      if(Math.abs(d)<0.09) done=t; } });     // within five degrees of the new heading
  return {turn:deg+'deg', enteredAt:+v0.toFixed(1), pointingThereAfter:done===null?'never':+done.toFixed(2),
    slowestDuring:+minSp.toFixed(1), endedAt:+sp().toFixed(1)};
}
for(const d of [90,135,180]) console.log('turning at speed         ', JSON.stringify(turnTest(d)));

// ---------- 2. the hill ----------
// Same stick, held straight up a slope and then straight down the same slope.
function slopeSpot(minS){ for(let i=0;i<20000;i++){ const x=(Math.random()-.5)*260, z=(Math.random()-.5)*260;
  const s=global.__slope(x,z); if(H(x,z)>3 && H(x,z)<24 && s>minS && s<minS+.12) return {x,z,s}; } return null; }
// Pinned in place. Turned loose he covers fifteen units in the time it takes to reach top
// speed, which is well off the patch whose gradient was measured -- the first run of this
// reported a 43-degree face as *less* costly than a 30-degree one, purely because he had
// run off the steep part of it. The speed cap depends on where he is and which way he
// wants to go, and neither of those needs him to actually travel.
function uphill(minS){
  const q=slopeSpot(minS); if(!q) return null;
  const e=1.5, gx=(H(q.x+e,q.z)-H(q.x-e,q.z))/(2*e), gz=(H(q.x,q.z+e)-H(q.x,q.z-e))/(2*e);
  const gl=Math.hypot(gx,gz)||1, ux=gx/gl, uz=gz/gl;
  const go=(sx,sz)=>{
    P.pos.set(q.x,gY(q.x,q.z),q.z); P.vx=P.vz=0; P.vy=0; P.grounded=1; P.gy=P.pos.y;
    global.__cam.tgt.set(q.x,P.pos.y,q.z);
    let last=0;
    hold(3,()=>{ P.pos.set(q.x,gY(q.x,q.z),q.z); P.vy=0; P.grounded=1;   // hold him on the spot
      P.wx=sx; P.wz=sz; P.wmag=1; P.moving=1; last=sp(); });
    return +last.toFixed(1);
  };
  const up=go(ux,uz), down=go(-ux,-uz);
  // The grade the GAME reads, not the one the probe sampled: a forward difference along the
  // way he is walking, at the same reach the movement code uses. A central difference over
  // three units across hummocky ground is a different number, and reporting that one made
  // the results look inconsistent when they were not.
  const e2=1.1, seen=(H(q.x+ux*e2,q.z+uz*e2)-H(q.x,q.z))/e2;
  return {sampledGradient:+gl.toFixed(2), gradeTheGameReads:+seen.toFixed(2),
    degrees:+(Math.atan(seen)*57.3).toFixed(0), upSpeed:up, downSpeed:down,
    fractionOfFlat:+(up/M.max).toFixed(2), predicted:+Math.max(M.hillMin, 1-seen*M.hill).toFixed(2)};
}
for(const s of [.25,.55,.9]) { const r=uphill(s); if(r) console.log('walking a slope          ', JSON.stringify(r)); }

// ---------- 3. rocks ----------
// Plant a boulder of a known height in front of him and charge it. Does he stop dead at its
// edge, or end up standing on top of it?
// A clear, flat, level patch: flatSpot alone put the first run of this down beside a real
// tree, so he stopped six units short of a rock he never reached and the probe called it a
// wall. And he has to be stopped when he arrives -- at seventeen units a second, four
// seconds of charging carries him sixty-eight units clean past a rock nine units away.
// Fourteen units clear of everything does not exist on an island with a hundred and
// twenty trees on it; six does, and six is all the approach lane needs.
function clearFlat(){ for(let i=0;i<40000;i++){ const x=(Math.random()-.5)*260, z=(Math.random()-.5)*260;
  if(H(x,z)>2 && H(x,z)<11 && global.__slope(x,z)<.07 && global.__obClear(x,z,6) && global.__obClear(x,z-6,3)) return {x,z}; } return null; }
function charge(topAbove){
  const q=clearFlat(); if(!q) return {rockTop:topAbove, error:'no clear flat ground found'};
  const g=gY(q.x,q.z);
  const ob=global.__obAdd(q.x, q.z, 1.6, null, g+topAbove);
  P.pos.set(q.x, g, q.z-6); P.vx=P.vz=0; P.vy=0; P.grounded=1; P.gy=g;
  global.__cam.tgt.set(P.pos.x,P.pos.y,P.pos.z); hold(.3,()=>{P.wmag=0;});
  let nearest=1e9, riseInside=-1e9, everInside=false, t=0;
  const n=Math.round(4/.033);
  for(let i=0;i<n;i++){
    P.wx=0; P.wz=1; P.wmag=1; P.moving=1; step(); t+=.033;
    const d=Math.hypot(P.pos.x-q.x,P.pos.z-q.z);
    nearest=Math.min(nearest,d);
    if(d < 1.6){ everInside=true; riseInside=Math.max(riseInside,P.pos.y-g); }
    if(d < .6 || P.pos.z > q.z + 2) break;      // arrived, or over and past it
  }
  P.vx=P.vz=0; P.wmag=0;
  for(const k of ob._cells){ const a=global.__OB.map.get(k); const i=a.indexOf(ob); if(i>=0) a.splice(i,1); }
  return {rockTop:+topAbove.toFixed(1), closestApproach:+nearest.toFixed(1),
    reachedTheFootprint:everInside, roseTo:everInside?+riseInside.toFixed(2):0,
    stoodOnIt:everInside && riseInside>topAbove-.4};
}
for(const h of [0.8, 1.2, 2.4]) console.log('charging a rock          ', JSON.stringify(charge(h)));

// ---------- 4. the waypoint trail ----------
const WY=global.__WAY;
for(const dist of [14, 45, 120]){
  P.pos.set(0,gY(0,0),0); global.__setWay({x:0,z:dist}); hold(.4);
  const a=WY.trail.geometry.attributes.position, n=WY.trail.geometry.drawRange.count;
  let gaps=[]; for(let i=1;i<n;i++) gaps.push(Math.hypot(a.array[i*3]-a.array[(i-1)*3], a.array[i*3+1]-a.array[(i-1)*3+1], a.array[i*3+2]-a.array[(i-1)*3+2]));
  gaps.sort((x,y)=>x-y);
  console.log('waypoint trail           ', JSON.stringify({distance:dist, dots:n, medianGap:+(gaps[gaps.length>>1]||0).toFixed(2)}));
}
global.__setWay(null);
process.exit(0);
