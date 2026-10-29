// patch_62_chapter_indicator.js  (requires patch_38)
//
// Chapter indicator riding on top of the READ and LISTEN progress bars in the
// Progreso modal (Rp). No DB change and nothing to set by hand: the bar still
// shows % of the total (pages for reading, duration for listening). We split
// that total into equal parts ("chapters") computed from the work's own size
// and show "Capítulo X de N" above the bar, advancing with the slider:
//
//   N (read)   = round(numberOfPages / PAGES_PER_CHAPTER)   [maxP in the modal]
//   N (listen) = round(totalMinutes  / MIN_PER_CHAPTER)     [maxD in the modal]
//   X          = ceil(% / 100 * N)      (0 while the bar is at 0%)
//
// Only the "leído" (_showRead) and "escuchado" (_showListen) sections get it;
// movies / TV / games are untouched. Tune the two divisors below to taste.

;(() => {
const fs = require('fs');
const cp = require('child_process');
const bundlePath = cp
  .execSync('ls /app/public/main_*.js | grep -v "\\.LICENSE\\|\\.map"').toString().trim();
let c = fs.readFileSync(bundlePath, 'utf8');

if (c.includes('RP_CHAPIND_V2')) { console.log('chapter indicator: already applied'); return; }

const PAGES_PER_CHAPTER = 20;
const MIN_PER_CHAPTER = 30;

// indicator element: `div` is the N expression (maxP/.. or maxD/..) as a string
function ind(div) {
  return '/*RP_CHAPIND_V2*/r.createElement("div",{className:"text-sm",style:{marginTop:"0.6rem",opacity:0.85}},' +
    '(function(){var N=Math.max(1,(Number(t.numberOfChapters)>0?Math.round(Number(t.numberOfChapters)):Math.round((' + div + '))));' +
    'return "Capítulo "+(i<=0?0:Math.min(N,Math.ceil(i/100*N)))+" de "+N})())';
}

// --- READ bar: insert above the % range row ---------------------------------
const readAnchor = 'r.createElement("div",{className:"flex items-center mt-2"}';
if (c.split(readAnchor).length - 1 !== 1) {
  console.error('chapter indicator: read-bar anchor count != 1 -> ' + (c.split(readAnchor).length - 1));
  process.exit(1);
}
c = c.replace(readAnchor, ind('(Number(maxP)||0)/' + PAGES_PER_CHAPTER) + ',' + readAnchor);
console.log('chapter indicator: inserted above READ bar (' + PAGES_PER_CHAPTER + ' pages/chapter)');

// --- LISTEN bar: insert right after the "✓ Aplicado" span -------------------
const listenAnchor = '"✓")),r.createElement("input",{className:"w-full my-3",type:"range",min:0,max:maxD,value:Math.round(i*maxD/100)';
if (c.split(listenAnchor).length - 1 !== 1) {
  console.error('chapter indicator: listen-bar anchor count != 1 -> ' + (c.split(listenAnchor).length - 1));
  process.exit(1);
}
c = c.replace(listenAnchor,
  '"✓")),' + ind('(Number(maxD)||0)/' + MIN_PER_CHAPTER) +
  ',r.createElement("input",{className:"w-full my-3",type:"range",min:0,max:maxD,value:Math.round(i*maxD/100)');
console.log('chapter indicator: inserted above LISTEN bar (' + MIN_PER_CHAPTER + ' min/chapter)');

fs.writeFileSync(bundlePath, c);
console.log('patch_62: complete');
})();
