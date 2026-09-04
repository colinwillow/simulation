// Flies the ship's sortie in the headless sim and reports what every joint did.
//
//   node tools/sortie.js index.html
//
// The GLB loader is not available under node, so the ship is handed a stand-in skeleton of
// named bones at the measured positions and its own update() drives them exactly as it
// would the real ones. Lift-off, one lap, landing: for each phase the ranges of throttle,
// yaw, pitch, gear and roll; the hip and pad angles; nozzle pitch and outward swing per
// side; exhaust rates for the main and side jets; whether the collider was down; the
// minimum clearance above terrain and the great tree; and which side jet fired for which
// turn. It ends with the ship back on its pad, or says why not.
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
global.window=global;   // the page hangs a debug handle off window; no GLTFLoader here, so the rig load is skipped
global.__t=0; global.performance={now:()=>global.__t};
const fs=require('fs');
const file=process.argv[2]||'index.html';
const html=fs.readFileSync(file,'utf8');
const block=html.match(/<script>([\s\S]*?)<\/script>/g).find(b=>b.includes('Lantern Isle'));
let src=block.replace(/^<script>/,'').replace(/<\/script>$/,'');
// inject at the close of the MAIN IIFE (the last one) — earlier ones are nested helpers
const cut=src.lastIndexOf('})();');
src=src.slice(0,cut)+'global.__w=world;global.__C={Cairn,Weaver,LanternTree,Bloom,MossTuft,Grazer,Skimmer,Drifter,Burrower,Leviathan,Walker,Hopper,GreatTree,Campfire,Cave,FloatingIsle,Log,Stump};global.__f=ferry;global.__count=count;global.__OB=OB;global.__obRad=obRad;global.__h=height;global.__sl=slope;global.__scene=scene;global.__p=player;global.__S=Streaks;global.__wu=waterUni;global.__wx=WX;global.__SHIP=SHIP;global.__h2=height;'+src.slice(cut);
eval(src);
const N=+process.argv[3]||6000;
// optional: node tools/headless.js index.html 3000 storm   -> start in that weather
if(process.argv[4]) global.__wx.force=process.argv[4];
let maxRain=0,maxStorm=0;
const stall=new Map();   // creature -> {t, x, z, worst, state}
let stallWorst=0, stallWho='', stallState='', stallNear='', stallCount=0; const stallTop=[], stallByClass={};
const w=global.__w,C=global.__C,c=global.__count,obRad=global.__obRad;
let worstOverlap=0, worstWho='', overlapFrames=0, stuckMax=0;
const obs=new Set(); for(const [k,a] of global.__OB.map) for(const o of a) obs.add(o);
for(let i=0;i<N;i++){ const f=cbs.shift(); global.__t+=33; f(global.__t);
  maxRain=Math.max(maxRain,global.__wx.rain); maxStorm=Math.max(maxStorm,global.__wx.storm);
  if(i%30===0){ for(const cr of w.creatures){ if(!cr.alive||cr.flying||cr.aquatic) continue;
      let e=stall.get(cr); if(!e){ e={t:0,x:cr.pos.x,z:cr.pos.z,worst:0}; stall.set(cr,e); }
      const moved=Math.hypot(cr.pos.x-e.x,cr.pos.z-e.z); e.x=cr.pos.x; e.z=cr.pos.z;
      if(cr.moving>0.5 && moved<0.25) { e.t+=1; if(e.t>e.worst) e.worst=e.t; if(e.t*1===3){ stallCount++; const k=cr.constructor.name; stallByClass[k]=(stallByClass[k]||0)+1; }
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

const W2=global.__w, S=W2.ship, SH=global.__SHIP, H=global.__h2;
if(!S){ console.log('no ship placed in this world'); process.exit(0); }
// Stand-in skeleton: the loader is not available here, so give the ship named bones at the
// measured positions and let its own update drive them.
const b={}, arm=new THREE.Group(); S.g.add(arm);
const mk=(n,x,y,z,parent)=>{ const o=new THREE.Object3D(); o.isBone=true; o.name=n; o.position.set(x,y,z); (parent||arm).add(o); b[n]=o; return o; };
mk('hatch_pivot',0,2.82,-.09);
for(const [n,x,z] of [['leg_L',2.09,.56],['leg_R',-2.19,.56],['leg_back',0,-1.97]]){ const hip=mk(n,x,.83,z); const pv=mk(n+'_pivot',.4,-.7,0,hip); mk(n+'_foot',.1,-.1,0,pv); }
for(const [n,x] of [['back_jet_L',1.01],['back_jet_R',-1]]){ const j=mk(n,x,1.82,-2.03); const f=mk(n+'_flame',0,0,-.82,j); mk(n+'_flame_direction',0,0,-.48,f); }
for(const [n,x] of [['side_jet_L',1.64],['side_jet_R',-1.63]]){ const j=mk(n,x,1.57,-1.76); mk(n+'_direction',Math.sign(x)*.34,0,0,j); }
S.bones=b; S.hatch0=0; S.gear0={};
for(const n in SH.gear) S.gear0[n]={hip:b[n].rotation.clone(),pad:b[n+'_pivot'].rotation.clone()};
for(const n of ['back_jet_L','back_jet_R']) S.gear0[n]={hip:b[n].rotation.clone()};
S.buildJets();
const P=global.__p; P.pos.x=S.pos.x+30; P.pos.z=S.pos.z; S.next=0;
// optional: `node tools/sortie.js index.html tree` parks the great tree's column beside the
// pad, so the climb-out has something to clear and the hop-raise has to earn its keep
if(process.argv[3]==='tree' && W2.greatTree){ const g=W2.greatTree, a0=Math.atan2(S.pad.z,S.pad.x);   // 34 units out along the departure line, under the climb-out
  g.pos.x=S.pad.x+Math.cos(a0)*34; g.pos.z=S.pad.z+Math.sin(a0)*34; g.pos.y=S.pad.y; console.log('great tree moved under the climb-out: top at',(g.pos.y+g.H*1.05).toFixed(1),'| pad at',S.pad.y.toFixed(1)); }
const step=()=>{ const f=cbs.shift(); global.__t+=33; f(global.__t); };
const log=[]; let t0=W2.clock, frames=0, minClr=1e9, minIsle=1e9, minGT=1e9, plume=null;
while(frames<9000){ step(); frames++;
  if(S.state!=='landed'){ const h=H(S.pos.x,S.pos.z); minClr=Math.min(minClr,S.pos.y-h);
    if(W2.isle) minIsle=Math.min(minIsle, Math.hypot(S.pos.x-W2.isle.pos.x,S.pos.z-W2.isle.pos.z));
    if(W2.greatTree){ const g=W2.greatTree; const dxz=Math.hypot(S.pos.x-g.pos.x,S.pos.z-g.pos.z); if(dxz<16) minGT=Math.min(minGT,S.pos.y-(g.pos.y+g.H)); } }
  if(frames%8===0) log.push({t:+(W2.clock-t0).toFixed(1),st:S.state,y:+S.pos.y.toFixed(1),thr:+S.sm.throttle.toFixed(2),yaw:+S.sm.yaw.toFixed(2),pit:+S.sm.pitch.toFixed(2),gear:+S.sm.gear.toFixed(2),
    legL:+(b.leg_L.rotation.z).toFixed(2),legR:+(b.leg_R.rotation.z).toFixed(2),legB:+(b.leg_back.rotation.x).toFixed(2),padL:+(b.leg_L_pivot.rotation.z).toFixed(2),
    nozX:+(b.back_jet_L.rotation.x).toFixed(2),Lout:+(b.back_jet_L.rotation.y).toFixed(2),Rout:+(b.back_jet_R.rotation.y).toFixed(2),
    jL:+S.jets.L.rate.toFixed(0),sL:+S.jets.sL.rate.toFixed(0),sR:+S.jets.sR.rate.toFixed(0),ob:!!S.ob,roll:+S.g.rotation.z.toFixed(2)});
  // mid-lap: where is the exhaust, relative to the nozzle that made it?
  if(S.state==='cruise' && !plume && S.dist>S.curveLen*.4){ const j=S.jets.L, em=S.em.L; const back=new THREE.Vector3(0,0,-1).applyQuaternion(S.g.quaternion);
    let n=0,along=0,off=0,mx=0; for(let i=0;i<j.n;i++){ if(j.age[i]<0) continue; n++;
      const d=new THREE.Vector3(j.pos[i*3]-em.p.x,j.pos[i*3+1]-em.p.y,j.pos[i*3+2]-em.p.z); const a=d.dot(back); along+=a; mx=Math.max(mx,a); off+=d.addScaledVector(back,-a).length(); }
    plume={alive:n,of:j.n,meanBehind:+(along/Math.max(n,1)).toFixed(1),furthest:+mx.toFixed(1),offAxis:+(off/Math.max(n,1)).toFixed(1),rate:+j.rate.toFixed(0),visible:j.pts.visible}; }
  if(log.length>6 && S.state==='landed' && log.some(r=>r.st==='cruise')) break; }
const by=st=>log.filter(x=>x.st===st);
const rng=(a,k)=>a.length?Math.min(...a.map(x=>x[k])).toFixed(2)+'..'+Math.max(...a.map(x=>x[k])).toFixed(2):'-';
console.log('sortie:',(W2.clock-t0).toFixed(0),'s of world time,',frames,'frames | states seen:',[...new Set(log.map(r=>r.st))].join(' > '),'| hop',S.hop.toFixed(1),S.hop>SH.hop+.01?'(raised from '+SH.hop+')':'(default)');
for(const st of ['lift','cruise','land']){ const a=by(st); if(!a.length){console.log(st,'never');continue;}
  console.log(st.padEnd(6),(a.length*8*.033).toFixed(0)+'s | y',rng(a,'y'),'| throttle',rng(a,'thr'),'| yaw',rng(a,'yaw'),'| pitch',rng(a,'pit'),'| gear',rng(a,'gear'),'| roll',rng(a,'roll'));
  console.log('       legL',rng(a,'legL'),'legR',rng(a,'legR'),'legBack',rng(a,'legB'),'padL',rng(a,'padL'),'| nozzle pitch',rng(a,'nozX'),'| L out',rng(a,'Lout'),'R out',rng(a,'Rout'),'| main rate',rng(a,'jL'),'| side L',rng(a,'sL'),'side R',rng(a,'sR'),'| collider',[...new Set(a.map(x=>x.ob))].join('/'));
}
console.log('down again:',JSON.stringify({state:S.state,y:+S.pos.y.toFixed(1),padY:+S.pad.y.toFixed(1),gear:+S.sm.gear.toFixed(2),legL:+b.leg_L.rotation.z.toFixed(2),collider:!!S.ob}),'| next sortie in',(S.next-W2.clock).toFixed(0),'s');
console.log('clearance: min above terrain',minClr.toFixed(1),'| nearest to the floating isle (xz)',isFinite(minIsle)?minIsle.toFixed(0):'n/a','| min above great tree top when within 16',minGT<1e8?minGT.toFixed(1):'never within 16');
// side jets: which one fires on which turn?
const cr=by('cruise'); const lt=cr.filter(r=>r.yaw<-.3), rt=cr.filter(r=>r.yaw>.3);
console.log('exhaust mid-lap (rear left):',plume?JSON.stringify(plume)+'  (behind = along the ship\'s own -Z; a plume should sit a few units behind the nozzle, tight to its axis)':'no cruise sample');
console.log('turning left  (yaw<-.3):',lt.length,'samples | side L rate',rng(lt,'sL'),'side R',rng(lt,'sR'),'| L nozzle out',rng(lt,'Lout'),'R nozzle out',rng(lt,'Rout'));
console.log('turning right (yaw> .3):',rt.length,'samples | side L rate',rng(rt,'sL'),'side R',rng(rt,'sR'),'| L nozzle out',rng(rt,'Lout'),'R nozzle out',rng(rt,'Rout'));
