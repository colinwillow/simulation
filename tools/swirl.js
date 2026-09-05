// Does the lamp's swirl of motes go where the lamp goes?
//
//   node tools/swirl.js index.html
//
// Written after "when I jump in the air they don't follow me up" -- the swirl stayed on the
// grass under him. In the browser this is unmeasurable: software GL runs at a frame a second
// and the swirl takes twenty seconds of world time to gather, so it is run headless instead,
// where a thousand frames cost nothing. It reports how many motes the lamp holds, how they
// sit relative to it, and what happens to them when the lamp climbs ten units the way it
// does at the top of a jump.
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
global.window=global;
global.__t=0; global.performance={now:()=>global.__t};
const fs=require('fs');
const html=fs.readFileSync(process.argv[2]||'index.html','utf8');
const block=html.match(/<script>([\s\S]*?)<\/script>/g).find(b=>b.includes('const BUILD'));
let src=block.replace(/^<script>/,'').replace(/<\/script>$/,'');
const cut=src.lastIndexOf('})();');
src=src.slice(0,cut)+'global.__w=world;global.__p=player;global.__fairy=fairy;global.__mp=mp;global.__NM=NM;global.__gY=groundY;global.__DAY=DAY;global.__attr=attractors;'+src.slice(cut);
eval(src);
const W=global.__w, P=global.__p, F=global.__fairy, mp=global.__mp, NM=global.__NM, gY=global.__gY, DAY=global.__DAY;
const step=()=>{ const f=cbs.shift(); global.__t+=33; f(global.__t); };
const hold=s=>{ for(let i=0;i<Math.round(s/.033);i++) step(); };

// The swirl is a night thing: in daylight a bloom outbids the lamp for the same motes.
W.t = DAY * .86;
hold(2);
// Clear the field. Which motes the lamp *wins* depends on where he happens to have spawned
// -- it bids 1.85 at forty-six units against the great tree's 3.7 at a hundred and seventy,
// so on some seeds it holds two dozen and on others none -- and that is a different question
// from whether the ones it holds follow it. Take the other bidders away and the run is the
// same every time.
W.greatTree = null; W.structures.length = 0; W.sparks.length = 0; W.creatures.length = 0;
for (let i = W.plants.length - 1; i >= 0; i--) if (W.plants[i].constructor.name === 'Bloom') W.plants.splice(i, 1);
hold(1);
// stand still, so what happens to the swirl is the lamp's doing and not his
const hx = P.pos.x, hz = P.pos.z;
const pin = () => { P.pos.x = hx; P.pos.z = hz; P.vx = P.vz = 0; };
hold(3);
// Seed it by hand rather than waiting for one to gather. The lamp is a weak bidder against
// the great tree and the beacons -- 1.85 at forty-six units against 3.7 at a hundred and
// seventy -- so which motes it ends up holding depends on where he happens to be standing,
// and that is not the question here. The question is whether the ones it IS holding go
// where it goes.
const SEED = 24;
for (let i = 0; i < SEED; i++) {
  const a = i / SEED * Math.PI * 2, r = 2 + (i % 3);
  mp[i*3] = F.pos.x + Math.cos(a) * r; mp[i*3+1] = F.pos.y + (i % 5 - 2) * .4; mp[i*3+2] = F.pos.z + Math.sin(a) * r;
}
for (let i = 0; i < 90; i++) { pin(); step(); }
const look = () => {
  let n = 0, sy = 0, lo = 1e9, hi = -1e9, under = 0;
  for (let i = 0; i < NM; i++) {
    const x = mp[i*3], y = mp[i*3+1], z = mp[i*3+2];
    if (Math.hypot(x - F.pos.x, z - F.pos.z) > 7) continue;
    n++; sy += y - F.pos.y; lo = Math.min(lo, y); hi = Math.max(hi, y);
    if (y < F.pos.y - 5) under++;
  }
  return { held: n, meanYvsLamp: n ? +(sy/n).toFixed(2) : null, spread: n ? +(hi-lo).toFixed(1) : null,
    strandedBelow: under, lampY: +F.pos.y.toFixed(1), groundHere: +gY(F.pos.x, F.pos.z).toFixed(1) };
};
const rest = look();
if (process.argv[3] === 'why') {
  let near = 0, min = 1e9;
  for (let i = 0; i < NM; i++) { const d = Math.hypot(mp[i*3] - F.pos.x, mp[i*3+2] - F.pos.z); if (d < 46) near++; min = Math.min(min, d); }
  console.log('diag:', JSON.stringify({ NM, motesWithin46: near, nearestMote: +min.toFixed(1),
    night: +W.night.toFixed(2), playerAt: [+P.pos.x.toFixed(1), +P.pos.z.toFixed(1)],
    lampAt: [+F.pos.x.toFixed(1), +F.pos.z.toFixed(1)], free: P.free, fly: P.fly,
    attractors: (global.__attr||[]).length }));
}

// take the lamp up the way the top of a jump does: 25 off the ground against a gravity of
// 32 is a ten-unit apex, and the lamp rides a couple above his head.
F.off.y += 10;
const trace = [];
for (let i = 0; i < 120; i++) { pin(); step(); if (i % 20 === 19) trace.push(look().meanYvsLamp); }
const up = look();
F.off.y -= 10;
for (let i = 0; i < 120; i++) { pin(); step(); }
const back = look();

console.log('lamp at rest      ', JSON.stringify(rest));
console.log('lamp up 10 (4s)   ', JSON.stringify(up), '  mean height vs lamp, each 0.66s:', JSON.stringify(trace));
console.log('lamp back down    ', JSON.stringify(back));
// a straggler or two out of a couple of hundred is a mote that wandered off, not a swirl
// that stayed behind
const ok = up.held > 0 && Math.abs(up.meanYvsLamp) < 3.5 && up.strandedBelow <= Math.max(1, up.held * .05);
console.log(ok ? '\nthe swirl goes with the lamp' : '\nSWIRL LEFT BEHIND: it is not following the lamp up');
