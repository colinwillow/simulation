// Take a picture of the world. Everything else in tools/ measures a number; a detail pass
// is about how the place looks, and there is no substitute for looking at it.
//
//   node tools/shot.js --out shots/meadow.png --at 40,-20 --r 34 --hour 10
//   node tools/shot.js --out shots/globe.png  --r 400 --hour 14 --wait 8
//
//   --at x,z     stand the wanderer here (default: wherever he spawns)
//   --r          camera boom length, 14..420
//   --az         camera azimuth in degrees
//   --hour       time of day, 0..24
//   --wait       seconds of world time to let settle before the shutter (default 6)
//   --w --h      canvas size (default 1280x800)
//   --tree       stand behind the biggest modelled tree, to check it goes see-through
//   --probe      also report what the sun's shadow pass costs, in calls and triangles
//   --title      shoot the title screen instead, before the world is entered
//   --intro-t    seconds along the title screen's crane to jump to (0 wide, 26 near)
//
// cdnjs is outside this container's egress, so the three.js tag is served from node_modules.
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = k => process.argv.includes('--' + k);
const ROOT = path.resolve(__dirname, '..');
const OUT = arg('out', 'shot.png');
const W = +arg('w', 1280), H = +arg('h', 800);
const WAIT = +arg('wait', 6);

// The game's script is one IIFE, so nothing inside it is reachable from the page. Splice a
// handle onto the window just before it closes -- the same trick the headless tools use.
const HOOK = 'window.__g={world,player,cam,camera,scene,renderer,MODELS,PLANET,height,groundY,biomeAt,DAY,INTRO,startGame,sun,renderPost,Q};';
function indexHTML() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const cut = html.lastIndexOf('})();');
  return html.slice(0, cut) + HOOK + html.slice(cut);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };

(async () => {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/' || url === '/index.html') {
      const b = Buffer.from(indexHTML());
      res.writeHead(200, { 'content-type': 'text/html', 'content-length': b.length }); return res.end(b);
    }
    const f = path.join(ROOT, url);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    const b = fs.readFileSync(f);
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'content-length': b.length });
    res.end(b);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;

  // The container ships one Chromium; the version playwright wants is not always the one
  // that is there, so point it at whatever is actually on disk.
  const shipped = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome']
    .find(p => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: shipped,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.route('**/cdnjs.cloudflare.com/**', route => {
    route.fulfill({ contentType: 'text/javascript',
      body: fs.readFileSync(path.join(ROOT, 'node_modules/three/build/three.min.js'), 'utf8') });
  });
  const problems = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
  page.on('pageerror', e => problems.push('PAGEERROR ' + e.message));

  await page.goto(base + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction('window.__g && window.__g.world.plants.length > 0', null, { timeout: 60000 });

  // Every model that was asked for, arrived. Without this the shot is of a world still
  // wearing its primitive stand-ins, which is exactly the thing being looked at.
  await page.waitForFunction(`(() => { const m = window.__g.MODELS;
    const k = Object.keys(m); return k.length > 4 && k.every(u => m[u].ready || m[u].failed); })()`,
    null, { timeout: 60000 }).catch(() => problems.push('not every model finished loading'));

  const at = arg('at', null), hour = arg('hour', null), r = arg('r', null), az = arg('az', null);
  // The loading card is held until the models are in, so a shot taken before it lifts is a
  // shot of the card. Wait it out.
  await page.waitForFunction('!document.getElementById("boot")', null, { timeout: 240000 }).catch(() => {});
  await page.evaluate(([at, hour, r, az, title, site, introT, tree]) => {
    const g = window.__g;
    // Stand him just past the biggest modelled tree with the camera on the far side of it,
    // which is the shot that shows whether scenery goes see-through or fills the screen.
    if (tree) {
      const ts = g.world.plants.filter(p => p.alive && p.model && p.h);
      ts.sort((a, b) => b.h - a.h);
      const t = ts[0];
      if (t) {
        const a = Math.random() * Math.PI * 2, d = 7;
        const x = t.pos.x + Math.cos(a) * d, z = t.pos.z + Math.sin(a) * d;
        g.player.pos.set(x, g.groundY(x, z) + 1, z); g.player.vx = g.player.vz = g.player.vy = 0;
        g.cam.tgt.set(x, g.player.pos.y + 3.4, z);
        g.cam.az = Math.atan2(t.pos.x - x, t.pos.z - z);
        g.cam.r = 16;
        console.log('tree ' + t.constructor.name + ' h=' + t.h.toFixed(1) + ' at ' + (t.pos.x | 0) + ',' + (t.pos.z | 0));
      } else console.warn('no modelled tree to stand behind');
    }
    if (site !== null) {
      const s = (g.world.sites || [])[+site];
      if (s) at = s.x + ',' + s.z; else console.warn('no site ' + site);
    }
    if (at) { const [x, z] = at.split(',').map(Number);
      g.player.pos.set(x, g.groundY(x, z) + 1, z); g.player.vx = g.player.vz = g.player.vy = 0;
      g.cam.tgt.set(x, g.player.pos.y + 3.4, z); }
    if (hour !== null) g.world.t = (+hour / 24) * g.DAY + Math.floor(g.world.t / g.DAY) * g.DAY;
    if (r !== null) g.cam.r = +r;
    if (az !== null) g.cam.az = +az * Math.PI / 180;
    // Every shot but --title is of the game being played, so the title screen gets started
    // the same way a player starts it.
    if (!title) g.startGame();
    // The title crane takes the better part of a minute to travel; under swiftshader that is
    // ten real ones. Jump to a point on it instead of waiting for it.
    else if (introT !== null) g.INTRO.t = +introT;
  }, [at, hour, r, az, has('title'), arg('site', null), arg('intro-t', null), has('tree')]);

  // Wall clock is meaningless here -- swiftshader runs this at a couple of frames a second,
  // so the settle is counted in world seconds like every other harness in this folder.
  const t0 = await page.evaluate(() => window.__g.world.clock);
  await page.waitForFunction(`window.__g.world.clock > ${t0 + WAIT}`, null, { timeout: 600000 });

  // What the shadow pass actually costs, measured at this exact frame rather than guessed:
  // render once with the sun casting and once without, and diff the draw calls and triangles.
  if (has('probe')) {
    const p2 = await page.evaluate(() => {
      const g = window.__g, r = g.renderer, was = g.sun.castShadow;
      const take = on => { g.sun.castShadow = on; g.renderPost(); const i = r.info.render; return { calls: i.calls, tris: i.triangles }; };
      const off = take(false), on = take(true);
      g.sun.castShadow = was;
      // and who is asking for all of it
      const seen = new Set(), by = {};
      // An invisible parent skips its whole subtree in three's shadow pass, so a creature
      // wearing a rig must not be counted for the primitive body underneath it.
      const shown = o => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
      const count = (root, tag) => { root.traverse(o => {
        if (!o.isMesh || !o.castShadow || !shown(o) || seen.has(o)) return;
        seen.add(o); const e = by[tag] || (by[tag] = { n: 0, tris: 0 });
        e.n++; const ix = o.geometry.index;
        e.tris += (ix ? ix.count : o.geometry.attributes.position.count) / 3 | 0;
      }); };
      for (const list of ['plants', 'creatures', 'structures'])
        for (const e of g.world[list]) if (e.alive && e.g) count(e.g, e.constructor.name);
      count(g.scene, 'scenery');
      const top = Object.entries(by).sort((a, b) => b[1].n - a[1].n).slice(0, 8)
        .map(([k, v]) => k + ' ' + v.n + '/' + (v.tris / 1000 | 0) + 'k');
      return { off, on, map: g.Q.shadow, top };
    });
    console.log('shadow probe: map ' + p2.map + 'px'
      + ' | no shadows ' + p2.off.calls + ' calls ' + (p2.off.tris / 1000 | 0) + 'k tris'
      + ' | shadows ' + p2.on.calls + ' calls ' + (p2.on.tris / 1000 | 0) + 'k tris'
      + ' | the pass costs ' + (p2.on.calls - p2.off.calls) + ' calls and '
      + ((p2.on.tris - p2.off.tris) / 1000 | 0) + 'k tris');
    console.log('  casters (meshes/triangles): ' + p2.top.join('  '));
  }

  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  await page.screenshot({ path: OUT });
  const info = await page.evaluate(() => {
    const g = window.__g, i = g.renderer.info.render;
    return { calls: i.calls, tris: i.triangles, plants: g.world.plants.length,
      creatures: g.world.creatures.length, at: [g.player.pos.x | 0, g.player.pos.z | 0],
      biome: g.biomeAt(g.player.pos.x, g.player.pos.z).name,
      ship: g.world.ship ? g.world.ship.state + '@' + (g.world.ship.pos.y | 0) : 'none',
      title: g.world.title ? [g.world.title.position.x|0, g.world.title.position.z|0] : 'NOT PLACED',
      sites: (g.world.sites || []).map(s => [s.x | 0, s.z | 0]), clock: g.world.clock | 0 };
  });
  console.log(OUT, JSON.stringify(info));
  for (const p of [...new Set(problems)].slice(0, 12)) console.log('  !', p);
  await browser.close(); server.close();
})();
