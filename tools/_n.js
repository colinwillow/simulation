const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const draco = require('draco3dgltf');
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco.createDecoderModule(), 'draco3d.encoder': await draco.createEncoderModule() });
  for (const f of process.argv.slice(2)) {
    const doc = await io.read('models/'+f+'.glb'); const r = doc.getRoot();
    const lo=[1e9,1e9,1e9], hi=[-1e9,-1e9,-1e9]; let tris=0, prims=0;
    for (const m of r.listMeshes()) for (const p of m.listPrimitives()) {
      prims++; const pos=p.getAttribute('POSITION'); if(!pos) continue;
      const idx=p.getIndices(); tris += (idx?idx.getCount():pos.getCount())/3;
      const mn=pos.getMin([]),mx=pos.getMax([]);
      for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],mn[k]);hi[k]=Math.max(hi[k],mx[k]);}
    }
    console.log(f.padEnd(26)+Math.round(tris).toString().padStart(7)+' tris  prims '+prims
      +'  size '+[hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2]].map(v=>v.toFixed(2)).join(' x ')
      +'  centre '+[0,1,2].map(k=>((lo[k]+hi[k])/2).toFixed(2)).join(',')
      +'  mats '+r.listMaterials().length+'  tex '+r.listTextures().length);
  }
})();
