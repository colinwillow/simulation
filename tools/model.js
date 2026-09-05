// What is actually inside a model file, and will the game be able to use it.
//
//   node tools/model.js models/creature_green.glb
//   node tools/model.js export.fbx            # check the FBX before Blender ever sees it
//
// Written after an export arrived with no armature at all and the missing piece could
// not be pinned on Cinema 4D, on Blender's FBX import, or on Blender's glTF export.
// Run it on both ends of the pipeline and the answer is wherever the rig stops appearing.
const fs = require('fs');
const THREE = require('three');

// Which way the thing faces, which is the one number CREATURE_RIGS cannot guess. Walk the
// bind pose and compare the head to the hips. It has to be done with real matrices: summing
// translations up the parent chain ignores every rotation on the way, and a Mixamo rig out
// of Blender carries one on the armature to get from Z-up to Y-up. Done that way the toucan
// reads as facing -Z, because its whole skeleton sits at negative z, and the yaw would come
// out backwards. Relative to the hips, with the rotations applied, it faces +Z.
function facing(j) {
  if (!j.skins || !j.skins.length) return null;
  const N = j.nodes, par = new Map();
  N.forEach((n, i) => (n.children || []).forEach(c => par.set(c, i)));
  const local = i => { const n = N[i], m = new THREE.Matrix4();
    return n.matrix ? m.fromArray(n.matrix)
      : m.compose(new THREE.Vector3().fromArray(n.translation || [0, 0, 0]),
                  new THREE.Quaternion().fromArray(n.rotation || [0, 0, 0, 1]),
                  new THREE.Vector3().fromArray(n.scale || [1, 1, 1])); };
  const world = i => { const chain = []; let k = i;
    while (k !== undefined) { chain.push(k); k = par.get(k); }
    const m = new THREE.Matrix4();
    for (let a = chain.length - 1; a >= 0; a--) m.multiply(local(chain[a]));
    return new THREE.Vector3().setFromMatrixPosition(m); };
  const pos = {};
  for (const i of j.skins[0].joints) pos[N[i].name] = world(i);
  const names = Object.keys(pos);
  const find = re => names.find(k => re.test(k));
  const hipN = find(/hips|pelvis/i), headN = find(/headtop|head_end/i) || find(/head/i);
  if (!hipN || !headN) return null;
  const d = new THREE.Vector3().subVectors(pos[headN], pos[hipN]);
  const yaw = Math.abs(d.z) > Math.abs(d.x)
    ? (d.z > 0 ? ['+Z', '0'] : ['-Z', 'Math.PI'])
    : (d.x > 0 ? ['+X', '-Math.PI / 2'] : ['-X', 'Math.PI / 2']);
  return { from: hipN, to: headN, dx: d.x, dz: d.z, dir: yaw[0], yaw: yaw[1] };
}

const P = s => console.log(s);
const list = a => a.length ? a.join(', ') : '(none)';

// ---------- glTF / GLB ----------
function readGltf(file) {
  const buf = fs.readFileSync(file);
  if (buf.slice(0, 4).toString() === 'glTF') {
    let o = 12, j = null, bin = null;
    while (o + 8 <= buf.length) {
      const len = buf.readUInt32LE(o), typ = buf.readUInt32LE(o + 4), d = buf.slice(o + 8, o + 8 + len);
      if (typ === 0x4E4F534A) j = JSON.parse(d.toString('utf8'));
      else if (typ === 0x004E4942) bin = d;
      o += 8 + len;
    }
    return { j, bin, bytes: buf.length };
  }
  return { j: JSON.parse(buf.toString('utf8')), bin: null, bytes: buf.length };
}

// The one number a glTF never tells you and the only one that can kill the tab. A file gets
// smaller because the codec got better at it; the GPU still unpacks it to width * height * 4
// bytes plus a third again for mipmaps, and a phone has a couple of hundred megabytes for
// everything. Three 4096 maps is 340 MB and no file size on disk hints at it.
function imgSize(b) {
  if (b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') {
    const c = b.slice(12, 16).toString('ascii');
    if (c === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (c === 'VP8 ') { const s = b.indexOf(Buffer.from([0x9d, 0x01, 0x2a])); return s < 0 ? null : [b.readUInt16LE(s + 3) & 0x3fff, b.readUInt16LE(s + 5) & 0x3fff]; }
    if (c === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
    return null;
  }
  if (b[0] === 0x89 && b.slice(1, 4).toString('ascii') === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

function reportGltf(file) {
  const { j, bin, bytes } = readGltf(file);
  const nodes = j.nodes || [], meshes = j.meshes || [], anims = j.animations || [];
  const skins = j.skins || [], mats = j.materials || [];
  const bones = new Set();
  for (const s of skins) for (const jt of s.joints) bones.add(jt);

  // draco hides the real attribute names, so look inside the extension too
  const attrsOf = p => Object.keys(p.attributes || {}).concat(
    p.extensions && p.extensions.KHR_draco_mesh_compression
      ? Object.keys(p.extensions.KHR_draco_mesh_compression.attributes) : []);
  let verts = 0, skinned = false, morphs = [];
  for (const m of meshes) for (const p of m.primitives) {
    const a = attrsOf(p);
    if (a.some(k => /^JOINTS_/.test(k))) skinned = true;
    const acc = j.accessors[p.attributes.POSITION];
    if (acc) verts += acc.count;
    if (p.targets) morphs.push(p.targets.length);
  }
  const targetNames = meshes.map(m => m.extras && m.extras.targetNames).filter(Boolean)[0];

  P(`${file}  (${(bytes / 1048576).toFixed(2)} MB)`);
  P(`  generator     ${(j.asset && j.asset.generator) || '?'}`);
  P(`  extensions    ${list((j.extensionsUsed || []))}${(j.extensionsRequired || []).length ? '  [required: ' + list(j.extensionsRequired) + ']' : ''}`);
  P(`  nodes         ${nodes.length}   meshes ${meshes.length}   vertices ${verts}`);
  P(`  skin          ${skins.length ? skins.length + ' skin, ' + bones.size + ' bones' : 'NONE'}   vertex weights ${skinned ? 'yes' : 'NO'}`);
  P(`  animations    ${list(anims.map(a => a.name))}`);
  P(`  blend shapes  ${morphs.length ? morphs.join(',') + (targetNames ? '  ' + JSON.stringify(targetNames) : '') : '(none)'}`);
  for (const m of mats)
    P(`  material      ${m.name}  alphaMode=${m.alphaMode || 'OPAQUE'}  doubleSided=${!!m.doubleSided}`);

  let gpuMB = 0, biggest = 0;
  for (let i = 0; i < (j.images || []).length; i++) {
    const im = j.images[i];
    let d = null, kb = 0;
    if (bin && im.bufferView !== undefined) {
      const bv = j.bufferViews[im.bufferView], off = bv.byteOffset || 0;
      const b = bin.slice(off, off + bv.byteLength);
      d = imgSize(b); kb = bv.byteLength / 1024;
    }
    const px = d ? d[0] * d[1] : 0;
    const mb = px * 4 * 4 / 3 / 1048576;
    gpuMB += mb; biggest = Math.max(biggest, d ? Math.max(d[0], d[1]) : 0);
    P(`  texture ${String(i).padEnd(5)} ${(im.mimeType || '?').replace('image/', '').padEnd(5)} ${(d ? d[0] + 'x' + d[1] : '?').padEnd(11)} ${kb.toFixed(0).padStart(5)} KB in the file   ${mb.toFixed(1)} MB on the GPU`);
  }
  if (j.images && j.images.length) P(`  texture memory  ${gpuMB.toFixed(0)} MB if uploaded as authored`);
  const face = facing(j);
  if (face) P(`  faces         ${face.dir} (${face.to} is ${face.dz >= 0 ? '+' : ''}${face.dz.toFixed(2)}z from ${face.from}) — CREATURE_RIGS yaw: ${face.yaw}`);

  // A file with no skin and no clips is not broken, it is a prop -- and props are half the
  // world. Only judge it against what it is evidently trying to be: something that arrived
  // with a skeleton and no cycles, or cycles and no skeleton, is a creature that lost a
  // half. Something that arrived with neither is scenery, and scenery is fine.
  const real = anims.filter(a => !/^(mixamo\.com|CINEMA_4D)/i.test(a.name));
  const wantsToMove = skins.length > 0 || real.length > 0;
  const bad = [], note = [];
  if (wantsToMove) {
    if (!skins.length) bad.push('clips but no armature: nothing can deform this mesh');
    if (!skinned && skins.length) bad.push('a skin is declared but the mesh has no JOINTS_0/WEIGHTS_0');
    if (!real.length) bad.push('a skeleton but no real clips — every one is an exporter default (CINEMA_4D_Main / mixamo.com)');
  }
  if (real.length && !real.some(a => /idle/i.test(a.name))) note.push('no clip whose name contains "idle"');
  if (real.length && !real.some(a => /walk|run/i.test(a.name))) note.push('no clip whose name contains "walk" or "run"');
  if (mats.some(m => m.alphaMode === 'BLEND')) note.push('alphaMode BLEND — the game forces it opaque, but set Blend Mode to Opaque in Blender');
  if (!morphs.length && wantsToMove) note.push('no blend shapes, so no blinking');
  if (biggest > 2048) note.push(`textures are ${biggest}px — ${gpuMB.toFixed(0)} MB of GPU memory, which is why the game rescales them to 1024 on a phone. Compressing the file does not touch this; halving the pixels does. Export at 1024 or 2048 and the download shrinks too.`);

  P('');
  if (bad.length) { P('  BROKEN for the game:'); for (const b of bad) P('    - ' + b); }
  else if (!wantsToMove) P('  usable as a prop: a static mesh, which is all a plant or a rock needs');
  else P('  usable: rig, clips and weights are all present');
  if (note.length) { P('  worth knowing:'); for (const n of note) P('    - ' + n); }
  return bad.length ? 1 : 0;
}

// ---------- FBX ----------
// Only the structure matters here: did whatever wrote this file put joints, skin weights
// and takes in it? That is the question Blender's importer is answering too.
function reportFbx(file) {
  let parse;
  try { parse = require('fbx-parser'); }
  catch (e) { P('  fbx-parser not installed — run: npm install'); return 1; }
  const buf = fs.readFileSync(file);
  let root;
  try { root = parse.parseBinary(buf); }
  catch (e) { try { root = parse.parseText(buf.toString('utf8')); } catch (e2) { P('  could not parse: ' + e.message); return 1; } }

  const found = {};
  const names = {};
  (function walk(ns) {
    for (const n of ns || []) {
      found[n.name] = (found[n.name] || 0) + 1;
      // an FBX object's props are [id, "Name::Thing", subtype]
      if (n.props && n.props.length >= 3) {
        const sub = String(n.props[2] || ''), nm = String(n.props[1] || '').split('::').pop();
        (names[n.name + ':' + sub] = names[n.name + ':' + sub] || []).push(nm);
      }
      if (n.nodes) walk(n.nodes);
    }
  })(root);

  const ver = (() => {
    let v = null;
    (function w(ns) { for (const n of ns || []) { if (n.name === 'FBXVersion') v = n.props[0]; if (n.nodes) w(n.nodes); } })(root);
    return v;
  })();
  const limbs = (names['Model:LimbNode'] || []).length;
  const skins = (names['Deformer:Skin'] || []).length;
  const clusters = (names['Deformer:Cluster'] || []).length;
  const stacks = names['AnimationStack:'] || [];
  const curves = found['AnimationCurveNode'] || 0;

  P(`${file}  (${(buf.length / 1048576).toFixed(2)} MB)`);
  P(`  fbx version   ${ver || '?'}${ver && ver < 7100 ? '   <- Blender needs 7100 or later' : ''}`);
  P(`  models        ${found['Model'] || 0}   of which joints (LimbNode) ${limbs}`);
  P(`  skin          ${skins} Skin deformer(s), ${clusters} cluster(s)`);
  P(`  takes         ${list(stacks)}`);
  P(`  anim curves   ${curves}`);

  const bad = [];
  if (ver && ver < 7100) bad.push('FBX ' + ver + ' — Blender only imports 7100+; re-export as FBX 2013 or newer');
  if (!limbs) bad.push('no joints in the file: whatever moves this mesh is not a joint hierarchy, so Blender cannot build an armature from it');
  if (!skins) bad.push('no skin deformer: the mesh is not weighted to joints');
  if (!stacks.length) bad.push('no takes: no animation was written at all');
  if (!curves) bad.push('no animation curves — try "Bake All Frames" on export');
  P('');
  if (bad.length) { P('  this FBX will not give Blender an animated rig:'); for (const b of bad) P('    - ' + b); }
  else P('  joints, skin and takes are all present — if Blender shows none, suspect the import settings');
  return bad.length ? 1 : 0;
}

const files = process.argv.slice(2);
if (!files.length) { P('usage: node tools/model.js <file.glb|file.fbx> [...]'); process.exit(2); }
let rc = 0;
for (const f of files) {
  if (!fs.existsSync(f)) { P(f + ': not found'); rc = 1; continue; }
  rc |= /\.fbx$/i.test(f) ? reportFbx(f) : reportGltf(f);
  P('');
}
process.exit(rc);
