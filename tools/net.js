// What actually happens to a net after it catches something, frame by frame: whether it
// caught, whether it bound, and where its top and bottom are against the animal's feet.
// Written because four rounds of reasoning about this from screenshots were all wrong.
//
//   node tools/net.js
const THREE = require('three');
THREE.WebGLRenderer = class { constructor(){ this.domElement={addEventListener(){},style:{}}; this.shadowMap={}; this.info={render:{calls:0,triangles:0},reset(){},autoReset:true}; this.capabilities={getMaxAnisotropy:()=>1,isWebGL2:false}; } setPixelRatio(){} setSize(){} render(){} clear(){} setRenderTarget(){} getContext(){return {getExtension:()=>null};} };
THREE.CanvasTexture = class extends THREE.Texture {};
global.THREE = THREE; global.devicePixelRatio=1; global.innerWidth=1280; global.innerHeight=800;
global.matchMedia=()=>({matches:false});
const els={};
global.document={ createElement(t){ if(t==='canvas') return {width:0,height:0,getContext(){return {createRadialGradient(){return {addColorStop(){}}},fillRect(){},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},putImageData(){}}}};
  const d={children:[],style:{setProperty(){},removeProperty(){}},dataset:{},title:'',className:'',addEventListener(){},classList:{toggle(){},add(){},remove(){},contains(){return false}},querySelector(){return this.__k||(this.__k=global.document.createElement('div'))},getBoundingClientRect(){return {left:0,top:0,width:132,height:132,bottom:132,right:132}},setPointerCapture(){},appendChild(c){this.children.push(c);c.parent=this},removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1)},remove(){if(this.parent)this.parent.removeChild(this)},get firstChild(){return this.children[0]},set textContent(v){},set innerHTML(v){}}; return d;},
  createElementNS(ns,t){ if(t==='img') return {addEventListener(){},removeEventListener(){},style:{},set src(v){},get src(){return '';}}; return this.createElement(t); },
  getElementById(id){ return els[id]||(els[id]=this.createElement('div')); }, body:{appendChild(){},classList:{add(){},remove(){},toggle(){}}} };
let cbs=[]; global.requestAnimationFrame=f=>cbs.push(f); global.addEventListener=()=>{}; global.setInterval=()=>{}; global.setTimeout=()=>{};
global.window=global; global.__t=0; global.performance={now:()=>global.__t};
const fs=require('fs');
const html=fs.readFileSync('/home/user/simulation/index.html','utf8');
const block=html.match(/<script>([\s\S]*?)<\/script>/g).find(b=>b.includes('const BUILD'));
let src=block.replace(/^<script>/,'').replace(/<\/script>$/,'');
const cut=src.lastIndexOf('})();');
src=src.slice(0,cut)+'global.__w=world;global.__INTRO=INTRO;global.__NetShot=NetShot;global.__NET=NET;global.__p=player;'+src.slice(cut);
eval(src);
global.__INTRO.on=false;
const W=global.__w, NET=global.__NET, NetShot=global.__NetShot;
const step=()=>{ const f=cbs.shift(); global.__t+=33; f(global.__t); };
for(let i=0;i<40;i++) step();                       // let the world settle

const target = W.creatures.find(c=>c.alive && !c.aquatic && !c.flying);
console.log('target:', target.constructor.name, 'rad', target.rad, 'rig?', !!target.rig);
// Fire a net straight at it from four units away.
const dx = 0, dz = 1;
const n = new NetShot(target.pos.x, target.pos.y + 1.5, target.pos.z - 6, dx, dz);
W.effects.push(n);
const ext = () => { let mn=1e9,mx=-1e9,r=0; for(let i=0;i<n.n;i++){ const y=n.p[i*3+1]; if(y<mn)mn=y; if(y>mx)mx=y;
  const ddx=n.p[i*3]-target.pos.x, ddz=n.p[i*3+2]-target.pos.z; r=Math.max(r,Math.hypot(ddx,ddz)); }
  return {loY:+mn.toFixed(2), hiY:+mx.toFixed(2), rad:+r.toFixed(2)}; };
console.log('t      state  prey bind cinch  netOnPrey  loY   hiY   rad   preyY');
for(let f=0; f<95; f++){
  step();
  if(f%6===0 || f<8){
    const e=ext();
    console.log(String((f*0.033).toFixed(2)).padStart(5),
      String(n.state).padStart(7), String(!!n.prey).padStart(5), String(!!n.bind).padStart(5),
      String((n.cinch||0).toFixed(2)).padStart(5), String(target.net===n).padStart(10),
      String(e.loY).padStart(6), String(e.hiY).padStart(6), String(e.rad).padStart(6),
      String(target.pos.y.toFixed(2)).padStart(6));
  }
  if(!n.alive){ console.log('net died at t='+(f*0.033).toFixed(2)); break; }
}
