// patch_43_shell_full_width.js
//
// "Que las secciones se alineen con la barra de arriba sea la resolución que
//  sea; si se agranda, que se agranden las secciones; en vertical que también
//  se adapte."
//
// La barra y el contenido vivían en dos cajas distintas:
//
//   <nav class="flex items-center">                       ← ancho completo, sin padding
//   <div class="flex flex-col items-center max-w-5xl m-auto">   ← 64rem centrado
//     <div class="w-full p-2"> …páginas… </div>
//
// Así que el nav empezaba en x=0 y el contenido en (ancho-1024)/2. En un
// monitor de 2560 eso son ~760px de aire a cada lado del contenido mientras la
// barra sigue pegada al borde: es el desalineado de la captura.
//
// Este patch mete a los dos en el mismo gutter fluido:
//
//   :root { --mt-gutter: 12 | 16 | 24px según viewport }
//   .mt-nav   → padding horizontal = --mt-gutter
//   .mt-shell → width:100%, sin max-width, mismo padding horizontal
//
// Al ser padding (y no un max-width fijo) la alineación se mantiene sola en
// cualquier resolución y al girar la pantalla a vertical: ambos bordes son el
// mismo valor calculado del viewport.
//
// Efecto colateral necesario: `.items-grid` seguía capado a 900px por
// patch_css_items_grid_fluid (patch_10). Con el shell a ancho completo ese cap
// dejaba la rejilla de carátulas como una columna estrecha centrada dentro de
// una tarjeta enorme. Se levanta el cap para que la rejilla se expanda con la
// sección, y se deja `justify-content:center` para que las carátulas queden
// centradas en su sección tanto si llenan una fila como si son cuatro sueltas
// (v2, 24-ago-2026). patch_10 corre DESPUÉS que este patch, así que sus reglas
// `!important` se ganan por especificidad (`body .items-grid` = 0,1,1 contra
// `.items-grid` = 0,1,0), no por orden.
//
// Debe ejecutarse ANTES de patch_10 (css_rename bumpea el hash del CSS).

;(() => {
const fs = require('fs');
const zlib = require('zlib');
const child = require('child_process');

const MARKER = '/*mt-fork:shell-full-width-v1*/';
const PUB = process.env.MT_PUBLIC || '/app/public';

// ================================================================== BUNDLE JS
const bundlePath = child
  .execSync("ls " + PUB + "/main_*.js | grep -v '\\.LICENSE\\|\\.map'")
  .toString().trim();
let js = fs.readFileSync(bundlePath, 'utf8');

if (js.includes(MARKER)) {
  console.log('shell full width: bundle already patched');
} else {
  const SHELL_OLD = 'r.createElement("div",{className:"flex flex-col items-center max-w-5xl m-auto"}';
  const SHELL_NEW = 'r.createElement("div",{className:"mt-shell"}';
  const NAV_OLD = 'r.createElement("nav",{className:"flex items-center"}';
  const NAV_NEW = 'r.createElement("nav",{className:"flex items-center mt-nav"}';

  const shellHits = js.split(SHELL_OLD).length - 1;
  const navHits = js.split(NAV_OLD).length - 1;
  if (shellHits !== 1) throw new Error('shell full width: expected 1 shell wrapper, found ' + shellHits);
  if (navHits !== 1) throw new Error('shell full width: expected 1 nav, found ' + navHits);

  js = js.split(SHELL_OLD).join(SHELL_NEW).split(NAV_OLD).join(NAV_NEW);
  fs.writeFileSync(bundlePath, MARKER + '\n' + js);
  console.log('shell full width: rewrote shell + nav in ' + bundlePath);
}

// ======================================================================= CSS
const cssPath = child
  .execSync("ls " + PUB + "/main_*.css | grep -v '\\.gz\\|\\.br'")
  .toString().trim();
let css = fs.readFileSync(cssPath, 'utf8');

const CSS_MARKER = '/* mt-fork: shell full width v2 (grid centered) */';
if (css.includes(CSS_MARKER)) {
  console.log('shell full width: css already patched');
} else {
  const rules = '\n' + CSS_MARKER + '\n' + [
    // Un único gutter para barra y contenido. Al ser el mismo valor en ambos,
    // la alineación no depende del ancho ni de la orientación.
    ':root{--mt-gutter:12px}',
    '@media (min-width:640px){:root{--mt-gutter:16px}}',
    '@media (min-width:1280px){:root{--mt-gutter:24px}}',

    '.mt-nav{padding-left:var(--mt-gutter);padding-right:var(--mt-gutter)}',
    '.mt-shell{',
      'display:flex;flex-direction:column;align-items:stretch;',
      'width:100%;max-width:none;margin:0;',
      'padding-left:var(--mt-gutter);padding-right:var(--mt-gutter);',
      'box-sizing:border-box;',
    '}',
    // El hijo trae `w-full p-2`: se le quita solo el padding horizontal para no
    // sumarlo al gutter (el vertical sí hace falta).
    '.mt-shell>div{width:100%;padding-left:0;padding-right:0;box-sizing:border-box}',

    // Rejilla de carátulas: fuera el cap de 900px (que con el shell fluido la
    // dejaba flotando en una tarjeta muy ancha) pero centrada dentro de su
    // sección.
    'body .items-grid{max-width:none!important;justify-content:center!important}',
  ].join('') + '\n';

  css = css + rules;
  fs.writeFileSync(cssPath, css);
  // Re-emitir .gz/.br: el servidor sirve los precomprimidos y Cloudflare pide
  // brotli siempre, así que sin esto el CSS nuevo es invisible.
  try { fs.writeFileSync(cssPath + '.gz', zlib.gzipSync(css, { level: 9 })); } catch (_) {}
  try { fs.writeFileSync(cssPath + '.br', zlib.brotliCompressSync(css)); } catch (_) {}
  console.log('shell full width: appended css + recompressed ' + cssPath);
}

})();
