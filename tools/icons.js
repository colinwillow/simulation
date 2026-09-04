// Make the home-screen icons from one source image.
//
//   node tools/icons.js path/to/icon.png
//
// Crops the picture out of any bezel or backdrop it was rendered with (iOS masks its own
// corners, so it wants a full-bleed square), then writes icons/apple-touch-icon.png (180),
// icons/icon-192.png and icons/icon-512.png. Needs the dev install for Playwright; the
// crop and resize happen in a headless Chromium canvas because nothing else here can
// decode a PNG.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const src = process.argv[2];
// Optional extra inset, as a fraction of the found square, to eat a rendered bezel that the
// saturation scan cannot tell from the picture. 0.06 suits the alien icon.
const INSET = process.argv[3] !== undefined ? +process.argv[3] : .06;
if (!src || !fs.existsSync(src)) { console.log('usage: node tools/icons.js <square image> [inset 0..0.2]'); process.exit(2); }
const root = path.join(__dirname, '..');
(async () => {
  const exe = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;
  const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setContent('<canvas id=c></canvas>');
  const mime = /\.jpe?g$/i.test(src) ? 'image/jpeg' : /\.webp$/i.test(src) ? 'image/webp' : 'image/png';
  const dataUrl = `data:${mime};base64,` + fs.readFileSync(src).toString('base64');
  const out = await p.evaluate(async ({ dataUrl, INSET }) => {
    const img = new Image(); img.src = dataUrl; await img.decode();
    const W = img.width, H = img.height;
    const c = document.getElementById('c'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    // Scan inward along the middle row and column for the first strongly coloured pixel:
    // a grey backdrop and a metallic bezel are both nearly unsaturated, the picture is not.
    const sat = (x, y) => { const i = (y * W + x) * 4; return Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); };
    const my = H >> 1, mx = W >> 1;
    let l = 0; while (l < W && sat(l, my) < 60) l++;
    let r = W - 1; while (r > 0 && sat(r, my) < 60) r--;
    let t = 0; while (t < H && sat(mx, t) < 60) t++;
    let bt = H - 1; while (bt > 0 && sat(mx, bt) < 60) bt--;
    // if nothing looked like a bezel, use the whole image
    if (r - l < W * .5 || bt - t < H * .5) { l = 0; r = W - 1; t = 0; bt = H - 1; }
    const side = Math.min(r - l, bt - t) * (1 - INSET * 2), cx = (l + r) / 2, cy = (t + bt) / 2;
    const sx = Math.round(cx - side / 2), sy = Math.round(cy - side / 2);
    const make = n => { const o = document.createElement('canvas'); o.width = o.height = n;
      const og = o.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(img, sx, sy, side, side, 0, 0, n, n); return o.toDataURL('image/png'); };
    return { W, H, crop: [sx, sy, side], png: { 180: make(180), 192: make(192), 512: make(512) } };
  }, { dataUrl, INSET });
  fs.mkdirSync(path.join(root, 'icons'), { recursive: true });
  for (const [n, du] of Object.entries(out.png)) {
    const name = n === '180' ? 'icons/apple-touch-icon.png' : `icons/icon-${n}.png`;
    fs.writeFileSync(path.join(root, name), Buffer.from(du.split(',')[1], 'base64'));
    console.log('wrote', name);
  }
  console.log(`source ${out.W}x${out.H}, cropped square at (${out.crop[0]},${out.crop[1]}) side ${out.crop[2]}`);
  await b.close();
})();
