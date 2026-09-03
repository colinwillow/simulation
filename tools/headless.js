const THREE = require('three');
THREE.WebGLRenderer = class { constructor(){ this.domElement={addEventListener(){},style:{}}; this.shadowMap={}; this.info={render:{calls:0,triangles:0},reset(){},autoReset:true}; } setPixelRatio(){} setSize(){} render(){} clear(){} setRenderTarget(){} getContext(){return {getExtension:()=>null};} };
THREE.CanvasTexture = class extends THREE.Texture {};
global.THREE = THREE; global.devicePixelRatio=1; global.innerWidth=1280; global.innerHeight=800;
global.matchMedia=()=>({matches:false});
const els={};
global.document={ createElement(t){ if(t==='canvas') return {width:0,height:0,getContext(){return {createRadialGradient(){return {addColorStop(){}}},fillRect(){},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},putImageData(){}}}};
  const d={children:[],style:{},addEventListener(){},classList:{toggle(){},add(){},remove(){}},querySelector(){return this.__k||(this.__k=global.document.createElement('div'))},getBoundingClientRect(){return {left:0,top:0,width:132,height:132}},setPointerCapture(){},appendChild(c){this.children.push(c);c.parent=this},removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1)},remove(){if(this.parent)this.parent.removeChild(this)},get firstChild(){return this.children[0]},set textContent(v){},set innerHTML(v){}}; return d;},
  getElementById(id){ return els[id]||(els[id]=this.createElement('div')); }, body:{appendChild(){}} };
let cbs=[]; global.requestAnimationFrame=f=>cbs.push(f); global.addEventListener=()=>{}; global.setInterval=()=>{}; global.setTimeout=()=>{};
global.__t=0; global.performance={now:()=>global.__t};
const fs=require('fs');
const file=process.argv[2]||'index.html';
const html=fs.readFileSync(file,'utf8');
const block=html.match(/<script>([\s\S]*?)<\/script>/g).find(b=>b.includes('Lantern Isle'));
let src=block.replace(/^<script>/,'').replace(/<\/script>$/,'');
// inject at the close of the MAIN IIFE (the last one) — earlier ones are nested helpers
const cut=src.lastIndexOf('})();');
src=src.slice(0,cut)+'global.__w=world;global.__C={Cairn,Weaver,LanternTree,Bloom,MossTuft,Grazer,Skimmer,Drifter,Burrower,Leviathan,Walker,Hopper,GreatTree,Campfire,Cave,FloatingIsle,Log,Stump};global.__f=ferry;global.__count=count;global.__OB=OB;global.__obRad=obRad;global.__h=height;global.__sl=slope;global.__scene=scene;global.__p=player;global.__S=Streaks;global.__wu=waterUni;'+src.slice(cut);
eval(src);
const N=+process.argv[3]||6000;
const w=global.__w,C=global.__C,c=global.__count,obRad=global.__obRad;
let worstOverlap=0, worstWho='', overlapFrames=0, stuckMax=0;
const obs=new Set(); for(const [k,a] of global.__OB.map) for(const o of a) obs.add(o);
for(let i=0;i<N;i++){ const f=cbs.shift(); global.__t+=33; f(global.__t);
  if(i%97===0){
    obs.clear(); for(const [k,a] of global.__OB.map) for(const o of a) obs.add(o);
    let bad=0;
    for(const cr of w.creatures){ if(!cr.alive||cr.flying||cr.ghost>0) continue;
      stuckMax=Math.max(stuckMax,cr.stuck||0);
      for(const o of obs){ if(obRad(o)<cr.minObR||(cr.ignore && o.owner===cr.ignore)) continue;
        const r=obRad(o)+cr.rad, dx=cr.pos.x-o.x, dz=cr.pos.z-o.z, d=Math.hypot(dx,dz);
        if(d<r-0.35){ const pen=r-d; if(pen>worstOverlap){worstOverlap=pen;worstWho=cr.constructor.name;} bad++; }
      } }
    if(bad) overlapFrames++;
  }
}
const C2=global.__C;
let nm=0,tri=0; global.__scene.traverse(o=>{ if(o.isMesh){nm++; const g=o.geometry; if(g&&g.index) tri+=g.index.count/3; else if(g&&g.attributes.position) tri+=g.attributes.position.count/3; }});
console.log('meshes',nm,'approx tris',Math.round(tri/1000)+'k');
let alive=0; for(const ps of w.psys) for(let i=0;i<ps.n;i++) if(ps.age[i]>=0) alive++;
let live=0,dead=0; for(const ps of w.psys){ if(ps instanceof global.__S){ for(let i=0;i<ps.n;i++) (ps.age[i]>=0?live++:dead++); } }
console.log('streak cards alive',live,'of',live+dead);
const wk=global.__wu.uWk.value.map(v=>v.lengthSq()>0?'on':'--').join(',');
console.log('wake slots:',wk,'| player vy',global.__p.vy.toFixed(1),'grounded',global.__p.grounded);
console.log('psys',w.psys.length,'live particles',alive,'camp',!!w.camp,'cave',!!w.cave,'isle',!!w.isle);
console.log('player at',global.__p.pos.x.toFixed(1),global.__p.pos.y.toFixed(1),global.__p.pos.z.toFixed(1),'| fly',global.__p.fly,'| swim',global.__p.swim.toFixed(2));
console.log('logs on the ground',c(w.structures,global.__C.Log),'| stumps',c(w.structures,global.__C.Stump));
console.log('leviathans',c(w.creatures,C2.Leviathan),'walkers',c(w.creatures,C2.Walker),'hoppers',c(w.creatures,C2.Hopper),'greatTree',!!w.greatTree,'trailLen',(w.creatures.find(x=>x instanceof C2.Leviathan)||{trail:[]}).trail.length,'towerY',Math.max(0,...w.structures.filter(o=>o.alive&&o instanceof C2.Cairn).map(o=>o.y)).toFixed(1));
console.log('frames',N,'| day',w.day,'cairns',w.cairns,'beacons',w.beacons,'trees',c(w.plants,C.LanternTree),'blooms',c(w.plants,C.Bloom),'grazers',c(w.creatures,C.Grazer),'tinkers',c(w.creatures,C.Weaver));
console.log('ghost-frames excluded | obstacles',obs.size,'| worst penetration',worstOverlap.toFixed(2),worstWho,'| sampled frames with any overlap',overlapFrames,'/',Math.ceil(N/97),'| max stuck timer',stuckMax.toFixed(2));
