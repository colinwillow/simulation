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
  getElementById(id){ return els[id]||(els[id]=this.createElement('div')); }, body:{appendChild(){},classList:{add(){},remove(){},toggle(){}}} };
let cbs=[]; global.requestAnimationFrame=f=>cbs.push(f); global.addEventListener=()=>{}; global.setInterval=()=>{}; global.setTimeout=()=>{};
global.window=global; global.__t=0; global.performance={now:()=>global.__t};
const fs=require('fs');
const html=fs.readFileSync(process.argv[2]||'index.html','utf8');
const block=html.match(/<script>([\s\S]*?)<\/script>/g).find(b=>b.includes('const BUILD'));
let src=block.replace(/^<script>/,'').replace(/<\/script>$/,'');
const cut=src.lastIndexOf('})();');
src=src.slice(0,cut)+'global.__w=world;global.__INTRO=INTRO;global.__W=W;global.__waveY=waveY;global.__SEA=SEA;global.__p=player;global.__stick=stick;global.__h=height;global.__gY=groundY;global.__MOVE=MOVE;global.__OBP=OB_PLAYER;global.__OB=OB;global.__obRad=obRad;global.__obAdd=obAdd;global.__standOn=standOn;global.__slope=slope;global.__WAY=WAY;global.__obClear=obClear;global.__obNear=obNear;global.__setWay=setWaypoint;global.__cam=cam;global.__camS=camS;global.__deckY=deckY;'+src.slice(cut);
eval(src);
// The title screen parks the camera out at the planet and flies the ship round it. That is
// the first thing a player sees and the last thing a harness wants: every tool here measures
// the game being played, so each of them starts it.
global.__INTRO.on = false;
const P=global.__p, ST=global.__stick, H=global.__h, gY=global.__gY, M=global.__MOVE, W=global.__w;
const step=()=>{ const f=cbs.shift(); global.__t+=33; f(global.__t); };
const hold=(sec,fn)=>{ const n=Math.round(sec/.033); for(let i=0;i<n;i++){ fn&&fn(); step(); } };
const sp=()=>Math.hypot(P.vx,P.vz);
for(let i=0;i<40;i++) step();           // let the world settle and the ground find him

// ---------- 1. the ramp ----------
// Find flat ground, point him along it, hold the stick and time the milestones.
// Flat where he is standing *and* flat everywhere he might be pushed to. Sampling the one
// point was enough on a small island; on a bigger one with more relief it started handing
// back spots on a gentle slope, and the turn test read "never" because his top speed was
// being cut by the hill factor rather than by anything to do with turning.
function flatSpot(){
  const R = 260 * (global.__W / 240);
  for(let i=0;i<20000;i++){ const x=(Math.random()-.5)*R, z=(Math.random()-.5)*R;
    const h=H(x,z); if(h<=2 || h>=11 || global.__slope(x,z)>=.035) continue;
    let ok=true;
    for(let a=0;a<6 && ok;a++){ const t=a/6*Math.PI*2;
      if(global.__slope(x+Math.cos(t)*9, z+Math.sin(t)*9) > .07) ok=false; }
    if(ok) return {x,z};
  }
  return {x:0,z:0}; }
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

// ---------- 5. standing still on the beach ----------
// He rode the swell while stood on dry sand: the dry-land floor was max(ground, waveY), and
// on a beach a foot above sea level every crest that came in higher than it lifted him. Pin
// him, hold no stick, and measure how far he moves up and down over four seconds. Land
// should be flat; only water should bob.
function standTest(name, pick) {
  const q = pick(); if (!q) return console.log('standing still            ', name, 'nowhere to try it');
  P.pos.set(q.x, gY(q.x, q.z), q.z); P.vx = P.vz = P.vy = 0; P.grounded = 1; P.gy = P.pos.y; P.swim = 0;
  global.__cam.tgt.set(q.x, P.pos.y, q.z);
  hold(2, () => { ST.L.x = 0; ST.L.y = 0; P.pos.x = q.x; P.pos.z = q.z; });   // let gy settle
  let lo = 1e9, hi = -1e9;
  hold(4, () => { ST.L.x = 0; ST.L.y = 0; P.pos.x = q.x; P.pos.z = q.z;
    lo = Math.min(lo, P.pos.y); hi = Math.max(hi, P.pos.y); });
  const swell = (() => { let a = 1e9, b = -1e9;
    for (let i = 0; i < 60; i++) { const y = global.__waveY(q.x, q.z); a = Math.min(a, y); b = Math.max(b, y); step(); }
    return b - a; })();
  console.log('standing still            ', JSON.stringify({ where: name,
    groundAboveSea: +(H(q.x, q.z) - global.__SEA).toFixed(2),
    bobbed: +(hi - lo).toFixed(2), swellHereIs: +swell.toFixed(2), swimming: +P.swim.toFixed(2) }));
}
// Right at the waterline, and the flattest, lowest dry sand it can find -- that is where the
// swell used to reach over the ground and pick him up, and it is where he stands to look at
// the sea. A spot a metre and a half up would have hidden it.
standTest('waterline', () => { let best = null, bh = 1e9;
  for (let i = 0; i < 90000; i++) { const x = (Math.random() - .5) * 300, z = (Math.random() - .5) * 300;
    const h = H(x, z); if (h > global.__SEA + .05 && h < bh && global.__slope(x, z) < .4) { bh = h; best = { x, z }; } }
  return best; });
standTest('inland', () => { for (let i = 0; i < 60000; i++) { const x = (Math.random() - .5) * 260, z = (Math.random() - .5) * 260;
  const h = H(x, z); if (h > 6 && h < 12 && global.__slope(x, z) < .2) return { x, z }; } return null; });
standTest('deep water', () => { for (let i = 0; i < 60000; i++) { const x = (Math.random() - .5) * 320, z = (Math.random() - .5) * 320;
  if (H(x, z) < global.__SEA - 6) return { x, z }; } return null; });

// ---------- 5b. the lander ----------
// It is the one place you come back to, so it gets checked like one: did it get set down, can
// he get in under the hull from every side, and is the shot from under there a shot of him.
(() => {
  const V = W.lander;
  if (!V) return console.log('the lander                 not set down');
  // `C`, `CS` and `lens()` belong to the camera section below this one, and a const declared
  // below is not a const you can read from above.
  const C = global.__cam, CS = global.__camS;
  const lens = () => {
    const sx = Math.sin(C.az) * Math.sin(CS.pol) * CS.r, sz = Math.cos(C.az) * Math.sin(CS.pol) * CS.r;
    return { x: C.tgt.x + sx, y: CS.y, z: C.tgt.z + sz };
  };
  const R = 22, dz = [];
  // Walk him at the gate from outside and see how far in he gets. The gateway faces local
  // -z of the site, which is yaw-dependent, so try every heading and take the best.
  let best = { got: 1e9, a: 0 };
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const sx = V.pos.x + Math.sin(a) * (R + 16), sz = V.pos.z + Math.cos(a) * (R + 16);
    P.pos.set(sx, gY(sx, sz), sz); P.vx = P.vz = P.vy = 0; P.grounded = 1; P.gy = P.pos.y; P.swim = 0;
    C.tgt.set(sx, P.pos.y + 3.4, sz);
    hold(.3, () => { ST.L.x = ST.L.y = 0; });
    const ux = -Math.sin(a), uz = -Math.cos(a);
    hold(5, () => { P.wx = ux; P.wz = uz; P.wmag = 1; P.moving = 1; });
    P.wmag = 0;
    const d = Math.hypot(P.pos.x - V.pos.x, P.pos.z - V.pos.z);
    if (d < best.got) best = { got: d, a: Math.round(a * 57.3), onDeck: P.pos.y - V.pos.y };
  }
  // And the shot from under the hull. There are no walls now, so the only thing to check is
  // that the lens does not end up buried in the belly: it should stay under it, or outside.
  P.pos.set(V.pos.x, gY(V.pos.x, V.pos.z) + 2, V.pos.z); P.vx = P.vz = P.vy = 0; P.grounded = 1; P.gy = P.pos.y;
  C.tgt.set(V.pos.x, P.pos.y + 3.4, V.pos.z); C.r = 20;
  let worstOut = 0, worstLow = 0;
  for (let i = 0; i < 12; i++) {
    C.az = i / 12 * Math.PI * 2;
    hold(1.6, () => { ST.L.x = ST.L.y = 0; P.pos.set(V.pos.x, gY(V.pos.x, V.pos.z) + 2, V.pos.z); P.grounded = 1; });
    const L = lens(), out = Math.hypot(L.x - V.pos.x, L.z - V.pos.z);
    worstOut = Math.max(worstOut, out);
    // Buried = the lens is inside the solid hull. The belly is a funnel, not a flat plate:
    // its apex is at 12.6 in the middle and it rises to the rim, so the headroom under it
    // depends on how far out you are. Comparing against the apex alone called the edge of
    // the pad a burial.
    const under = 12.6 + 3.6 * Math.min(1, out / (17 * .92));
    if (out < 17) worstLow = Math.max(worstLow, L.y - (V.pos.y + under));
  }
  console.log('the lander                ', JSON.stringify({ standingUnderIt: 'boom 20, all round',
    hullRimIsAt: 17, bellyIsAt: 12.6, lensReachedOutTo: +worstOut.toFixed(1),
    deepestIntoTheBelly: +Math.max(0, worstLow).toFixed(1) }));

  console.log('the lander                ', JSON.stringify({ at: [V.pos.x | 0, V.pos.z | 0],
    colliders: V.obs.length,
    walkedInToWithin: +best.got.toFixed(1) + ' of the lift',
    fromBearing: best.a + ' deg', endedThisFarAboveTheSiteBase: +best.onDeck.toFixed(2) }));
})();

// ---------- 5b2. the title's island ----------
// It is built at boot and nothing in the game touches it again, so the only way a mistake in
// it shows up is on the title screen -- which is exactly where a mistake is most expensive.
// A ReferenceError in its constructor took the whole of populate() with it and the only
// symptom was a screenshot that had not changed.
(() => {
  const I = W.titleIsle, T = W.titleAt;
  if (!I || !T) return console.log('the title isle             NOT BUILT');
  console.log('the title isle            ', JSON.stringify({
    at: [I.pos.x | 0, I.pos.z | 0], floatingAt: I.alt, across: I.R * 2,
    plaqueSits: T.y - I.alt + ' above its deck',
    theFallLandsOn: +global.__gY(I.pos.x, I.pos.z).toFixed(1),
    plaqueLoaded: !!W.title }));
})();

// ---------- 5c. getting hit ----------
// Nothing here kills an animal; a hit throws it and it gets up. Three things to prove: it
// travelled, it came down somewhere it can actually stand, and it got back on its feet.
(() => {
  const cs = W.creatures.filter(o => o.alive && !o.aquatic && !o.flying && o.rad < 2);
  if (!cs.length) return console.log('knockback                  no land creature to try it on');
  for (const c of [cs[0], cs[cs.length - 1]]) {
    const x0 = c.pos.x, z0 = c.pos.z;
    c.knock({ x: x0 - 1, z: z0 }, 1);
    let peak = 0, t = 0, upAgain = null;
    hold(6, () => { t += .033;
      peak = Math.max(peak, c.pos.y - gY(c.pos.x, c.pos.z));
      if (upAgain === null && !c.fling && t > .1) upAgain = t; });
    console.log('knockback                 ', JSON.stringify({ who: c.constructor.name, itsSize: c.rad,
      threwIt: +Math.hypot(c.pos.x - x0, c.pos.z - z0).toFixed(1) + ' units',
      peakedAt: +peak.toFixed(1) + ' off the ground',
      backOnItsFeetAfter: upAgain === null ? 'STILL DOWN' : +upAgain.toFixed(1) + ' s',
      stillAlive: c.alive, landedSomewhereItCanStand: c.terrainOK(c.pos.x, c.pos.z) }));
  }
})();

// ---------- 6. the camera ----------
// "It cuts through the mountain, it doesn't go up, it doesn't rotate." Three claims, three
// numbers. Runs against any build -- it only reads cam, camS and the height field -- so the
// old one can be measured the same way: node tools/gait.js /tmp/old-index.html
const C = global.__cam, CS = global.__camS, dY = global.__deckY;
function lens() {
  const sx = Math.sin(C.az) * Math.sin(CS.pol) * CS.r, sz = Math.cos(C.az) * Math.sin(CS.pol) * CS.r;
  return { x: C.tgt.x + sx, y: CS.y, z: C.tgt.z + sz };
}
// Walk him across real relief and watch the lens: how close it comes to being inside the
// hill, and how violently it moves to stay out. A jolt is the frame-to-frame change in the
// lens height, quoted per second, so it does not depend on the step size.
function camRun(name, pick, secs = 5) {
  const q = pick(); if (!q) return console.log('camera                    ', name, 'nowhere to try it');
  P.pos.set(q.x, gY(q.x, q.z), q.z); P.vx = P.vz = P.vy = 0; P.grounded = 1; P.gy = P.pos.y;
  C.tgt.set(q.x, P.pos.y + 3.4, q.z); C.az = q.a + Math.PI; C.r = 20;
  hold(1, () => { ST.L.x = ST.L.y = 0; });
  let minClear = 1e9, buried = 0, worst = 0, prev = lens().y, frames = 0, lastLag = 0;
  hold(secs, () => {
    ST.L.x = 0; ST.L.y = -1;
    const L = lens(), c = L.y - dY(L.x, L.z, L.y);
    minClear = Math.min(minClear, c); if (c < .6) buried++;
    worst = Math.max(worst, Math.abs(L.y - prev) / .033); prev = L.y;
    lastLag = Math.abs(C.tgt.y - (P.pos.y + 3.4));
    frames++;
  });
  ST.L.y = 0;
  console.log('camera                    ', JSON.stringify({ over: name,
    closestTheLensCameToTheGround: +minClear.toFixed(2), framesInsideIt: buried, ofTotal: frames,
    worstJolt: +worst.toFixed(1) + ' u/s', mountTrailingHimBy: +lastLag.toFixed(2) }));
}
// A slope steep enough that the old solver had to do something about it, approached straight
// up the face and then straight down it.
function faceSpot(sign) {
  for (let i = 0; i < 40000; i++) {
    const x = (Math.random() - .5) * 260, z = (Math.random() - .5) * 260;
    const sl = global.__slope(x, z), h = H(x, z);
    if (h < 4 || h > 30 || sl < .7) continue;
    const e = 1.5, gx = (H(x + e, z) - H(x - e, z)) / (2 * e), gz = (H(x, z + e) - H(x, z - e)) / (2 * e);
    const gl = Math.hypot(gx, gz) || 1;
    return { x, z, a: Math.atan2(sign * gx / gl, sign * gz / gl) };
  }
  return null;
}
camRun('a steep face, climbing', () => faceSpot(1));
camRun('the same face, descending', () => faceSpot(-1));

// Rotation. Auto-recentring is DELIBERATELY OFF: a drone that keeps you framed is not a drone
// that re-aims every time you change direction, and having the view swing whenever the left
// stick went left was wrong. "never" is the pass here, and this stays as a tripwire -- if it
// ever starts reporting a time again, something has turned the yaw back on.
// (The stick is read in camera space, so holding it sideways while the boom swings turns him
// as fast as the boom arrives and the two chase each other round a circle for ever. Pin a
// fixed WORLD heading instead, the way the turn test pins a velocity.)
function recentreTest(deg) {
  const q = flatSpot(), a = deg * Math.PI / 180;
  P.pos.set(q.x, gY(q.x, q.z), q.z); P.vx = P.vz = P.vy = 0; P.grounded = 1; P.gy = P.pos.y;
  C.tgt.set(q.x, P.pos.y + 3.4, q.z); C.az = 0; C.idle = 9;
  let t = 0, got = null;
  const off = () => { let d = (a + Math.PI) - C.az; return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); };
  hold(9, () => {
    ST.L.x = ST.L.y = 0;
    P.wx = Math.sin(a); P.wz = Math.cos(a); P.wmag = 1; P.moving = 1; P.heading = a;
    t += .033;
    if (got === null && t > .5 && off() < .17) got = t;      // within ten degrees
  });
  P.wmag = 0;
  console.log('camera                    ', JSON.stringify({ walkingOff: deg + ' deg from the boom',
    theBoomFollowedAfter: got === null ? 'never (correct: the left stick must not move the view)' : +got.toFixed(1) + ' s',
    stillOffBy: +(off() * 57.3).toFixed(0) + ' deg' }));
}
recentreTest(90); recentreTest(170);

// The zoom. The solver may pull the boom in to clear a hill, and it must not treat a wide
// shot of the island as a hill to clear: the first cut of it saturated its climb over any
// relief at all and handed back a third of the length that was asked for.
function zoomTest(want) {
  const q = flatSpot();
  P.pos.set(q.x, gY(q.x, q.z), q.z); P.vx = P.vz = P.vy = 0; P.grounded = 1; P.gy = P.pos.y;
  C.tgt.set(q.x, P.pos.y + 3.4, q.z); C.r = want;
  hold(6, () => { ST.L.x = ST.L.y = 0; C.r = want; });
  console.log('camera                    ', JSON.stringify({ askedForABoomOf: want,
    got: +CS.r.toFixed(1), lensAboveTheTarget: +(CS.y - C.tgt.y).toFixed(1) }));
}
for (const r of [20, 45, 90, 200]) zoomTest(r);

process.exit(0);