// sample the height field on a grid and report the shape of the land
const fs=require('fs'), THREE=require('three');   // the slice now carries the planet projection, which builds vectors
const html=fs.readFileSync(process.argv[2],'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/g).find(b=>b.includes('Lantern Isle v2'));
let body=js.replace(/^<script>/,'').replace(/<\/script>$/,'');
const start=body.indexOf('const W =');
const end=body.indexOf('// ---------- renderer ----------');
const MOBILE=false;
const seg=body.slice(start,end).replace(/const (rnd|pick)/g,'const _$1');
const mk=new Function('MOBILE','THREE',seg+'\nreturn {W,height,slope,PLANET,planetPos,planetChart};');
const {W,height,slope,PLANET,planetPos,planetChart}=mk(false,THREE);
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

// The projection. Distance out from the chart origin is exact by construction, so what is
// worth reporting is the squeeze *around* it -- the one thing the wrap actually costs -- and
// that a world point taken back to the chart lands where it started.
{
  const V = THREE.Vector3;
  let worst = 0;
  for (let i = 1; i <= 600; i++) {
    const a = i * 2.399, r = (i / 600) * PLANET.rMax * .92, y = ((i % 7) - 3) * 9;
    const x0 = Math.cos(a) * r, z0 = Math.sin(a) * r;
    const c = planetChart(planetPos(x0, y, z0, new V()), new V());
    worst = Math.max(worst, Math.hypot(c.x - x0, c.y - y, c.z - z0));
  }
  console.log(`\n  planet R ${PLANET.R}, circumference ${(2 * Math.PI * PLANET.R).toFixed(0)}, far pole at chart r ${PLANET.rMax.toFixed(0)}`);
  console.log(`  world -> chart round trip, worst of 600: ${worst.toExponential(1)} units\n`);
  console.log('  chart r   arc      spacing around the pole');
  for (const r of [0, 60, 120, 240, 360, 480, 600, 700]) {
    const th = r / PLANET.R;
    console.log(`  ${String(r).padStart(7)}   ${(th * 57.2958).toFixed(0).padStart(3)}°     x${(r ? Math.sin(th) / th : 1).toFixed(2)}`);
  }
}
