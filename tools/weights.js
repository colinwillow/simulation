// WHAT DOES EACH BONE ACTUALLY MOVE?  node tools/weights.js models/thing.glb
//
// Not where the bone sits and not what it is called -- both of those can disagree with the
// weights, and when they do, no amount of reading the game code will explain the result. The
// only honest answer is the weighted centroid of the vertices each bone influences, and the
// total weight bound to it: a bone with no weight is not rigged to anything at all, however
// convincing its name and position look in a hierarchy dump.
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const draco = require('draco3dgltf');
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco.createDecoderModule(), 'draco3d.encoder': await draco.createEncoderModule() });
  const doc = await io.read(process.argv[2] || 'models/drone_rigged.glb');
  const r = doc.getRoot();
  const skin = r.listSkins()[0];
  const joints = skin.listJoints().map(j => j.getName());
  const rest = {};
  for (const j of skin.listJoints()) rest[j.getName()] = j.getTranslation();
  const prim = r.listMeshes()[0].listPrimitives()[0];
  const pos = prim.getAttribute('POSITION');
  const acc = joints.map(() => ({ x: 0, y: 0, z: 0, w: 0 }));
  const p = [], ji = [], jw = [];
  let set = 0;
  while (true) {
    const J = prim.getAttribute('JOINTS_' + set), W = prim.getAttribute('WEIGHTS_' + set);
    if (!J || !W) break;
    for (let i = 0; i < J.getCount(); i++) {
      J.getElement(i, ji); W.getElement(i, jw); pos.getElement(i, p);
      for (let k = 0; k < 4; k++) {
        const w = jw[k]; if (w <= 1e-4) continue;
        const a = acc[ji[k]]; a.x += p[0] * w; a.y += p[1] * w; a.z += p[2] * w; a.w += w;
      }
    }
    set++;
  }
  console.log('bone            rest X    the fin it MOVES (weighted centroid)   weight   verdict');
  let bad = 0;
  for (let i = 0; i < joints.length; i++) {
    const n = joints[i], a = acc[i];
    if (!/^(side|top|bottom)_(left|right)$/i.test(n)) continue;
    const cx = a.w ? a.x / a.w : 0, cy = a.w ? a.y / a.w : 0, cz = a.w ? a.z / a.w : 0;
    const rx = rest[n][0];
    // the mesh is authored Z-up under the Armature, so its lateral axis is still X
    const ok = (rx >= 0) === (cx >= 0);
    if (!ok) bad++;
    console.log('  ' + n.padEnd(14) + rx.toFixed(3).padStart(7) + '     '
      + ('(' + cx.toFixed(3) + ', ' + cy.toFixed(3) + ', ' + cz.toFixed(3) + ')').padEnd(30)
      + a.w.toFixed(1).padStart(7) + '   ' + (ok ? 'yes' : '*** NO -- it drives the OTHER side'));
  }
  console.log(bad ? '\n' + bad + ' bone(s) drive the fin on the opposite side to where they sit.'
                  : '\nevery bone drives the fin it sits next to.');
})();
