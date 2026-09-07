// The one-second gate. Everything else in this directory is opt-in; this is the thing that
// runs on every change, because a file that will not parse is a blank page and costs the
// owner the round trip he was going to spend testing.
//
// `node --check` cannot do it: index.html is HTML, and the game is three inline <script>
// blocks inside it. So pull each block out and parse it on its own, and report the failure
// at its line in index.html rather than at its line in some extracted fragment.
//
//   node tools/syntax.js          # or: npm run check:syntax
//
// WHAT IT CANNOT SEE, and this has cost real builds: a `//` comment that swallows the rest
// of a one-liner. `const a = 1;  // note  const b = 2; scene.add(x);` parses perfectly and
// is missing two statements. Nothing here will ever catch that -- only reading the line will.
const fs = require('fs'), vm = require('vm');
const FILE = process.argv[2] || 'index.html';
const src = fs.readFileSync(FILE, 'utf8');
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m, i = 0, bad = 0;
while ((m = re.exec(src))) {
  const at = src.slice(0, m.index).split('\n').length;   // where this block starts in the file
  try { new vm.Script(m[1], { filename: 'block' + i }); }
  catch (e) {
    bad++;
    const ln = /block\d+:(\d+)/.exec(e.stack || '');
    console.error(FILE + ':' + (ln ? at + +ln[1] : at) + '  ' + e.message);
  }
  i++;
}
console.log(i + ' inline scripts, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
