// patch_28_card_progress_sentinel.js
//
// Follow-up to patch_09 §G (PROGRESS_BAR_MAX_V1). The card bar picks
// max(audioProgress, progress) for non-TV, but audioProgress=1 is the
// "listen-completed" sentinel (kept so the music_note indicator survives
// completion). A book finished by audio and later RE-READ at e.g. 10% shows:
//   ficha  → "Progreso: 10%" (read line, patch_04 v2)
//   card   → max(1, 0.10) = 1 → gate (0 < PROG < 1) fails → bar hidden
// i.e. the card and the detail page disagree.
//
// Fix (V2): treat values outside (0,1) as 0 on BOTH sides before max(), so
// the bar always tracks the same in-flight pass the ficha shows.

;(() => {
const fs = require('fs');
const child = require('child_process');
const bundlePath = child.execSync('ls /app/public/main_*.js | grep -v "\\.LICENSE\\|\\.map"').toString().trim();
let c = fs.readFileSync(bundlePath, 'utf8');

if (c.includes('/* PROGRESS_BAR_MAX_V2 */')) {
  console.log('card progress sentinel: already at V2');
  return;
}
if (!c.includes('/* PROGRESS_BAR_MAX_V1 */')) {
  console.error('card progress sentinel: V1 marker not found (patch_09 must run first)');
  process.exit(1);
}

const oldExpr = 'Math.max(t.audioProgress||0,t.progress||0)';
const newExpr = 'Math.max(t.audioProgress>0&&t.audioProgress<1?t.audioProgress:0,t.progress>0&&t.progress<1?t.progress:0)';

const n = c.split(oldExpr).length - 1;
if (n !== 4) {
  console.error('card progress sentinel: expected 4 occurrences of max-expr, found ' + n);
  process.exit(1);
}
while (c.includes(oldExpr)) c = c.replace(oldExpr, newExpr);
c = c.replace('/* PROGRESS_BAR_MAX_V1 */', '/* PROGRESS_BAR_MAX_V2 */');

fs.writeFileSync(bundlePath, c);
try {
  child.execSync('node --check ' + bundlePath, { stdio: 'pipe' });
  console.log('card progress sentinel: V1 -> V2 (4 edits), bundle syntax OK');
} catch (e) {
  console.error('card progress sentinel: SYNTAX ERROR -> ' + String(e.message || '').slice(0, 300));
  process.exit(1);
}
})();
