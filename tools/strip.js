// Take the images out of a GLB.
//
// WHY THIS EXISTS. The skin system loads a model's paint from its own .webp, so any image
// packed inside the GLB is dead weight -- it is decoded at load and then overwritten. Blender
// can be told not to write one, but where that switch lives (and whether it is even offered
// for GLB) moves between versions, and it is not worth a hunt through a menu on every export.
// The material must stay: roughness, metalness, alpha mode and double-sidedness are authored
// and there is nothing to recover them from. So this removes exactly the pixels and nothing
// else, after the fact, from whatever Blender produced.
//
//   node tools/strip.js models/drone_game/drone.rigged.glb
//   node tools/strip.js models/*.glb
//
// Rewrites in place and prints what it saved. The .blend is the source of truth; the GLB is
// a build artifact, so in-place is the right thing here.
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const draco = require('draco3dgltf');
const fs = require('fs');

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: node tools/strip.js <file.glb> [more.glb ...]'); process.exit(1); }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco.createDecoderModule(),
    'draco3d.encoder': await draco.createEncoderModule(),
  });
  let anyFail = 0;
  for (const f of files) {
    try {
      const before = fs.statSync(f).size;
      const doc = await io.read(f);
      const root = doc.getRoot();
      const textures = root.listTextures();
      if (!textures.length) { console.log(pad(f) + 'no images already  (' + kb(before) + ')'); continue; }
      // Detach every texture from every slot first, so the materials survive with their own
      // numbers intact and only the pictures go.
      for (const m of root.listMaterials()) {
        m.setBaseColorTexture(null);
        m.setMetallicRoughnessTexture(null);
        m.setNormalTexture(null);
        m.setOcclusionTexture(null);
        m.setEmissiveTexture(null);
      }
      for (const t of textures) t.dispose();
      await io.write(f, doc);
      const after = fs.statSync(f).size;
      console.log(pad(f) + textures.length + ' image' + (textures.length > 1 ? 's' : '') + ' out  '
        + kb(before) + ' -> ' + kb(after) + '  (' + (100 - after / before * 100).toFixed(0) + '% smaller)');
    } catch (e) { anyFail = 1; console.error(pad(f) + 'FAILED: ' + e.message); }
  }
  process.exit(anyFail);
})();

function kb(n) { return (n / 1024).toFixed(0) + ' kB'; }
function pad(s) { return (s.length > 44 ? '…' + s.slice(-43) : s).padEnd(46); }
