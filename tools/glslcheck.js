const THREE=require('three'), fs=require('fs'), {execFileSync}=require('child_process');
const html=fs.readFileSync(process.argv[2]||'index.html','utf8');
// pull the water onBeforeCompile out of the file and run it against three's real shader
const js=html.match(/<script>([\s\S]*?)<\/script>/g).find(b=>b.includes('Lantern Isle v2'));
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
