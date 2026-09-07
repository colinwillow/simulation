// THE ONE PATH NOTHING ELSE TESTS. Every other harness in here starts by setting INTRO.on to
// false, because they all measure the game being played -- so the title screen, which is the
// first thing a player sees, is the only code in the file that has never been run outside a
// browser. That is why a broken diorama shows up as a stuck splash and nothing else.
//
// This runs the intro instead: same stubs as headless.js, INTRO left ON, and the frame loop
// turned over a few times so buildDiorama and dioramaFrame actually execute. It cannot draw
// anything and no GLB will load, so it proves nothing about how the shot LOOKS -- it only
// answers "does the first frame throw", which is exactly the question a blank splash asks.
//
//   node tools/intro.js            # or npm run check:intro
const THREE = require('three');
THREE.WebGLRenderer = class { constructor(){ this.domElement={addEventListener(){},style:{}}; this.shadowMap={}; this.info={render:{calls:0,triangles:0},reset(){},autoReset:true}; this.capabilities={getMaxAnisotropy:()=>1,isWebGL2:false}; } setPixelRatio(){} setSize(){} render(){} clear(){} setRenderTarget(){} getContext(){return {getExtension:()=>null};} };
THREE.CanvasTexture = class extends THREE.Texture {};
global.THREE = THREE; global.devicePixelRatio=1; global.innerWidth=430; global.innerHeight=930;
global.matchMedia=()=>({matches:false});
const els={};
const ctx2d = () => ({ createRadialGradient(){return {addColorStop(){}}}, createLinearGradient(){return {addColorStop(){}}},
  fillRect(){}, clearRect(){}, beginPath(){}, closePath(){}, moveTo(){}, lineTo(){}, arc(){}, ellipse(){}, rect(){}, clip(){},
  fill(){}, stroke(){}, save(){}, restore(){}, translate(){}, rotate(){}, scale(){}, fillText(){}, strokeText(){},
  measureText(t){ return { width: 40 * (t ? t.length : 1) }; },
  createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}}, putImageData(){}, drawImage(){},
  set font(v){}, get font(){return '';}, set fillStyle(v){}, set strokeStyle(v){}, set lineWidth(v){},
  set lineJoin(v){}, set lineCap(v){}, set textAlign(v){}, set textBaseline(v){}, set shadowColor(v){},
  set shadowBlur(v){}, set globalCompositeOperation(v){}, set globalAlpha(v){} });
global.document={ createElement(t){ if(t==='canvas') return {width:0,height:0,getContext:ctx2d};
  const d={children:[],style:{setProperty(){},removeProperty(){}},dataset:{},title:'',className:'',hidden:false,addEventListener(){},classList:{toggle(){},add(){},remove(){},contains(){return false}},querySelector(){return this.__k||(this.__k=global.document.createElement('div'))},getBoundingClientRect(){return {left:0,top:0,width:132,height:132}},setPointerCapture(){},appendChild(c){this.children.push(c);c.parent=this},removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1)},remove(){if(this.parent)this.parent.removeChild(this)},get firstChild(){return this.children[0]},set textContent(v){},set innerHTML(v){}}; return d;},
  createElementNS(ns, t){ if(t==='img') return {addEventListener(){},removeEventListener(){},style:{},set src(v){},get src(){return '';}}; return this.createElement(t); },
  getElementById(id){ return els[id]||(els[id]=this.createElement('div')); }, body:{appendChild(){},classList:{add(){},remove(){},toggle(){}}},
  // syncSize writes the visual viewport onto :root as custom properties -- body is the
  // containing block for every fixed panel and this is what sizes it.
  documentElement:{style:{setProperty(){},removeProperty(){}}} };
global.screen={width:390,height:844};
global.getComputedStyle=()=>({getPropertyValue:()=>'0px'});   // the lens is sized against the glass, not only the viewport
let cbs=[]; global.requestAnimationFrame=f=>cbs.push(f); global.addEventListener=()=>{}; global.setInterval=()=>{}; global.setTimeout=()=>{};
global.window=global; global.location={search:''};
global.__t=0; global.performance={now:()=>global.__t};
const fs=require('fs');
const html=fs.readFileSync(process.argv[2]||'index.html','utf8');
const block=html.match(/<script>([\s\S]*?)<\/script>/g).find(b=>b.includes('const BUILD'));
let src=block.replace(/^<script>/,'').replace(/<\/script>$/,'');
const cut=src.lastIndexOf('})();');
src=src.slice(0,cut)+'global.__INTRO=INTRO;global.__DIO=DIO;'+src.slice(cut);
try { eval(src); } catch (e) { console.error('THE SCRIPT ITSELF THREW while loading:\n  ' + (e && e.stack || e)); process.exit(1); }

const N = +process.argv[3] || 8;
let ok = 0;
for (let i = 0; i < N; i++) {
  const f = cbs.shift(); if (!f) break;
  global.__t += 33;
  try { f(global.__t); ok++; }
  catch (e) {
    console.error('FRAME ' + (i + 1) + ' THREW -- this is what a stuck splash looks like:\n  '
      + (e && e.stack || e).split('\n').slice(0, 6).join('\n  '));
    process.exit(1);
  }
}
const D = global.__DIO;
console.log('intro ran ' + ok + ' frames clean | INTRO.on ' + global.__INTRO.on
  + ' | diorama built ' + !!(D && D.built) + ' | bodies ' + (D && D.bodies ? D.bodies.length : 0)
  + ' | own geometry ' + (D && D.own ? D.own.length : 0));
