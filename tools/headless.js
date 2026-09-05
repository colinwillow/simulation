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
global.window=global;   // the page hangs a debug handle off window; no GLTFLoader here, so the rig load is skipped
global.__t=0; global.performance={now:()=>global.__t};
const fs=require('fs');
const file=process.argv[2]||'index.html';
const html=fs.readFileSync(file,'utf8');
const block=html.match(/<script>([\s\S]*?)<\/script>/g).find(b=>b.includes('const BUILD'));
let src=block.replace(/^<script>/,'').replace(/<\/script>$/,'');
// inject at the close of the MAIN IIFE (the last one) — earlier ones are nested helpers
const cut=src.lastIndexOf('})();');
src=src.slice(0,cut)+'global.__w=world;global.__INTRO=INTRO;global.__bio=biomeAt;global.__REGIONS=REGIONS;global.__W=W;global.__C={Cairn,Weaver,LanternTree,Bloom,MossTuft,Grazer,Skimmer,Drifter,Burrower,Leviathan,Walker,Hopper,GreatTree,Campfire,Cave,FloatingIsle,Log,Stump};global.__f=ferry;global.__count=count;global.__OB=OB;global.__obRad=obRad;global.__h=height;global.__sl=slope;global.__scene=scene;global.__p=player;global.__S=Streaks;global.__wu=waterUni;global.__wx=WX;'+src.slice(cut);
eval(src);
// The title screen parks the camera out at the planet and flies the ship round it. That is
// the first thing a player sees and the last thing a harness wants: every tool here measures
// the game being played, so each of them starts it.
global.__INTRO.on = false;
const N=+process.argv[3]||6000;
// optional: node tools/headless.js index.html 3000 storm   -> start in that weather
if(process.argv[4]) global.__wx.force=process.argv[4];
let maxRain=0,maxStorm=0;
const stall=new Map();   // creature -> {t, x, z, worst, state}
let stallWorst=0, stallWho='', stallState='', stallNear='', stallCount=0; const stallTop=[], stallByClass={}, stallByDoing={};
const w=global.__w,C=global.__C,c=global.__count,obRad=global.__obRad;
let worstOverlap=0, worstWho='', overlapFrames=0, stuckMax=0;
const obs=new Set(); for(const [k,a] of global.__OB.map) for(const o of a) obs.add(o);
for(let i=0;i<N;i++){ const f=cbs.shift(); global.__t+=33; f(global.__t);
  maxRain=Math.max(maxRain,global.__wx.rain); maxStorm=Math.max(maxStorm,global.__wx.storm);
  if(i%30===0){ for(const cr of w.creatures){ if(!cr.alive||cr.flying||cr.aquatic) continue;
      let e=stall.get(cr); if(!e){ e={t:0,x:cr.pos.x,z:cr.pos.z,worst:0}; stall.set(cr,e); }
      const moved=Math.hypot(cr.pos.x-e.x,cr.pos.z-e.z); e.x=cr.pos.x; e.z=cr.pos.z;
      if(cr.moving>0.5 && moved<0.25) { e.t+=1; if(e.t>e.worst) e.worst=e.t; if(e.t*1===3){ stallCount++; const k=cr.constructor.name; stallByClass[k]=(stallByClass[k]||0)+1;
        const d=cr.doing||cr.state||'-'; stallByDoing[d]=(stallByDoing[d]||0)+1; }
        if(e.t>stallWorst){ stallWorst=e.t; stallWho=cr.constructor.name; stallState=cr.state;
          let best=null,bd=1e9; for(const o of obs){ const d=Math.hypot(cr.pos.x-o.x,cr.pos.z-o.z)-obRad(o); if(d<bd){bd=d;best=o;} }
          stallNear=best?(best.owner?best.owner.constructor.name:'?')+' at '+bd.toFixed(1):'none'; }
        if(e.t>=8 && !e.listed){ e.listed=true; let best=null,bd=1e9; for(const o of obs){ const d=Math.hypot(cr.pos.x-o.x,cr.pos.z-o.z)-obRad(o); if(d<bd){bd=d;best=o;} }
          stallTop.push({cr, near:best?(best.owner?best.owner.constructor.name:'boulder')+' '+bd.toFixed(1):'none', state:cr.state, e}); } }
      else e.t=0; } }
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
// Did the structures get built at all, and where. The steading, the stone ring and the ruin
// each ask for a lot of clear ground in a particular biome; when they cannot find any they
// used to build nothing and say nothing about it.
{ // what is actually standing at each anchor, and how much land it owns
  const R = global.__REGIONS;
  console.log('regions: ' + R.map(r => {
    const h = global.__h(r.x, r.z);
    return r.name + '@' + (r.x|0) + ',' + (r.z|0) + ' h' + h.toFixed(0) + ' ' + global.__bio(r.x, r.z).name;
  }).join(' | '));
}
console.log('title at',w.titleSpot?(w.titleSpot.x.toFixed(0)+','+w.titleSpot.z.toFixed(0)):'NOWHERE',
  '| nearest site',(w.sites||[]).length?Math.min(...(w.sites||[]).map(o=>Math.hypot(o.x-(w.titleSpot||o).x,o.z-(w.titleSpot||o).z))).toFixed(0):'-');
console.log('sites',(w.sites||[]).length,(w.sites||[]).map(o=>o.x.toFixed(0)+','+o.z.toFixed(0)).join(' ')||'NONE BUILT',
  '| biomes here',['coast','wetland','jungle','pasture','scrub','highland','crystal','fungal','desert'].map(n=>{
    let k=0; for(let i=0;i<3000;i++){ const x=(Math.random()-.5)*2*global.__W, z=(Math.random()-.5)*2*global.__W;
      if(global.__h(x,z)>0.6 && global.__bio(x,z).name===n) k++; }
    return n+' '+k; }).join(' '));
console.log('frames',N,'| day',w.day,'cairns',w.cairns,'beacons',w.beacons,'trees',c(w.plants,C.LanternTree),'blooms',c(w.plants,C.Bloom),'grazers',c(w.creatures,C.Grazer),'tinkers',c(w.creatures,C.Weaver));
console.log('walking in place: episodes over 3s',stallCount,JSON.stringify(stallByClass),'| by',JSON.stringify(stallByDoing),'| escapes',w.escapes||0,'| longest',stallWorst,'s',stallWho,'state',stallState,'| nearest obstacle',stallNear);
stallTop.sort((a,b)=>b.e.worst-a.e.worst).slice(0,3).forEach(t=>console.log('   stalled',t.e.worst+'s',t.cr.constructor.name,'state',t.state,'| nearest',t.near,'| ignore',t.cr.ignore?t.cr.ignore.constructor.name:'-'));
const X=global.__wx; console.log('weather: now',X.state,'| fronts',X.fronts,'| strikes',X.strikes,'| sparks alive',w.sparks.filter(s=>s.alive).length,'| max rain',maxRain.toFixed(2),'storm',maxStorm.toFixed(2),'| wet',X.wet.toFixed(2),'| wind',X.windK.toFixed(2));
console.log('ghost-frames excluded | obstacles',obs.size,'| worst penetration',worstOverlap.toFixed(2),worstWho,'| sampled frames with any overlap',overlapFrames,'/',Math.ceil(N/97),'| max stuck timer',stuckMax.toFixed(2));
