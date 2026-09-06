// Take a picture of the world. Everything else in tools/ measures a number; a detail pass
// is about how the place looks, and there is no substitute for looking at it.
//
//   node tools/shot.js --out shots/meadow.png --at 40,-20 --r 34 --hour 10
//   node tools/shot.js --out shots/globe.png  --r 400 --hour 14 --wait 8
//
//   --at x,z     stand the wanderer here (default: wherever he spawns)
//   --r          camera boom length, 14..420
//   --az         camera azimuth in degrees
//   --pol        camera pitch, in degrees off straight down (the walking camera is 73)
//   --hour       time of day, 0..24
//   --wait       seconds of world time to let settle before the shutter (default 6)
//   --w --h      canvas size (default 1280x800)
//   --tree       stand behind the biggest modelled tree, to check it goes see-through
//   --near X     stand beside the nearest plant of class X (Bloom, Mushroom, LanternTree...)
//   --vibe       report whether a rigged plant's procedural joints are actually turning
//   --probe      also report what the sun's shadow pass costs, in calls and triangles
//   --palette    report what the frame is made of: hue spread, saturation, value range
//   --weapon     draw the blaster, aim at the nearest animal, and report the lock and the shot
//   --strafe     draw, aim one way, walk the other, and report which armed clips are running
//   --bolt       draw, charge a full shot, fire, and frame the plasma in flight
//   --carry      stand by an animal, pick it up, walk with it, and put it down again
//   --drone      frame the drone itself, close, to see what is glowing on it
//   --base       stand under the lander
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
const HOOK = 'window.__g={world,player,cam,camera,scene,renderer,MODELS,PLANET,height,groundY,biomeAt,DAY,INTRO,startGame,sun,renderPost,Q,vibeStep,VIBE,ENV,stick,weap,WEAPON,toggleArm,Bolt,isle,DRONE,camS,GIMBAL,muzzleChart,RIG,skyUni,ACT,CARRY};';
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
  await page.evaluate(([at, hour, r, az, title, site, introT, tree, near, vault]) => {
    const g = window.__g;
    if (near) {
      const c = g.world.plants.filter(p => p.alive && p.constructor.name === near && p.model);
      if (c.length) {
        const t = c[0], a = Math.random() * Math.PI * 2, d = 5.5;
        const x = t.pos.x + Math.cos(a) * d, z = t.pos.z + Math.sin(a) * d;
        g.player.pos.set(x, g.groundY(x, z) + 1, z); g.player.vx = g.player.vz = g.player.vy = 0;
        g.cam.tgt.set(x, g.player.pos.y + 3.4, z);
        g.cam.az = Math.atan2(t.pos.x - x, t.pos.z - z); g.cam.r = 15;
        console.log(near + ' at ' + (t.pos.x | 0) + ',' + (t.pos.z | 0) + ' vibe joints ' + (t.vibe ? t.vibe.length : 0));
      } else console.warn('no modelled ' + near + ' in this world');
    }
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
    if (vault && g.world.lander) { const v = g.world.lander; at = (v.pos.x + 2) + ',' + (v.pos.z + 2); }
    else if (vault) console.warn('no lander in this world');
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
  }, [at, hour, r, az, has('title'), arg('site', null), arg('intro-t', null), has('tree'), arg('near', null), has('vault') || has('base')]);

  // Wall clock is meaningless here -- swiftshader runs this at a couple of frames a second,
  // so the settle is counted in world seconds like every other harness in this folder.
  const t0 = await page.evaluate(() => window.__g.world.clock);
  await page.waitForFunction(`window.__g.world.clock > ${t0 + WAIT}`, null, { timeout: 600000 });

  // The landing flies the camera down to the walking view, boom and all, so a --r set before
  // startGame() is overwritten a few seconds later by the dive. Every wide shot taken with
  // this tool since the title screen went in was secretly at the default twenty units, which
  // is how a picture of the whole building came back as a picture of the inside of one wall.
  // Ask again once the descent is over, and let it settle.
  if (r !== null || az !== null || arg('pol', null) !== null) {
    await page.evaluate(([r, az]) => { const g = window.__g;
      if (r !== null) g.cam.r = +r;
      if (az !== null) g.cam.az = +az * Math.PI / 180;
      g.cam.idle = 0;
    }, [r, az]);
    if (arg('pol', null) !== null) {
      // The walking pitch is a constant the weather leans, so holding a different one means
      // holding it every frame rather than setting it once.
      await page.evaluate(p => { const g = window.__g;
        g.__holdPol = +p * Math.PI / 180;
        if (!g.__polHeld) { g.__polHeld = 1; setInterval(() => { g.cam.pol0 = g.cam.pol = g.__holdPol; g.cam.polBias = 0; }, 8); }
      }, arg('pol', null));
    }
    const t1 = await page.evaluate(() => window.__g.world.clock);
    await page.waitForFunction(`window.__g.world.clock > ${t1 + 4}`, null, { timeout: 600000 });
  }

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

  // What the frame is actually made of, in colour. "It looks like a mess" is a real note but
  // not an actionable one; this turns it into numbers -- where the hues sit, how saturated
  // they are, and how much of the value range is being used. A frame with one dominant hue,
  // a couple of accents and a wide value spread reads as art directed. A flat histogram with
  // everything at the same lightness reads as a pile of assets.
  // What a skinned plant actually costs per frame, so the question "can we rig all of them?"
  // gets a number instead of a shrug. Times the three things a rigged plant adds -- the
  // wobble itself, the bone matrix walk, and the skeleton's per-frame texture upload -- and
  // scales them to however many plants there are.
  if (has('skincost')) {
    const c = await page.evaluate(() => {
      const g = window.__g;
      const rigged = g.world.plants.filter(p => p.alive && p.vibe);
      if (!rigged.length) return null;
      const sk = [];
      for (const p of rigged) p.model.traverse(o => { if (o.isSkinnedMesh) sk.push(o); });
      const bones = sk.reduce((n, m) => n + m.skeleton.bones.length, 0);
      const time = (n, f) => { const t0 = performance.now(); for (let i = 0; i < n; i++) f(); return (performance.now() - t0) / n; };
      const N = 400;
      const wob = time(N, () => { for (const p of rigged) g.vibeStep(p.vibe, g.world.clock, null); });
      const mat = time(N, () => { for (const p of rigged) p.model.updateMatrixWorld(true); });
      const upd = time(N, () => { for (const m of sk) m.skeleton.update(); });
      return { plants: rigged.length, meshes: sk.length, bones, wob, mat, upd, total: g.world.plants.length };
    });
    if (!c) console.log('skincost: nothing rigged in this world');
    else {
      const per = (c.wob + c.mat + c.upd) / c.plants;
      console.log('skincost: ' + c.plants + ' rigged plants, ' + c.bones + ' bones, '
        + (c.wob + c.mat + c.upd).toFixed(2) + ' ms/frame'
        + ' (wobble ' + c.wob.toFixed(2) + ', matrices ' + c.mat.toFixed(2) + ', skeletons ' + c.upd.toFixed(2) + ')');
      console.log('  = ' + (per * 1000).toFixed(0) + ' microseconds per plant, so all '
        + c.total + ' rigged would be about ' + (per * c.total).toFixed(1) + ' ms/frame of CPU'
        + ' (a 60fps budget is 16.7)');
    }
  }

  // Are the procedural joints actually turning? A still frame cannot tell you, so sample a
  // rigged plant's bones across a second of world time and report the widest swing in degrees.
  // Two questions a still frame cannot answer: is anything moving, and is it moving more than
  // it is allowed to? Sample a rigged plant across a stretch of world time and report the
  // widest departure from the bind pose on any axis of any joint -- and list every bone in the
  // model that is *not* being driven, so "you are only rotating the ones I labelled" is a
  // thing that can be checked rather than asserted.
  if (has('vibe')) {
    const peak = await page.evaluate(async () => {
      const g = window.__g, p = g.world.plants.find(q => q.alive && q.vibe);
      if (!p) return null;
      const driven = new Set(p.vibe.map(j => j.b));
      const all = [], skipped = [];
      p.model.traverse(o => { if (o.isBone) { all.push(o.name); if (!driven.has(o)) skipped.push(o.name); } });
      // walk the wobble through a couple of full cycles of the slowest joint, off-clock, so
      // the answer does not depend on how many frames the harness happened to render
      let worst = 0, moved = 0;
      const seen = p.vibe.map(() => 0);
      for (let i = 0; i <= 600; i++) {
        g.vibeStep(p.vibe, i * 0.08, null);
        p.vibe.forEach((j, k) => {
          const d = Math.max(Math.abs(j.b.rotation.x - j.r.x),
                             Math.abs(j.b.rotation.y - j.r.y),
                             Math.abs(j.b.rotation.z - j.r.z));
          if (d > seen[k]) seen[k] = d;
        });
      }
      for (const d of seen) { worst = Math.max(worst, d); if (d > 1e-4) moved++; }
      return { n: p.vibe.length, bones: all.length, skipped, worst: worst * 180 / Math.PI, moved,
        cap: g.VIBE.deg, wind: g.world && g.__wx ? 0 : 0 };
    });
    if (!peak) console.log('vibe: no rigged plant in this world');
    else {
      console.log('vibe: driving ' + peak.n + ' of ' + peak.bones + ' bones, ' + peak.moved + ' of them moving');
      console.log('  widest departure from bind, any joint any axis: ' + peak.worst.toFixed(1)
        + ' degrees (cap ' + peak.cap + ')' + (peak.worst > peak.cap + .05 ? '   *** OVER THE CAP ***' : '   within cap'));
      console.log('  not driven: ' + (peak.skipped.join(', ') || '(none)'));
    }
  }

  // Draw, aim at the nearest animal, hold, then let go -- the exact sequence a thumb does,
  // driven through the same stick object the touch handlers write to. What comes back is
  // whether the model hung on the joint, whether the assist found anything, and whether a
  // bolt actually left the barrel and hit something.
  if (has('weapon')) {
    const step = async (secs) => { const t = await page.evaluate(() => window.__g.world.clock);
      await page.waitForFunction(`window.__g.world.clock > ${t + secs}`, null, { timeout: 600000 }); };
    const pre = await page.evaluate(() => {
      const g = window.__g, p = g.player;
      // stand him near an animal, facing it, so the cone has something in it
      const c = g.world.creatures.filter(o => o.alive && !o.aquatic && !o.flying)
        .sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0];
      if (c) { const a = Math.atan2(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
        const d = 26, x = c.pos.x - Math.sin(a) * d, z = c.pos.z - Math.cos(a) * d;
        p.pos.set(x, g.groundY(x, z) + 1, z); p.vx = p.vz = p.vy = 0;
        g.cam.tgt.set(x, p.pos.y + 3.4, z); g.cam.az = a + Math.PI; }
      g.toggleArm();
      return { bone: !!g.weap.bone, tip: !!g.weap.tip, model: !!g.weap.model,
        rifleClips: Object.keys(p.rigH ? p.rigH.acts : {}).filter(k => /rifle/.test(k)),
        aimingAt: c ? c.constructor.name + ' at ' + (c.pos.distanceTo(p.pos) | 0) : 'nothing' };
    });
    // The blaster is asked for only once the rig has attached, so it can still be in flight
    // when the harness reaches for it -- keep asking until the button exists.
    for (let i = 0; i < 20; i++) {
      const on = await page.evaluate(() => { const g = window.__g;
        if (!g.player.armWant) g.toggleArm();
        return !!g.player.armWant; });
      if (on) break;
      await step(1);
    }
    await step(1.2);
    const held = await page.evaluate(() => {                 // push the stick straight ahead
      const g = window.__g; g.stick.R.x = 0; g.stick.R.y = -1;
      return { armed: +g.player.armed.toFixed(2), visible: !!(g.weap.model && g.weap.model.visible) };
    });
    await step(1.4);
    const aim = await page.evaluate(() => {
      const g = window.__g, p = g.player;
      return { aiming: p.aiming, lock: p.lock ? p.lock.constructor.name : 'none',
        charge: +p.charge.toFixed(2), chargeOrbShowing: !!(g.weap.fx && g.weap.fx.g.visible),
        offBy: p.lock ? Math.abs(Math.atan2(Math.sin(Math.atan2(p.lock.pos.x - p.pos.x, p.lock.pos.z - p.pos.z) - p.aimH),
                                            Math.cos(Math.atan2(p.lock.pos.x - p.pos.x, p.lock.pos.z - p.pos.z) - p.aimH))) * 180 / Math.PI : null,
        retic: !document.getElementById('retic').hidden,
        camBehind: Math.abs(Math.atan2(Math.sin(p.aimH + Math.PI - g.cam.az), Math.cos(p.aimH + Math.PI - g.cam.az))) * 180 / Math.PI };
    });
    await page.evaluate(() => { window.__g.stick.R.x = window.__g.stick.R.y = 0; });   // let go: fire
    const shot = await page.evaluate(() => {
      const g = window.__g, p = g.player;
      // Where the shot actually leaves him, in his own frame: how far in front, how far to
      // the side, how far up. "It comes out off to the left" is a real note and this is the
      // number behind it -- a blaster held in the right hand should read a little to the
      // right and about chest high, not out past his shoulder.
      const m = g.weap.lastMuzzle;          // where the bolt actually left, not where the bone is
      const dx = m.x - p.pos.x, dz = m.z - p.pos.z;
      const c = Math.cos(p.faceH), sn = Math.sin(p.faceH);
      const b = g.world.effects.filter(e => e instanceof g.Bolt);
      return { bolts: b.length, shootT: +p.shootT.toFixed(2),
        muzzle: { ahead: +(dx * sn + dz * c).toFixed(2), toTheRight: +(dx * c - dz * sn).toFixed(2),
          up: +(m.y - p.pos.y).toFixed(2), ofAHeightOf: g.RIG.height },
        bodyVsAim: Math.round(Math.atan2(Math.sin(p.faceH - p.aimH), Math.cos(p.faceH - p.aimH)) * 57.3) };
    });
    // catch the bolt mid-flight for the picture, and read its charged size off it
    await step(.5);
    const flight = await page.evaluate(() => {
      const g = window.__g, b = g.world.effects.find(e => e instanceof g.Bolt);
      if (!b) return { none: true };
      g.cam.tgt.set(b.x, b.y + 1, b.z); g.cam.r = 14;      // frame the shot in flight
      return { size: +b.size.toFixed(2), rad: +b.rad.toFixed(2), blast: +b.blast.toFixed(1),
        charge: +b.c.toFixed(2), trailLit: b.trail.filter(s => s.material.opacity > .02).length };
    });
    if (!flight.none) console.log('  bolt in flight: charge ' + flight.charge + ', size ' + flight.size
      + ', blast ' + flight.blast + ', ' + flight.trailLit + ' trail sprites lit');
    await step(2.0);
    const after = await page.evaluate(() => {
      const g = window.__g;
      return { bolts: g.world.effects.filter(e => e instanceof g.Bolt).length,
        alarmed: g.world.creatures.filter(o => o.alive && o.alarm > 0).length };
    });
    console.log('weapon: joint ' + (pre.bone ? 'found' : 'MISSING') + ', muzzle ' + (pre.tip ? 'found' : 'MISSING')
      + ', model ' + (pre.model ? 'hung' : 'NOT LOADED') + ' | clips ' + (pre.rifleClips.join(' ') || 'NONE'));
    console.log('  drawn to ' + held.armed + ', blaster ' + (held.visible ? 'visible' : 'HIDDEN') + ' | pointed at ' + pre.aimingAt);
    console.log('  aiming ' + aim.aiming + ' | locked ' + aim.lock
      + (aim.offBy === null ? '' : ', shot is ' + aim.offBy.toFixed(1) + ' deg off the bearing')
      + ' | reticle ' + (aim.retic ? 'up' : 'down') + ' | camera ' + aim.camBehind.toFixed(0) + ' deg off the aim');
    console.log('  charge held to ' + aim.charge + ', orb ' + (aim.chargeOrbShowing ? 'showing' : 'HIDDEN'));
    console.log('  muzzle sits ' + shot.muzzle.ahead + ' ahead, ' + shot.muzzle.toTheRight
      + ' to the right, ' + shot.muzzle.up + ' up (he is ' + shot.muzzle.ofAHeightOf + ' tall)'
      + ' | body is ' + shot.bodyVsAim + ' deg off the aim');
    console.log('  released: ' + shot.bolts + ' bolt in flight, recoil ' + shot.shootT + 's'
      + ' | after 2.5s ' + after.bolts + ' left, ' + after.alarmed + ' animals alarmed');
    // put the gun back up for the picture, and come in close enough to see it
    await page.evaluate(() => { const g = window.__g; g.stick.R.y = -1; g.cam.r = 7; });
    await step(2);
  }

  // What is actually glowing around him. "There are eight white blobs in the frame" is a
  // real note; this says which objects they are.
  if (has('bright')) {
    const b = await page.evaluate(() => {
      const g = window.__g, p = g.player, out = [];
      g.scene.traverse(o => {
        if (!o.visible) return;
        const w = o.getWorldPosition(new THREE.Vector3());
        const pw = g.planetPos ? null : null;
        const hot = (o.isSprite) || (o.material && !Array.isArray(o.material) && o.material.emissiveIntensity > .8);
        if (!hot) return;
        for (let n = o; n; n = n.parent) if (!n.visible) return;
        out.push({ n: o.name || o.type, sp: !!o.isSprite, s: +o.scale.x.toFixed(2),
          c: o.material && o.material.color ? '#' + o.material.color.getHexString() : '', y: +w.y.toFixed(1) });
      });
      const near = [];
      for (const ps of g.world.psys) near.push({ psys: ps.pts ? ps.pts.geometry.attributes.position.count : 0, rate: +(ps.rate || 0).toFixed(0) });
      // Anything riding with him must be opted out of the see-through hole, or it dissolves
      // along with the scenery whenever the camera comes in close. Report it rather than
      // trusting it: the hole is decided at shader-compile time off userData.noHole.
      const holes = [];
      const check = (root, tag) => { if (!root) return holes.push(tag + ': MISSING');
        const bad = []; root.traverse(o => { for (const m of [].concat(o.material || []))
          if (m && !m.userData.noHole) bad.push(m.name || m.type); });
        holes.push(tag + ': ' + (bad.length ? bad.length + ' material(s) STILL CUT BY THE HOLE' : 'opted out')); };
      check(p.drone, 'drone'); check(g.weap.model, 'blaster'); check(p.rig, 'body');
      return { holes, drone: !!p.drone, spot: p.spot ? +p.spot.intensity.toFixed(2) : null,
        fill: p.light ? +p.light.intensity.toFixed(2) : null, gl: p.gl ? +p.gl.scale.x.toFixed(2) : null,
        sprites: out.filter(o => o.sp).length, lit: out.length, psys: near.length,
        sample: out.slice(0, 14) };
    });
    console.log('bright: drone ' + (b.drone ? 'hung' : 'MISSING') + ' | spot ' + b.spot + ' fill ' + b.fill + ' flare ' + b.gl);
    console.log('  see-through hole -- ' + b.holes.join(' | '));
    console.log('  ' + b.lit + ' hot objects, ' + b.sprites + ' of them sprites, ' + b.psys + ' particle systems');
    console.log('  ' + JSON.stringify(b.sample));
  }

  if (has('drone')) {
    await page.evaluate(() => {
      const g = window.__g, f = g.isle.fairy, p = g.player;
      g.cam.tgt.copy(f.pos);
      g.cam.az = Math.atan2(p.pos.x - f.pos.x, p.pos.z - f.pos.z) + Math.PI;
      g.cam.r = 4.5;
    });
    const t = await page.evaluate(() => window.__g.world.clock);
    await page.waitForFunction(`window.__g.world.clock > ${t + 1.5}`, null, { timeout: 600000 });
  }

  // Armed, he faces the aim and travels wherever the left stick says. This walks him round
  // the compass with the aim pinned and reports which clips carry it -- the one thing about
  // the armed set that cannot be checked without a rig, and therefore cannot be checked in
  // gait.js at all.
  if (has('strafe')) {
    const step = async (secs) => { const t = await page.evaluate(() => window.__g.world.clock);
      await page.waitForFunction(`window.__g.world.clock > ${t + secs}`, null, { timeout: 600000 }); };
    for (let i = 0; i < 20; i++) {
      const on = await page.evaluate(() => { const g = window.__g;
        if (!g.player.armWant) g.toggleArm(); return !!g.player.armWant; });
      if (on) break;
      await step(1);
    }
    await step(1.4);
    const clips = await page.evaluate(() => Object.keys(window.__g.player.rigH ? window.__g.player.rigH.acts : {}));
    console.log('armed set: ' + clips.filter(k => /rifle|roll/.test(k)).join(' '));
    for (const [name, lx, ly] of [['forward', 0, -1], ['back', 0, 1], ['left', -1, 0], ['right', 1, 0], ['diagonal', .8, -.8]]) {
      // Put him back where he started each time rather than pinning him there. Turned loose he
      // covers thirty units a case and ends up in the sea, where the gun goes down and every
      // armed weight reads zero; pinned every eight milliseconds, two cases in five came back
      // holding the PREVIOUS case's answer. A teleport between cases is neither.
      await page.evaluate(([lx, ly]) => { const g = window.__g, p = g.player;
        if (!g.__home) g.__home = { x: p.pos.x, z: p.pos.z };
        p.pos.x = g.__home.x; p.pos.z = g.__home.z; p.vx = p.vz = 0;
        g.cam.tgt.x = p.pos.x; g.cam.tgt.z = p.pos.z;
        g.stick.R.x = 0; g.stick.R.y = -1;      // aim held straight ahead throughout
        g.stick.L.x = lx; g.stick.L.y = ly;
      }, [lx, ly]);
      await step(1.8);
      const w = await page.evaluate(() => {
        const g = window.__g, p = g.player, r = p.rigH;
        const sp = Math.hypot(p.vx, p.vz);
        const c = Math.cos(p.faceH), s2 = Math.sin(p.faceH);
        const out = {};
        for (const k of ['rifleIdle', 'rifleWalk', 'rifleBack', 'rifleLeft', 'rifleRight', 'rifleRun'])
          if (r && r.w[k] > .02) out[k] = +r.w[k].toFixed(2);
        return { w: out, speed: +sp.toFixed(1), swimming: +p.swim.toFixed(1),
          stickWants: [+p.wx.toFixed(2), +p.wz.toFixed(2)],
          travelVsFacing: sp > .4 ? Math.round(Math.atan2(-p.vx * c + p.vz * s2, p.vx * s2 + p.vz * c) * 57.3) : null,
          bodyOffAim: Math.round(Math.atan2(Math.sin(p.faceH - p.aimH), Math.cos(p.faceH - p.aimH)) * 57.3) };
      });
      console.log('  walking ' + name.padEnd(9) + (w.swimming > .3 ? ' IN WATER' : '') + ' speed ' + String(w.speed).padStart(4)
        + ' | travelling ' + String(w.travelVsFacing).padStart(4) + ' deg off his facing'
        + ' | body ' + w.bodyOffAim + ' deg off the aim | ' + JSON.stringify(w.w));
    }
    await page.evaluate(() => { const g = window.__g; g.stick.L.x = 1; g.stick.L.y = 0; g.stick.R.y = -1; g.cam.r = 9; });
    await step(1.5);
  }

  // Pick one up, carry it, put it down. The interesting number is where it ends up relative
  // to him: the socket is a joint on a skeleton in sphere space and everything else in the
  // game is on the flat chart, so an error there puts the animal on the far side of the world
  // rather than slightly wrong.
  if (has('carry')) {
    const step = async (secs) => { const t = await page.evaluate(() => window.__g.world.clock);
      await page.waitForFunction(`window.__g.world.clock > ${t + secs}`, null, { timeout: 600000 }); };
    const pre = await page.evaluate(() => {
      const g = window.__g, p = g.player;
      const c = g.world.creatures.filter(o => o.alive && !o.aquatic && !o.flying && o.rad <= 2)
        .sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0];
      if (!c) return { none: true };
      const a = Math.atan2(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
      const x = c.pos.x - Math.sin(a) * 3, z = c.pos.z - Math.cos(a) * 3;
      p.pos.set(x, g.groundY(x, z) + 1, z); p.vx = p.vz = 0; p.faceH = p.heading = a;
      g.cam.tgt.set(x, p.pos.y + 3.4, z); g.cam.az = a + Math.PI; g.cam.r = 8;
      if (p.armWant) g.toggleArm();
      return { who: c.constructor.name, size: c.rad, poses: Object.keys(p.rigH ? p.rigH.acts : {}).filter(k => /pickUp|hold/.test(k)) };
    });
    if (pre.none) console.log('carry: no land animal to try it on');
    else {
      await step(1.2);
      const off = await page.evaluate(() => ({ label: document.querySelector('#stkR .lbl').textContent,
        ring: document.getElementById('stkR').classList.contains('hot') }));
      await page.evaluate(() => { const a = window.__g.isle ? null : null; const A = window.__g; if (A.ACT && A.ACT.now) A.ACT.now.run(); });
      await step(1.6);
      const held = await page.evaluate(() => {
        const g = window.__g, p = g.player, c = p.carry;
        if (!c) return { holding: false };
        const dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z;
        const co = Math.cos(p.faceH), s2 = Math.sin(p.faceH);
        return { holding: true, who: c.constructor.name,
          ahead: +(dx * s2 + dz * co).toFixed(2), toTheSide: +(-dx * co + dz * s2).toFixed(2),
          up: +(c.pos.y - p.pos.y).toFixed(2), ofAHeightOf: g.RIG.height,
          holdWeight: +(p.rigH ? p.rigH.w.holdUp || 0 : 0).toFixed(2),
          label: document.querySelector('#stkR .lbl').textContent };
      });
      // and walk with it, which is the whole point of the upper-body layer
      await page.evaluate(() => { window.__g.stick.L.y = -1; });
      await step(1.6);
      const walking = await page.evaluate(() => {
        const g = window.__g, p = g.player, r = p.rigH, out = {};
        for (const k of ['walk', 'run', 'idle', 'holdUp']) if (r && r.w[k] > .02) out[k] = +r.w[k].toFixed(2);
        return { w: out, speed: +Math.hypot(p.vx, p.vz).toFixed(1), stillHolding: !!p.carry };
      });
      await page.evaluate(() => { const g = window.__g; g.stick.L.y = 0; if (g.ACT && g.ACT.now) g.ACT.now.run(); });
      await step(1.5);
      const after = await page.evaluate(() => {
        const g = window.__g, p = g.player;
        const c = g.world.creatures.find(o => o.carried);
        return { stillCarrying: !!p.carry, anyStuckCarried: !!c,
          label: document.querySelector('#stkR .lbl').textContent };
      });
      console.log('carry: ' + pre.who + ' (r ' + pre.size + ') | poses ' + (pre.poses.join(' ') || 'NONE'));
      console.log('  prompt before: "' + off.label + '"' + (off.ring ? ' with the ring lit' : ' NO RING'));
      console.log('  ' + (held.holding ? 'holding it, ' + held.ahead + ' ahead, ' + held.toTheSide
        + ' to the side, ' + held.up + ' up (he is ' + held.ofAHeightOf + ' tall) | carry pose at '
        + held.holdWeight + ' | prompt "' + held.label + '"' : 'DID NOT PICK IT UP'));
      console.log('  walking with it: speed ' + walking.speed + ' ' + JSON.stringify(walking.w)
        + ' | still holding ' + walking.stillHolding);
      console.log('  after setting down: carrying ' + after.stillCarrying + ', any animal left stuck '
        + after.anyStuckCarried + ' | prompt "' + after.label + '"');
    }
  }

  if (has('bolt')) {
    const step = async (secs) => { const t = await page.evaluate(() => window.__g.world.clock);
      await page.waitForFunction(`window.__g.world.clock > ${t + secs}`, null, { timeout: 600000 }); };
    for (let i = 0; i < 20; i++) {
      const on = await page.evaluate(() => { const g = window.__g;
        if (!g.player.armWant) g.toggleArm(); return !!g.player.armWant; });
      if (on) break;
      await step(1);
    }
    await page.evaluate(() => { const g = window.__g; g.stick.R.x = 0; g.stick.R.y = -1; });   // aim ahead, hold
    await step(1.2);                                                                            // fill the charge
    const ch = await page.evaluate(() => ({ charge: +window.__g.player.charge.toFixed(2) }));
    await page.evaluate(() => { const g = window.__g; g.stick.R.x = g.stick.R.y = 0; });        // release: fire
    // Catch it a few units out, before it can reach anything and pop. Poll in short hops and
    // grab the first frame a bolt exists, then let it fly just far enough to draw a streak.
    let b = { none: true };
    for (let i = 0; i < 8; i++) {
      await step(.08);
      b = await page.evaluate(() => {
        const g = window.__g, bo = g.world.effects.find(e => e instanceof g.Bolt);
        if (!bo) return { none: true };
        return { charge: +bo.c.toFixed(2), size: +bo.size.toFixed(2), rad: +bo.rad.toFixed(2),
          blast: +bo.blast.toFixed(1), trailLit: bo.trail.filter(s => s.material.opacity > .02).length,
          travelled: +Math.hypot(bo.x - g.player.pos.x, bo.z - g.player.pos.z).toFixed(0) };
      });
      if (!b.none && b.travelled > 12) break;
    }
    if (!b.none) await page.evaluate(() => {
      const g = window.__g, bo = g.world.effects.find(e => e instanceof g.Bolt);
      if (!bo) return;
      // Freeze the bolt so it hovers for the photo -- it still animates (core pulse, zaps,
      // corkscrew, trail decay), it just stops travelling -- and pin the follow camera onto
      // it every frame, since updatePlayer resets cam.tgt to the wanderer otherwise. The
      // trail keeps stamping the same spot, so blank the pool to a single fresh streak.
      bo.vx = bo.vz = bo.vy = 0; bo.t = 0.3;
      const az = Math.atan2(bo.x - g.player.pos.x, bo.z - g.player.pos.z) + Math.PI;
      setInterval(() => { g.cam.tgt.set(bo.x, bo.y, bo.z); g.cam.az = az; g.cam.r = 10;
        g.cam.pol0 = g.cam.pol = 1.32; g.cam.idle = 0; }, 6);
    });
    await step(.5);
    if (b.none) console.log('bolt: no bolt in flight — did it fire?');
    else console.log('bolt: charge ' + ch.charge + ' -> size ' + b.size + ', rad ' + b.rad + ', blast '
      + b.blast + ' | ' + b.trailLit + ' trail sprites lit | ' + b.travelled + ' units downrange');
    await step(.05);
  }

  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  await page.screenshot({ path: OUT });
  const info = await page.evaluate(() => {
    const g = window.__g, i = g.renderer.info.render;
    return { calls: i.calls, tris: i.triangles, plants: g.world.plants.length,
      creatures: g.world.creatures.length, at: [g.player.pos.x | 0, g.player.pos.z | 0],
      biome: g.biomeAt(g.player.pos.x, g.player.pos.z).name,
      ship: g.world.ship ? g.world.ship.state + '@' + (g.world.ship.pos.y | 0) : 'none',
      title: g.world.titleAt ? [g.world.titleAt.x|0, g.world.titleAt.y|0, g.world.titleAt.z|0] : 'NOT PLACED',
      titleIsle: g.world.titleIsle ? 'up at ' + (g.world.titleIsle.alt|0) : 'none',
      env: (g.ENV.map ? 'loaded on ' + g.ENV.mats.length + ' materials' : 'NOT LOADED'),
      sites: (g.world.sites || []).map(s => [s.x | 0, s.z | 0]), clock: g.world.clock | 0,
      cam: { askedR: +g.cam.r.toFixed(0), gotR: +g.camS.r.toFixed(1), pol: +g.camS.pol.toFixed(2),
        lift: +g.cam.lift.toFixed(1), az: Math.round(g.cam.az * 57.3),
        lensY: +g.camS.y.toFixed(1), groundUnderTheLens: (() => {
          const sx = Math.sin(g.cam.az) * Math.sin(g.camS.pol) * g.camS.r, sz = Math.cos(g.cam.az) * Math.sin(g.camS.pol) * g.camS.r;
          return +g.groundY(g.cam.tgt.x + sx, g.cam.tgt.z + sz).toFixed(1); })() } };
  });
  console.log(OUT, JSON.stringify(info));
  // What the frame is actually made of, in colour. "It looks like a mess" is a real note but
  // not an actionable one; this turns it into numbers -- where the hues sit, how saturated
  // they are, and how much of the value range is in use. One dominant hue, a couple of
  // accents and a wide value spread reads as art directed; a flat hue histogram with
  // everything at one lightness reads as a pile of assets.
  //
  // It reads the PNG, not the live canvas: the renderer is created without
  // preserveDrawingBuffer, so drawing the canvas into a 2D context after the frame gives
  // black, which is what the first version of this dutifully reported.
  if (has('palette')) {
    const b64 = fs.readFileSync(OUT).toString('base64');
    const pal = await page.evaluate(async src => {
      const im = new Image();
      await new Promise((ok, no) => { im.onload = ok; im.onerror = no; im.src = src; });
      const w = 400, h = Math.round(w * im.height / im.width);
      const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
      const g2 = c2.getContext('2d'); g2.drawImage(im, 0, 0, w, h);
      const d = g2.getImageData(0, 0, w, h).data;
      const hues = new Array(12).fill(0), vals = new Array(10).fill(0);
      let n = 0, satSum = 0, satHi = 0, vSum = 0, grey = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2;
        const sa = mx === mn ? 0 : (l > .5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn));
        let hu = 0;
        if (mx !== mn) {
          if (mx === r) hu = ((gg - b) / (mx - mn) + (gg < b ? 6 : 0));
          else if (mx === gg) hu = (b - r) / (mx - mn) + 2;
          else hu = (r - gg) / (mx - mn) + 4;
          hu /= 6;
        }
        n++; satSum += sa; vSum += l;
        if (sa < .12) grey++; else { hues[Math.min(11, hu * 12 | 0)]++; if (sa > .45) satHi++; }
        vals[Math.min(9, l * 10 | 0)]++;
      }
      return { n, hues, vals, sat: satSum / n, val: vSum / n, grey: grey / n, satHi: satHi / n };
    }, 'data:image/png;base64,' + b64);
    const NAMES = ['red', 'orange', 'yellow', 'chartreuse', 'green', 'spring', 'cyan', 'azure', 'blue', 'violet', 'magenta', 'rose'];
    const top = pal.hues.map((v, i) => [NAMES[i], v / pal.n]).sort((a, b) => b[1] - a[1]);
    console.log('palette: mean saturation ' + pal.sat.toFixed(2) + ', mean lightness ' + pal.val.toFixed(2)
      + ', near-grey ' + (pal.grey * 100 | 0) + '%, strongly saturated ' + (pal.satHi * 100 | 0) + '%');
    console.log('  hues:  ' + top.slice(0, 6).map(([k, v]) => k + ' ' + (v * 100).toFixed(0) + '%').join('   '));
    console.log('  lightness deciles: ' + pal.vals.map(v => (v / pal.n * 100).toFixed(0)).join(' '));
  }
  for (const p of [...new Set(problems)].slice(0, 12)) console.log('  !', p);
  await browser.close(); server.close();
})();
