// sample the height field on a grid and report the shape of the land
const fs=require('fs');
const html=fs.readFileSync(process.argv[2],'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/g).find(b=>b.includes('Lantern Isle v2'));
let body=js.replace(/^<script>/,'').replace(/<\/script>$/,'');
const start=body.indexOf('const W =');
const end=body.indexOf('// ---------- renderer ----------');
const MOBILE=false;
const seg=body.slice(start,end).replace(/const (rnd|pick)/g,'const _$1');
const mk=new Function('MOBILE',seg+'\nreturn {W,height,slope};');
const {W,height,slope}=mk(false);
let land=0,walk=0,steep=0,high=0,tot=0,maxh=-99;
const N=260, hist=new Array(10).fill(0);
for(let i=0;i<N;i++)for(let j=0;j<N;j++){
  const x=(i/(N-1)-.5)*2*W, z=(j/(N-1)-.5)*2*W;
  const h=height(x,z); tot++; maxh=Math.max(maxh,h);
  if(h>0.6){ land++;
    const sl=slope(x,z);
    if(h<15&&sl<0.9) walk++;
    if(sl>1.25) steep++;
    if(h>20) high++;
    hist[Math.min(9,Math.floor(h/8))]++;
  }
}
const cell=(2*W/N)*(2*W/N);
console.log(process.argv[3]||'');
console.log('  land area      ', (land*cell/1000).toFixed(0)+'k sq units');
console.log('  usable/walkable', (walk*cell/1000).toFixed(0)+'k  ('+(100*walk/Math.max(land,1)).toFixed(0)+'% of land)');
console.log('  above 20 units ', (100*high/Math.max(land,1)).toFixed(0)+'% of land   | peak', maxh.toFixed(0));
console.log('  too steep      ', (100*steep/Math.max(land,1)).toFixed(0)+'% of land');
console.log('  height bands 0-8,8-16,16-24,24-32,32+:', hist.slice(0,4).map(v=>(100*v/land).toFixed(0)+'%').join(' '), (100*hist.slice(4).reduce((a,b)=>a+b,0)/land).toFixed(0)+'%');
