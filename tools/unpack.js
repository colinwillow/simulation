// Pull an asset pack apart. One file in, one .glb per object out.
//
//   node tools/unpack.js models/incoming/pack.glb          # list what is in it, write nothing
//   node tools/unpack.js models/incoming/pack.glb --write  # split it into models/
//   node tools/unpack.js models/incoming/pack.glb --write --prefix hut_
//
// WHY THIS EXISTS. A low-poly pack arrives as one export with sixty objects laid out on a
// grid, all sharing one small atlas. Splitting that by hand in a DCC and exporting sixty
// files is an hour of nothing, and it is the kind of hour a script should be doing.
//
// WHAT IT DOES TO EACH OBJECT, and why:
//   * takes its NAME from the source node. Whatever the objects were called in Cinema 4D is
//     what the files are called here, so the pack stays legible. Unnamed nodes get an index.
//   * BAKES the node's transform into the vertices and clears it. On a grid layout every
//     object carries a big translation; left in place, the model arrives in the game
//     seventeen metres from its own origin and every placement is wrong.
//   * RE-CENTRES it: x and z to the middle of its own bounds, y so the base sits on zero.
//     placeProp puts box.min.y on the ground and turns the model about its origin, so an
//     off-centre origin makes a building orbit its own doorway when it is yawed.
//   * KEEPS THE ATLAS SHARED. Every output points at the same image, so a pack that was one
//     material stays one material -- and the game's own loader dedupes textures by URL, so
//     sixty buildings drawn from one 256px atlas is one upload and not sixty.
//   * PRUNES everything the object does not use, so each file carries its own mesh and
//     nothing else.
//
// FORMATS. GLB is the one to send. It is what the game loads, it carries the texture inside
// itself, and node names survive it. OBJ works but leaves the texture in a sidecar .mtl and
// has no transforms to speak of; FBX is readable here too but its transform stack (pre- and
// post-rotation, geometric offsets) is a swamp and Cinema 4D's axis conventions are its own.
// Convert to GLB at the source and none of that is anyone's problem.

const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { prune, clearNodeTransform, cloneDocument } = require('@gltf-transform/functions');
const draco = require('draco3dgltf');

const args = process.argv.slice(2);
const SRC = args.find(a => !a.startsWith('--'));
const WRITE = args.includes('--write');
const PREFIX = (args[args.indexOf('--prefix') + 1] && args.includes('--prefix')) ? args[args.indexOf('--prefix') + 1] : '';
// Z-UP PACKS. Cinema 4D and 3ds Max call Z up; glTF and this game call Y up. A pack exported
// without the conversion arrives with every tree lying on its side -- and silently, because
// placeProp scales a model by its Y extent, so a felled tree is also sized by its own width.
// Nothing about the result says "wrong axis". It just says "wrong".
const ZUP = args.includes('--up') && args[args.indexOf('--up') + 1] === 'z';
const OUT = process.env.UNPACK_OUT || path.join(__dirname, '..', 'models');

if (!SRC) {
  console.error('usage: node tools/unpack.js <pack.glb> [--write] [--prefix name_]');
  process.exit(1);
}

// A filename a person can read and a URL can carry.
const slug = (s, i) => {
  const t = String(s || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  // Tripo and most exporters emit uuid node names, which are worse than useless as filenames.
  return (!t || /^[a-f0-9_]{24,}$/.test(t) || /^(node|object|mesh|polygon)_?\d*$/.test(t))
    ? 'part_' + String(i + 1).padStart(2, '0') : t;
};

// World-space bounds of one node's meshes, after its own transform.
function boundsOf(node) {
  const m = node.getMesh();
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  if (!m) return { lo, hi, tris: 0 };
  let tris = 0;
  for (const prim of m.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const idx = prim.getIndices();
    tris += (idx ? idx.getCount() : pos.getCount()) / 3;
    const min = pos.getMin([]), max = pos.getMax([]);
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], min[k]); hi[k] = Math.max(hi[k], max[k]); }
  }
  return { lo, hi, tris: Math.round(tris) };
}

(async () => {
  // The encoder as well as the decoder: a pack that arrived Draco-compressed has to be
  // re-encoded on the way out, and without it every write fails on the last step.
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco.createDecoderModule(),
    'draco3d.encoder': await draco.createEncoderModule(),
  });
  const doc = await io.read(SRC);
  const root = doc.getRoot();

  // Every node that actually carries geometry, wherever it sits in the hierarchy. A pack laid
  // out on a grid is usually flat, but a nested one should not be missed.
  const parts = [];
  root.listNodes().forEach(n => { if (n.getMesh()) parts.push(n); });

  console.log(path.basename(SRC) + ': ' + parts.length + ' objects, '
    + root.listMaterials().length + ' materials, ' + root.listTextures().length + ' textures');
  for (const t of root.listTextures()) {
    const img = t.getImage();
    console.log('  atlas: ' + (t.getName() || '(unnamed)') + '  ' + (t.getMimeType() || '?')
      + '  ' + (img ? (img.byteLength / 1024).toFixed(0) + ' KB' : '—'));
  }
  // Which way is up, guessed from the layout: a grid of props spreads across the two ground
  // axes and is shallow in the vertical one, so the axis with the LEAST spread of object
  // positions is up. Advice, not action -- a wrong guess here ruins every asset silently, so
  // the turn stays behind a flag and this only tells you which flag to pass.
  {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const n of parts) { const t = n.getTranslation();
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], t[k]); hi[k] = Math.max(hi[k], t[k]); } }
    const sp = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const up = sp.indexOf(Math.min(...sp));
    console.log('  layout spread  X ' + sp[0].toFixed(0) + '  Y ' + sp[1].toFixed(0) + '  Z ' + sp[2].toFixed(0)
      + '   -> looks ' + 'XYZ'[up] + '-up' + (up === 2 && !ZUP ? '   ** pass --up z **' : ''));
  }
  console.log('');
  console.log('  ' + 'file'.padEnd(30) + 'tris'.padStart(7) + '    size (w x h x d)'
    + (ZUP ? '   [turned Y-up]' : ''));

  const used = new Set();
  for (let i = 0; i < parts.length; i++) {
    const node = parts[i];
    let name = PREFIX + slug(node.getName(), i);
    while (used.has(name)) name = name + '_b';
    used.add(name);

    const b = boundsOf(node);
    // Report the size the GAME will see, which after a Z-up turn is not the size in the file.
    const raw = [b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]];
    const w = raw[0], h = ZUP ? raw[2] : raw[1], d = ZUP ? raw[1] : raw[2];
    console.log('  ' + (name + '.glb').padEnd(30) + String(b.tris).padStart(7)
      + '    ' + [w, h, d].map(v => (isFinite(v) ? v.toFixed(2) : '?')).join(' x '));
    if (!WRITE) continue;

    // Clone the whole document and cut it down to this one object, rather than building a new
    // document and copying properties across: the clone brings the material, the atlas and
    // every extension with it already wired up, and prune throws away what is left over.
    const one = cloneDocument(doc);
    const nodes = one.getRoot().listNodes();
    const keep = nodes[root.listNodes().indexOf(node)];
    for (const n of nodes) if (n !== keep) n.dispose();
    for (const sc of one.getRoot().listScenes()) if (!sc.listChildren().includes(keep)) sc.addChild(keep);

    // Bake the grid position into the vertices, then sit the object on its own origin and
    // bake that too, so the file that lands has an identity transform and its geometry
    // already where it belongs. (clearNodeTransform takes a node, not a document.)
    clearNodeTransform(keep);
    if (ZUP) {
      // A quarter turn about X: (x, y, z) -> (x, z, -y). Baked, so what lands is a Y-up file
      // with an identity transform and nothing downstream has to know a conversion happened.
      keep.setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
      clearNodeTransform(keep);
    }
    const bb = boundsOf(keep);
    if (isFinite(bb.lo[0])) {
      keep.setTranslation([-(bb.lo[0] + bb.hi[0]) / 2, -bb.lo[1], -(bb.lo[2] + bb.hi[2]) / 2]);
      clearNodeTransform(keep);
    }
    await one.transform(prune());
    await io.write(path.join(OUT, name + '.glb'), one);
  }

  console.log('');
  if (WRITE) console.log('wrote ' + parts.length + ' files to models/');
  else console.log('nothing written. add --write to split it.');
})();
