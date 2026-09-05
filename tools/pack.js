#!/usr/bin/env node
// Squeeze a model down to what should actually ship, in place.
//
//   npm run pack models/alien_plant_02.glb        # one file
//   npm run pack models/*.glb                     # or all of them
//   npm run pack -- --size 2048 models/ship.glb   # a bigger ceiling for the hero object
//
// Three things, none of which touch the mesh:
//   * textures down to a maximum dimension (1024 by default, and pixels are what cost GPU
//     memory -- a 4096 map is 85 MB however small the file is)
//   * textures to webp, which is a quarter of a jpeg at the same size
//   * geometry through Draco, which is a quarter of the raw buffers
//
// Simplification is off. It is the one part of `gltf-transform optimize` that changes what
// you modelled, and it is not this tool's business to decimate anything silently.
//
// This exists because a model straight off a generator is a perfectly good model that
// happens to be four times bigger than it needs to be: 491 KB against 124 for the same
// 2,254 triangles and the same 5.3 MB of GPU memory. The mesh is not the problem, the
// packaging is, and packaging does not need a trip through Blender.
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const args = process.argv.slice(2);
let size = 1024;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--size') { size = +args[++i]; continue; }
  files.push(args[i]);
}
if (!files.length) { console.log('usage: npm run pack [-- --size 2048] <file.glb> [...]'); process.exit(1); }

const kb = n => (n / 1024).toFixed(0).padStart(5) + ' KB';
let before = 0, after = 0;
for (const f of files) {
  if (!fs.existsSync(f)) { console.log(f + ': not found'); continue; }
  const b0 = fs.statSync(f).size;
  const tmp = path.join(os.tmpdir(), 'pack-' + path.basename(f));
  try {
    execFileSync('npx', ['gltf-transform', 'optimize', f, tmp,
      '--texture-compress', 'webp', '--texture-size', String(size),
      '--compress', 'draco', '--simplify', 'false'], { stdio: 'pipe' });
  } catch (e) {
    console.log(path.basename(f).padEnd(26) + ' FAILED: ' + String(e.stderr || e).slice(0, 200));
    continue;
  }
  const b1 = fs.statSync(tmp).size;
  fs.copyFileSync(tmp, f); fs.unlinkSync(tmp);
  before += b0; after += b1;
  console.log(path.basename(f).padEnd(26) + kb(b0) + '  ->' + kb(b1) +
    '   ' + (b0 > b1 ? '-' + (100 - b1 / b0 * 100).toFixed(0) + '%' : 'no change'));
}
if (files.length > 1) console.log(''.padEnd(26) + kb(before) + '  ->' + kb(after) +
  '   -' + (100 - after / before * 100).toFixed(0) + '% overall');
console.log('\nRun `npm run check:model <file>` after, to see what it is now.');
