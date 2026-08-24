// patch_47_home_centered.js
//
// "Quiero que Inicio también vaya centrado con todo su contenido."
//
// La portada NO usa `.items-grid` (esa es la rejilla de las páginas de listas,
// centrada en patch_43 v2), tiene su propio markup y todo él va pegado a la
// izquierda:
//
//   Uv (resumen)   <div class="flex flex-wrap">            ← bloques Tv/Películas/…
//                    <div class="mb-6 mr-6"> … </div>       ← 7 copias
//
//   qv (sección)   <div class="mb-10">
//                    <div class="text-2xl font-bold">Upcoming</div>
//                    <div class="flex flex-row flex-wrap mt-4">
//                      <div class="w-40 mr-5"> …carátula… </div>   ← slice(0,5)
//
// Con el shell a ancho completo (patch_43) eso deja la portada entera arrimada
// al borde izquierdo con todo el aire a la derecha.
//
// Se añaden tres clases propias al markup y las reglas van en CSS en vez de
// tirar de utilidades Tailwind: el CSS está purgado y `mx-3` / `ml-5` NO
// existen en el bundle, así que ponerlas en el className sería un no-op
// silencioso. `mx-2` sí existe, pero con reglas propias también se corrigen de
// paso los márgenes asimétricos (`mr-6` / `mr-5`), que dejaban el conjunto
// descentrado por medio gutter aunque el flex ya estuviera centrado.
//
// Especificidad: `.mt-home-stats>div` y `.mt-home-row>div` son (0,1,1) contra
// las utilidades `.mr-6` / `.mr-5` (0,1,0). Ambas llevan `!important`, así que
// ganan las nuestras por especificidad, no por orden.
//
// Debe ejecutarse ANTES de patch_10 (css_rename / bundle_rename bumpean los
// hashes de los ficheros y son quienes hacen el cache-bust).

;(() => {
const fs = require('fs');
const zlib = require('zlib');
const child = require('child_process');

const PUB = process.env.MT_PUBLIC || '/app/public';

// ================================================================== BUNDLE JS
const MARKER = '/*mt-fork:home-centered-v1*/';

const bundlePath = child
  .execSync("ls " + PUB + "/main_*.js | grep -v '\\.LICENSE\\|\\.map'")
  .toString().trim();
let js = fs.readFileSync(bundlePath, 'utf8');

if (js.includes(MARKER)) {
  console.log('home centered: bundle already patched');
} else {
  // [ancla, reemplazo, ocurrencias esperadas]
  const edits = [
    // 1. Contenedor del resumen de estadísticas. El `o&&` de delante lo hace
    //    único: hay más `flex flex-wrap` sueltos en el bundle.
    [
      'o&&r.createElement("div",{className:"flex flex-wrap"},',
      'o&&r.createElement("div",{className:"flex flex-wrap mt-home-stats"},',
      1,
    ],
    // 2. Título de cada sección de la portada (Upcoming / Recently released /
    //    Unrated). `,t)` lo ata al título que llega por props.
    [
      'r.createElement("div",{className:"text-2xl font-bold"},t)',
      'r.createElement("div",{className:"text-2xl font-bold mt-home-section-title"},t)',
      1,
    ],
    // 3. Fila de carátulas de cada sección.
    [
      'r.createElement("div",{className:"flex flex-row flex-wrap mt-4"}',
      'r.createElement("div",{className:"flex flex-row flex-wrap mt-4 mt-home-row"}',
      1,
    ],
  ];

  for (const [oldStr, newStr, expected] of edits) {
    const hits = js.split(oldStr).length - 1;
    if (hits !== expected) {
      throw new Error(
        'home centered: expected ' + expected + ' hit(s) for anchor, found ' + hits +
        ' -> ' + oldStr.slice(0, 60)
      );
    }
    js = js.split(oldStr).join(newStr);
  }

  fs.writeFileSync(bundlePath, MARKER + '\n' + js);
  console.log('home centered: rewrote summary + section title + poster row in ' + bundlePath);
}

// ======================================================================= CSS
const CSS_MARKER = '/* mt-fork: home centered v1 */';

const cssPath = child
  .execSync("ls " + PUB + "/main_*.css | grep -v '\\.gz\\|\\.br'")
  .toString().trim();
let css = fs.readFileSync(cssPath, 'utf8');

if (css.includes(CSS_MARKER)) {
  console.log('home centered: css already patched');
} else {
  const rules = '\n' + CSS_MARKER + '\n' + [
    // Resumen: bloques centrados en la fila y con margen simétrico (upstream
    // trae solo `mr-6`, que descentraba el conjunto media separación).
    '.mt-home-stats{justify-content:center!important}',
    '.mt-home-stats>div{margin-left:.75rem!important;margin-right:.75rem!important;text-align:center!important}',

    // Título de sección.
    '.mt-home-section-title{text-align:center!important}',

    // Fila de carátulas: mismo tratamiento que `.items-grid` en patch_43 —
    // ancho completo, contenido centrado, márgenes simétricos.
    '.mt-home-row{justify-content:center!important}',
    '.mt-home-row>div{margin-left:.625rem!important;margin-right:.625rem!important}',
  ].join('') + '\n';

  css = css + rules;
  fs.writeFileSync(cssPath, css);
  // Re-emitir .gz/.br: el servidor sirve los precomprimidos y Cloudflare pide
  // brotli siempre, así que sin esto el CSS nuevo es invisible.
  try { fs.writeFileSync(cssPath + '.gz', zlib.gzipSync(css, { level: 9 })); } catch (_) {}
  try { fs.writeFileSync(cssPath + '.br', zlib.brotliCompressSync(css)); } catch (_) {}
  console.log('home centered: appended css + recompressed ' + cssPath);
}

})();
