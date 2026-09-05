const THREE=require('three'), fs=require('fs'), {execFileSync}=require('child_process');
const html=fs.readFileSync(process.argv[2]||'index.html','utf8');
// pull the water onBeforeCompile out of the file and run it against three's real shader
const js=html.match(/<script>([\s\S]*?)<\/script>/g).find(b=>b.includes('const BUILD'));
const body=js.replace(/^<script>/,'').replace(/<\/script>$/,'');
const start=body.indexOf('waterMat.onBeforeCompile = sh => {');
const end=body.indexOf('const waterUni = {');
const src=body.slice(start,end);
const MOBILE=false;
const sh={uniforms:{}, vertexShader:THREE.ShaderLib.physical.vertexShader, fragmentShader:THREE.ShaderLib.physical.fragmentShader};
// the projection chunk the water shader now leans on, lifted from the page the same way
const PLANET_GLSL=(()=>{const i=body.indexOf('const PLANET_GLSL = `'), j=body.indexOf('`;', i);
  return body.slice(i+'const PLANET_GLSL = `'.length, j).replace(/\$\{[^}]*\}/g,'240.0000');})();
const waterUni={uT:{value:0},uW:{value:[]},uWk:{value:[]},uSky:{value:0}};
const waterMat={}; eval(src); waterMat.onBeforeCompile(sh);
function resolve(s){ let out=s, prev;
  do{ prev=out; out=out.replace(/^[ \t]*#include +<([\w\d.\/]+)>/gm,(m,n)=>THREE.ShaderChunk[n]!==undefined?THREE.ShaderChunk[n]:''); }while(out!==prev);
  return out; }
const pre=`#version 100
#extension GL_OES_standard_derivatives : enable
precision highp float;
precision highp int;
#define SHADER_NAME water
#define STANDARD
#define USE_FOG
#define FOG_EXP2
#define GAMMA_FACTOR 2.0
#define NUM_DIR_LIGHTS 3
#define NUM_POINT_LIGHTS 2
#define NUM_SPOT_LIGHTS 0
#define NUM_RECT_AREA_LIGHTS 0
#define NUM_HEMI_LIGHTS 1
#define NUM_DIR_LIGHT_SHADOWS 1
#define NUM_POINT_LIGHT_SHADOWS 0
#define NUM_SPOT_LIGHT_SHADOWS 0
#define UNION_CLIPPING_PLANES 0
#define NUM_CLIPPING_PLANES 0
#define TONE_MAPPING
#define saturate(a) clamp(a,0.0,1.0)
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
uniform bool isOrthographic;
`+THREE.ShaderChunk.tonemapping_pars_fragment+"\n"+THREE.ShaderChunk.encodings_pars_fragment+`
vec4 linearToOutputTexel(vec4 v){return v;}
vec3 toneMapping(vec3 c){return c;}
`;
const frag=pre+resolve(sh.fragmentShader);
fs.writeFileSync('/tmp/water.frag',frag);
const plat={linux:'linux',darwin:'darwin',win32:'exe'}[process.platform]||'linux';
const bin='node_modules/glslang-validator-prebuilt-predownloaded/bin/glslangValidator.'+plat;
try{ execFileSync('chmod',['+x',bin]); }catch(e){}
try{ const out=execFileSync(bin,['-S','frag','/tmp/water.frag'],{encoding:'utf8'}); console.log('CLEAN\n'+out); }
catch(e){ const o=(e.stdout||'')+(e.stderr||'');
  const lines=o.split('\n').filter(l=>/ERROR/.test(l)).slice(0,14);
  console.log(lines.join('\n')||o.slice(0,900));
  // show the offending source lines
  const src2=frag.split('\n');
  for(const l of lines){ const m=l.match(/:(\d+):/); if(m){ const n=+m[1]; console.log('   line '+n+': '+(src2[n-1]||'').trim()); } }
}

// ---------- and every raw ShaderMaterial in the file ----------
// The water material is compiled above because it is an injection into three's own physical
// shader and needs the chunk machinery. Everything else -- the sky, the stars, the motes,
// the foam, the flames -- is a raw ShaderMaterial with its whole source in the page, and
// none of it was checked by anything until a `uHigh` added to a uniforms object and used in
// the fragment source, but never declared in it, shipped a sky that would not compile.
//
// Raw ShaderMaterials get their built-ins from three rather than from their own source, so
// the preludes below are what three prepends. An `${...}` in a template is replaced with a
// float literal: every one in this file interpolates a number.
const VERT_PRE = `#version 100
precision highp float;
precision highp int;
#define SHADER_NAME raw
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;
uniform vec3 cameraPosition;
uniform bool isOrthographic;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
`;
const FRAG_PRE = `#version 100
#extension GL_OES_standard_derivatives : enable
precision highp float;
precision highp int;
#define SHADER_NAME raw
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
uniform bool isOrthographic;
`;
// Find `vertexShader:` / `fragmentShader:` followed by a template literal, optionally with
// a constant concatenated in front of it (`PLANET_GLSL + \`...\``).
function rawShaders(src) {
  const out = [], re = /(vertexShader|fragmentShader)\s*:\s*(?:([A-Za-z_$][\w$]*)\s*\+\s*)?`/g;
  let m;
  while ((m = re.exec(src))) {
    let i = re.lastIndex, depth = 0, end = -1;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '\\') { i++; continue; }
      if (c === '$' && src[i + 1] === '{') { depth++; i++; continue; }
      if (c === '}' && depth) { depth--; continue; }
      if (c === '`' && !depth) { end = i; break; }
    }
    if (end < 0) continue;
    out.push({ kind: m[1], pre: m[2] || '', code: src.slice(re.lastIndex, end), at: m.index });
    re.lastIndex = end + 1;
  }
  return out;
}
function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }
let bad = 0, checked = 0;
for (const sh2 of rawShaders(body)) {
  let code = sh2.code.replace(/\$\{[^}]*\}/g, '240.0000');
  if (sh2.pre === 'PLANET_GLSL') code = PLANET_GLSL + '\n' + code;
  else if (sh2.pre) continue;                       // concatenated with something we cannot see
  if (/^\s*$/.test(code) || !/void\s+main/.test(code)) continue;
  let pre = sh2.kind === 'vertexShader' ? VERT_PRE : FRAG_PRE;
  // three declares these for you; only add one the source does not declare itself
  if (sh2.kind === 'vertexShader' && /\bcolor\b/.test(code) && !/attribute\s+vec3\s+color/.test(code))
    pre += 'attribute vec3 color;\n';
  const full = pre + resolve(code);
  const f = '/tmp/raw' + checked + '.' + (sh2.kind === 'vertexShader' ? 'vert' : 'frag');
  fs.writeFileSync(f, full);
  checked++;
  try { execFileSync(bin, ['-S', sh2.kind === 'vertexShader' ? 'vert' : 'frag', f], { encoding: 'utf8' }); }
  catch (e) {
    bad++;
    const o = (e.stdout || '') + (e.stderr || '');
    console.log('\n' + sh2.kind + ' at index.html line ' + lineOf(body, sh2.at) + ':');
    const lines = o.split('\n').filter(l => /ERROR/.test(l)).slice(0, 8);
    console.log(lines.join('\n') || o.slice(0, 600));
    const srcL = full.split('\n');
    for (const l of lines) { const mm = l.match(/:(\d+):/); if (mm) console.log('   ' + (srcL[+mm[1] - 1] || '').trim()); }
  }
}
console.log(bad ? '\n' + bad + ' of ' + checked + ' raw shaders FAILED' : checked + ' raw shaders CLEAN');
if (bad) process.exitCode = 1;
