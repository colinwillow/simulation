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
src=src.slice(0,cut)+'global.__w=world;global.__C={Cairn,Weaver,LanternTree,Bloom,MossTuft,Grazer,Skimmer,Drifter,Burrower,Leviathan,Walker,Hopper,GreatTree,Campfire,Cave,FloatingIsle,Log,Stump};global.__f=ferry;global.__count=count;global.__OB=OB;global.__obRad=obRad;global.__h=height;global.__sl=slope;global.__scene=scene;global.__p=player;global.__S=Streaks;global.__wu=waterUni;global.__wx=WX;global.__SHIP=SHIP;global.__h2=height;global.__stick=stick;global.__keys=keys;global.__PILOT=PILOT;global.__gY=groundY;global.__cam=cam;'+src.slice(cut);
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
// `node tools/sortie.js index.html pilot` — fly it by hand instead: board, spool, lift, run,
// turn, coast, come down, get out. Reports the timings that make it feel heavy.
if(process.argv[3]==='pilot'){
  const ST=global.__stick, K=global.__keys, PL=global.__PILOT;
  const hold=(sec,fn)=>{ const n=Math.round(sec/.033); for(let i=0;i<n;i++){ fn&&fn(); step(); } };
  const sp=()=>Math.hypot(S.vel.x,S.vel.z), alt=()=>S.pos.y-global.__gY(S.pos.x,S.pos.z), rec=[];   // above ground, or above the water where there is no ground
  P.pos.x=S.pos.x+5; P.pos.z=S.pos.z; hold(4);            // walk up: the hatch opens
  const openBefore=S.open; S.board();
  const out={hatchOpenAtBoard:+openBefore.toFixed(2), boarded:P.aboard===true, state0:S.state, playerHidden:!P.g.visible, colliderGone:!S.ob};
  // hold climb: watch the spool come up and the moment it unsticks
  let tSpool=null,tUp=null,tt=0;
  hold(6,()=>{ ST.R.y=-1; tt+=.033; if(tSpool===null&&S.spool>=1) tSpool=tt; if(tUp===null&&!S.grounded) tUp=tt; if(tt<3&&(Math.round(tt*30)%15===0)) rec.push({t:+tt.toFixed(1),spool:+S.spool.toFixed(2),trembleY:+S.trem.y.toFixed(3),plume:+S.jets.L.rate.toFixed(0)}); });
  out.spoolFullAt=tSpool&&+tSpool.toFixed(1); out.unstuckAt=tUp&&+tUp.toFixed(1); out.altAfter6sOfClimb=+alt().toFixed(1); out.climbRate=+S.vel.y.toFixed(1); out.gearAt6s=+S.sm.gear.toFixed(2);
  hold(4,()=>{ ST.R.y=-1; }); out.altAfter10s=+alt().toFixed(1); out.gearAt10s=+S.sm.gear.toFixed(2);
  ST.R.y=0;
  // point at the middle of the island so the run does not leave the map, and note the chase view
  S.heading=Math.atan2(-S.pos.x,-S.pos.z); hold(1); const CM=global.__cam; out.chaseCam={r:+CM.r.toFixed(1),pitchBase:+CM.pol0.toFixed(2),pitch:+CM.pol.toFixed(2),wanted:PL.camPol};
  // full forward: speed at 2, 5, 10 seconds, then let go and see how long it takes to slow
  const spd=[]; let el=0; hold(10,()=>{ ST.L.y=-1; el+=.033; for(const m of [2,5,10]) if(Math.abs(el-m)<.02) spd.push({t:m,speed:+sp().toFixed(1),nose:+S.nose.toFixed(3),throttleJoint:+S.sm.throttle.toFixed(2)}); });
  out.acceleration=spd; ST.L.y=0;
  // At the new top speed a ten second run leaves the map, and the world edge bounces the
  // ship at -0.3 of its speed, which reads as drag it does not have. Put it back over the
  // middle first, and say plainly whether it reached the edge anyway.
  S.g.position.x=0; S.g.position.z=0; S.pos.x=0; S.pos.z=0;
  const v0=sp(); let tHalf=null, hitEdge=false; el=0;
  hold(8,()=>{ el+=.033; if(tHalf===null&&sp()<v0*.5) tHalf=el; if(Math.abs(S.pos.x)>232||Math.abs(S.pos.z)>232) hitEdge=true; });
  out.coast={from:+v0.toFixed(1),halfSpeedAfter:tHalf&&+tHalf.toFixed(1),after8s:+sp().toFixed(1),hitWorldEdge:hitEdge};
  // a turn: the yaw rate builds and the hull banks with it, and it keeps swinging when released
  // stick hard LEFT: the heading must rise, the hull must roll left (negative), the LEFT
  // nozzle must swing out and the LEFT side jet must fire.
  const h0=S.heading; const yr=[]; el=0;
  hold(3,()=>{ ST.L.x=-1; el+=.033; for(const m of [.5,1.5,3]) if(Math.abs(el-m)<.02) yr.push({t:m,yawRate:+S.yawRate.toFixed(2),roll:+S.roll.toFixed(2),Lout:+(b.back_jet_L.rotation.y).toFixed(2),Rout:+(b.back_jet_R.rotation.y).toFixed(2),sideL:+S.jets.sL.rate.toFixed(0),sideR:+S.jets.sR.rate.toFixed(0)}); });
  let dh=S.heading-h0; dh=Math.atan2(Math.sin(dh),Math.cos(dh));
  out.stickLeft={headingChange:+dh.toFixed(2),turnedLeft:dh>0,rolledLeft:S.roll<0,leftNozzleOut:b.back_jet_L.rotation.y<-.05,rightNozzleStill:Math.abs(b.back_jet_R.rotation.y)<.05,leftJetFiring:S.jets.sL.rate>0,rightJetOff:S.jets.sR.rate===0};
  ST.L.x=0; const yr0=S.yawRate; hold(1.5); out.turn={ramp:yr,afterRelease1_5s:+S.yawRate.toFixed(2),wasBeforeRelease:+yr0.toFixed(2)};
  // come down: push down until it lands, note when the gear drops
  let gearCmdAlt=null, gearDownAlt=null, tDown=0, atTouch=null;
  for(let i=0;i<1200;i++){ ST.R.y=1; step(); tDown+=.033;
    if(gearCmdAlt===null&&S.ctl.gear===0) gearCmdAlt=+alt().toFixed(1);
    if(gearDownAlt===null&&S.sm.gear<.1) gearDownAlt=+alt().toFixed(1);
    if(S.grounded){ ST.R.y=0; atTouch={sagKick:+S.sagV.toFixed(2),power:+S.power.toFixed(2),gear:+S.sm.gear.toFixed(2),couldLeaveYet:S.spool<=.02}; break; } }
  out.landing=Object.assign({touchedDownAfter:+tDown.toFixed(1),gearCommandedDownAtAlt:gearCmdAlt,gearFullyDownAtAlt:gearDownAlt,onGround:S.grounded},atTouch||{});
  let tCool=0; hold(6,()=>{ if(S.spool>.02) tCool+=.033; }); out.jetsOffAfter=+tCool.toFixed(1);
  const canLeave=S.grounded&&S.power<.15; S.leave();
  out.leave={couldLeave:canLeave,aboard:P.aboard,playerVisible:P.g.visible,shipState:S.state,colliderBack:!!S.ob,playerDistFromShip:+Math.hypot(P.pos.x-S.pos.x,P.pos.z-S.pos.z).toFixed(1),playerOnGround:+(P.pos.y-global.__gY(P.pos.x,P.pos.z)).toFixed(2)};
  hold(3); out.hatchAfterLeave=+S.open.toFixed(2); out.nextSortieIn=+(S.next-W2.clock).toFixed(0);
  console.log('spool-up trace:',JSON.stringify(rec));
  console.log(JSON.stringify(out,null,1));
  process.exit(0);
}
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
