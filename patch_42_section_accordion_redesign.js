// patch_42_section_accordion_redesign.js
//
// Rediseño del acordeón de secciones que se repite por toda la app.
//
// El original es literalmente el mismo trozo de markup copiado 9 veces en el
// bundle (En proceso, Abandonados, Watchlist, Descargados, Juegos, YouTube):
//
//   <div class="mb-3 border border-slate-300 dark:border-slate-700 rounded overflow-hidden">
//     <button class="w-full text-left text-xl font-semibold px-3 py-2 bg-slate-100
//                    dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700
//                    flex items-center gap-2">
//       <i class="material-icons">chevron_right|expand_more</i>{label}
//     </button>
//     {open && <div class="p-2">…</div>}
//   </div>
//
// En modo oscuro `bg-slate-800` queda casi igual que el fondo (#121212) y lo
// único que se ve es el borde slate-700 al 100% de opacidad: cinco cajas
// blancas idénticas apiladas, sin jerarquía, sin pista de qué hay dentro y con
// el chevron saltando de glifo (chevron_right → expand_more) en vez de girar.
//
// Este patch sustituye las 9 copias por un único diseño con clases propias
// (`mt-sec*`) definidas en el CSS:
//
//   - Tarjeta con borde de baja opacidad (rgba blanco .10 en oscuro) y radio
//     de 12px, en vez del outline blanco duro.
//   - Icono de material-icons por tipo de contenido a la izquierda
//     (Películas → movie, Series → live_tv, Juegos → sports_esports,
//      Libros → menu_book, Teatro → theater_comedy, …). El icono se resuelve
//     comparando la etiqueta YA traducida contra `xo._()` de las claves
//     conocidas, así que funciona en los 7 locales sin tocar i18n.
//   - Un solo chevron que gira 90° con transición en vez de cambiar de glifo.
//   - Barra de acento vertical a la izquierda que crece en hover y en abierto:
//     da el estado abierto/cerrado de un vistazo aunque el contenido esté
//     fuera de pantalla.
//   - Hairline bajo la cabecera solo cuando está abierta, y fade-in del
//     contenido (respetando prefers-reduced-motion).
//   - `aria-expanded` en el botón y `:focus-visible` con anillo, que antes no
//     había ninguno de los dos.
//
// Cómo se aplica: el markup está minificado, así que no vale un replace plano
// para sacar la etiqueta (`props.label`, `xo._("Games")`,
// `xo._("Recent videos") + (videos ? " (n)" : "")` …). Se localiza cada
// ocurrencia por el className del wrapper y se recortan el botón y el bloque de
// contenido con un escáner de paréntesis que respeta literales de cadena.
//
// DEBE ejecutarse ANTES de patch_10 (bucket 10): patch_css_rename bumpea el
// hash del CSS y cualquier cambio posterior quedaría huérfano de caché.

;(() => {
const fs = require('fs');
const zlib = require('zlib');
const child = require('child_process');

const MARKER = '/*mt-fork:sec-accordion-v1*/';
// MT_PUBLIC solo existe para poder ensayar el patch sobre una copia del bundle
// fuera del contenedor antes de rebuildear. En el Dockerfile va sin definir.
const PUB = process.env.MT_PUBLIC || '/app/public';

// ============================================================ escáner de parens
// Devuelve el índice del `)` que cierra el `(` en `open`. Ignora paréntesis
// dentro de literales de cadena / plantilla.
function matchParen(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ================================================================== BUNDLE JS
const bundlePath = child
  .execSync("ls " + PUB + "/main_*.js | grep -v '\\.LICENSE\\|\\.map'")
  .toString().trim();
let js = fs.readFileSync(bundlePath, 'utf8');

if (js.includes(MARKER)) {
  console.log('section accordion: bundle already patched');
} else {
  const WRAP_PREFIX = 'r.createElement("div",{className:';

  // Dos markups distintos para la misma idea:
  //   `_Section`    → tarjeta con borde completo (En proceso, Watchlist, …)
  //   `_SubSection` → filete a la izquierda, anidado dentro de un _Section
  //                   (los subapartados de Juegos y de la Watchlist)
  // Si solo se migrase el primero, al abrir "Juegos" aparecerían dentro
  // desplegables con el diseño viejo. Los dos acaban en `.mt-sec`; el anidado
  // se queda además con `.mt-subsec`, que lo aligera.
  const VARIANTS = [
    {
      name: 'section',
      wrapClass: '"mb-3 border border-slate-300 dark:border-slate-700 rounded overflow-hidden"',
      newClass: '"mt-sec"',
      btnRe: new RegExp(
        '^r\\.createElement\\("button",\\{onClick:([\\s\\S]*?),className:' +
        '"w-full text-left text-xl font-semibold px-3 py-2 bg-slate-100 dark:bg-slate-800 ' +
        'hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-2"\\},' +
        'r\\.createElement\\("i",\\{className:"material-icons"\\},(\\w+)\\?"expand_more":"chevron_right"\\),' +
        '([\\s\\S]*)\\)$'
      ),
    },
    {
      name: 'subsection',
      wrapClass: '"mb-2 ml-3 border-l-2 border-slate-300 dark:border-slate-700 pl-2"',
      newClass: '"mt-sec mt-subsec"',
      btnRe: new RegExp(
        '^r\\.createElement\\("button",\\{onClick:([\\s\\S]*?),className:' +
        '"w-full text-left text-lg px-2 py-1 hover:bg-slate-200 dark:hover:bg-slate-700 ' +
        'flex items-center gap-2"\\},' +
        'r\\.createElement\\("i",\\{className:"material-icons text-base"\\},(\\w+)\\?"expand_more":"chevron_right"\\),' +
        '([\\s\\S]*)\\)$'
      ),
    },
  ];

  const BTN_START = 'r.createElement("button",{onClick:';
  let done = 0;
  const skipped = [];

for (const V of VARIANTS) {
  const WRAP_CLASS = V.wrapClass;
  const BTN_RE = V.btnRe;
  const WRAP = WRAP_PREFIX + WRAP_CLASS + '}';

  // Índices de todas las ocurrencias, de derecha a izquierda: así los splices
  // no invalidan los índices de los que quedan por procesar. Se recalculan por
  // variante, sobre el `js` ya modificado por la anterior.
  const hits = [];
  for (let p = js.indexOf(WRAP); p !== -1; p = js.indexOf(WRAP, p + 1)) hits.push(p);
  if (hits.length === 0) throw new Error('section accordion: no aparece el markup de "' + V.name + '" (¿cambió el bundle?)');
  hits.reverse();

  for (const idx of hits) {
    // --- botón -------------------------------------------------------------
    const btnIdx = js.indexOf(BTN_START, idx);
    if (btnIdx === -1 || btnIdx > idx + WRAP.length + 8) { skipped.push('no button @' + idx); continue; }
    const btnOpen = js.indexOf('(', btnIdx + 'r.createElement'.length);
    const btnEnd = matchParen(js, btnOpen);
    if (btnEnd === -1) { skipped.push('unbalanced button @' + idx); continue; }

    const m = js.slice(btnIdx, btnEnd + 1).match(BTN_RE);
    if (!m) { skipped.push('button shape @' + idx); continue; }
    const onClickFn = m[1];
    const openVar = m[2];
    const label = m[3];

    // El icono se resuelve en runtime contra `xo` (la tabla de traducciones del
    // bundle). `typeof` sobre un identificador no declarado no lanza, así que el
    // guard vale también si alguna copia vive en otro scope.
    const newBtn =
      'r.createElement("button",{type:"button",onClick:' + onClickFn +
      ',"aria-expanded":' + openVar + '?"true":"false"' +
      ',className:"mt-sec-h"},' +
      'r.createElement("i",{className:"material-icons mt-sec-ic"},' +
        '(typeof window!=="undefined"&&window._mtSecIcon)?window._mtSecIcon(' + label +
        ',(typeof xo!=="undefined"?xo:null)):"folder_open"),' +
      'r.createElement("span",{className:"mt-sec-t"},' + label + '),' +
      'r.createElement("i",{className:"material-icons mt-sec-chev"},"chevron_right"))';

    // --- contenido: `,<open>&&<elemento>` -----------------------------------
    // Se envuelve siempre en un div propio: unas copias ya traen
    // `<div class="p-2">`, otras cuelgan el grid directamente, y así todas
    // comparten padding y animación de entrada.
    let bodyFrom = -1, bodyTo = -1, bodyGuard = null, bodyExpr = null;
    const after = js.slice(btnEnd + 1, btnEnd + 64);
    const am = after.match(/^,(\w+)&&r\.createElement\(/);
    if (am) {
      bodyGuard = am[1];
      const exprStart = btnEnd + 1 + am[0].length - '('.length - 'r.createElement'.length;
      const exprOpen = js.indexOf('(', exprStart + 'r.createElement'.length);
      const exprEnd = matchParen(js, exprOpen);
      if (exprEnd !== -1) {
        bodyFrom = btnEnd + 1;
        bodyTo = exprEnd;
        bodyExpr = js.slice(exprStart, exprEnd + 1);
      }
    }

    // --- splice, de derecha a izquierda -------------------------------------
    if (bodyFrom !== -1) {
      const newBody = ',' + bodyGuard + '&&r.createElement("div",{className:"mt-sec-b"},' + bodyExpr + ')';
      js = js.slice(0, bodyFrom) + newBody + js.slice(bodyTo + 1);
    }
    js = js.slice(0, btnIdx) + newBtn + js.slice(btnEnd + 1);
    js = js.slice(0, idx + WRAP_PREFIX.length) +
         V.newClass + '+(' + openVar + '?" is-open":"")' +
         js.slice(idx + WRAP_PREFIX.length + WRAP_CLASS.length);
    done++;
  }
}

  if (done === 0) throw new Error('section accordion: 0 sections rewritten (' + skipped.join('; ') + ')');
  if (skipped.length) console.log('section accordion: skipped ' + skipped.length + ' → ' + skipped.join('; '));

  // Helper de iconos, una sola vez, al principio del bundle. Compara la
  // etiqueta ya renderizada contra `tr._(clave)` para no depender del idioma.
  // La comparación es por subcadena, no por prefijo: hay etiquetas que llevan
  // sufijo de recuento ("Vídeos recientes (4)") o prefijo ("Mis canales (7)").
  // De ahí el orden por longitud descendente, que es lo que evita que "Vistos"
  // le robe el icono a "Vistos y jugados" / "Recién vistos".
  const helper =
    ';(function(){try{if(typeof window==="undefined"||window._mtSecIcon)return;' +
    'var MAP=[["Movies","movie"],["Tv","live_tv"],["Games","sports_esports"],' +
    '["Books","menu_book"],["Audiobooks","headphones"],["Theater","theater_comedy"],' +
    '["Watched and played","done_all"],["Just watched","visibility"],["Played","sports_esports"],' +
    '["Seen","visibility"],["Rated","star_rate"],["Unrated","star_border"],' +
    '["Recent videos","smart_display"],["In progress","play_circle"],["Upcoming","event"]];' +
    'window._mtSecIcon=function(label,tr){try{' +
    'var s=String(label==null?"":label).toLowerCase();' +
    'if(!s)return "folder_open";' +
    'var t=function(k){try{return String(tr&&tr._?tr._(k):k).toLowerCase()}catch(_){return k.toLowerCase()}};' +
    'var rows=MAP.map(function(r){return [t(r[0]),r[1]]}).filter(function(r){return r[0]});' +
    'rows.sort(function(a,b){return b[0].length-a[0].length});' +
    'for(var i=0;i<rows.length;i++){if(s.indexOf(rows[i][0])!==-1)return rows[i][1]}' +
    'if(s.indexOf("canal")!==-1||s.indexOf("channel")!==-1)return "subscriptions";' +
    'return "folder_open"}catch(_){return "folder_open"}}}catch(_){}})();' +
    MARKER + '\n';

  fs.writeFileSync(bundlePath, helper + js);
  console.log('section accordion: rewrote ' + done + ' sections in ' + bundlePath);
}

// ======================================================================= CSS
const cssPath = child
  .execSync("ls " + PUB + "/main_*.css | grep -v '\\.gz\\|\\.br'")
  .toString().trim();
let css = fs.readFileSync(cssPath, 'utf8');

const CSS_MARKER = '/* mt-fork: section accordion v1 */';
if (css.includes(CSS_MARKER)) {
  console.log('section accordion: css already patched');
} else {
  const rules = '\n' + CSS_MARKER + '\n' + [
    // --- tokens compartidos ------------------------------------------------
    // Viven en :root, no en .mt-sec, porque los reutiliza el resto del fork
    // (nav, desplegables, drawer). El tema oscuro se cuela con `.dark` en
    // <html>, así que :root.dark (0,1,0) le gana a :root (0,0,1) sin
    // !important y sin duplicar cada regla.
    ':root{',
      '--mt-line:rgba(15,23,42,.13);',
      '--mt-line-hi:rgba(15,23,42,.22);',
      '--mt-surface:#fff;',
      '--mt-surface-2:#fff;',
      '--mt-hover:rgba(15,23,42,.055);',
      '--mt-fg:#0f172a;',
      '--mt-dim:rgba(15,23,42,.5);',
      '--mt-accent:#2563eb;',
    '}',
    ':root.dark{',
      '--mt-line:rgba(255,255,255,.10);',
      '--mt-line-hi:rgba(255,255,255,.20);',
      '--mt-surface:#171717;',
      '--mt-surface-2:#1c1c1c;',
      '--mt-hover:rgba(255,255,255,.06);',
      '--mt-fg:#f1f5f9;',
      '--mt-dim:rgba(241,245,249,.5);',
      '--mt-accent:#60a5fa;',
    '}',

    // --- tarjeta ---------------------------------------------------------
    '.mt-sec{',
      '--mt-sec-line:var(--mt-line);',
      '--mt-sec-line-hi:var(--mt-line-hi);',
      '--mt-sec-surface:var(--mt-surface);',
      '--mt-sec-head:transparent;',
      '--mt-sec-head-hi:var(--mt-hover);',
      '--mt-sec-fg:var(--mt-fg);',
      '--mt-sec-dim:var(--mt-dim);',
      '--mt-sec-accent:var(--mt-accent);',
      'margin-bottom:10px;border:1px solid var(--mt-sec-line);border-radius:12px;',
      'background:var(--mt-sec-surface);overflow:hidden;',
      'transition:border-color .18s ease,box-shadow .18s ease;',
    '}',
    '.mt-sec:hover{border-color:var(--mt-sec-line-hi)}',
    '.mt-sec.is-open{border-color:var(--mt-sec-line-hi);box-shadow:0 1px 2px rgba(0,0,0,.06)}',
    '.dark .mt-sec.is-open{box-shadow:0 1px 2px rgba(0,0,0,.35)}',

    // --- cabecera --------------------------------------------------------
    '.mt-sec-h{',
      'position:relative;display:flex;align-items:center;gap:10px;width:100%;',
      'padding:11px 14px 11px 16px;text-align:left;cursor:pointer;',
      'background:var(--mt-sec-head);color:var(--mt-sec-fg);',
      'font-size:1rem;font-weight:600;line-height:1.35;letter-spacing:.005em;',
      'border:0;border-bottom:1px solid transparent;',
      'transition:background-color .16s ease,border-color .16s ease;',
    '}',
    // Barra de acento: la altura es el indicador de estado.
    '.mt-sec-h::before{',
      'content:"";position:absolute;left:0;top:50%;transform:translateY(-50%);',
      'width:3px;height:0;border-radius:0 3px 3px 0;background:var(--mt-sec-accent);',
      'transition:height .2s ease;',
    '}',
    '.mt-sec-h:hover{background:var(--mt-sec-head-hi)}',
    '.mt-sec-h:hover::before{height:42%}',
    // Combinador de hijo directo en todo lo que depende de `is-open`: con
    // descendiente, abrir un _Section pintaría también como abiertos los
    // _SubSection que lleva dentro.
    '.mt-sec.is-open>.mt-sec-h{background:var(--mt-sec-head-hi);border-bottom-color:var(--mt-sec-line)}',
    '.mt-sec.is-open>.mt-sec-h::before{height:64%}',
    '.mt-sec-h:focus-visible{outline:2px solid var(--mt-sec-accent);outline-offset:-2px}',

    // --- icono / texto / chevron ----------------------------------------
    '.material-icons.mt-sec-ic{',
      'flex:0 0 auto;font-size:20px;line-height:1;color:var(--mt-sec-dim);',
      'transition:color .16s ease;',
    '}',
    '.mt-sec-h:hover .mt-sec-ic,.mt-sec.is-open>.mt-sec-h .mt-sec-ic{color:var(--mt-sec-accent)}',
    '.mt-sec-t{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.material-icons.mt-sec-chev{',
      'flex:0 0 auto;font-size:20px;line-height:1;color:var(--mt-sec-dim);',
      'transition:transform .2s ease,color .16s ease;',
    '}',
    '.mt-sec.is-open>.mt-sec-h .mt-sec-chev{transform:rotate(90deg);color:var(--mt-sec-fg)}',

    // --- contenido -------------------------------------------------------
    '.mt-sec-b{padding:10px 8px 12px;animation:mt-sec-in .22s ease both}',
    // Varias copias ya traían su propio div de padding dentro; se anula para
    // no acabar con 18px por lado.
    '.mt-sec-b>.p-2,.mt-sec-b>.p-3,.mt-sec-b>.py-1{padding:0}',
    // Acordeón anidado (_SubSection dentro de _Section): sin superficie propia
    // para que no parezca una tarjeta flotando sobre otra.
    '.mt-subsec,.mt-sec .mt-sec{border-radius:10px;background:transparent;margin-bottom:8px}',
    '.mt-subsec:last-child,.mt-sec .mt-sec:last-child{margin-bottom:0}',
    '.mt-subsec>.mt-sec-h,.mt-sec .mt-sec>.mt-sec-h{font-size:.9rem;padding:9px 12px 9px 14px}',
    '@keyframes mt-sec-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}',
    '@media (prefers-reduced-motion:reduce){',
      '.mt-sec-b{animation:none}',
      '.mt-sec-h,.mt-sec-h::before,.mt-sec-chev,.mt-sec-ic{transition:none}',
    '}',
    '@media (max-width:480px){',
      '.mt-sec-h{padding:10px 12px 10px 14px;font-size:.95rem}',
      '.mt-sec-b{padding:8px 4px 10px}',
    '}',
  ].join('') + '\n';

  css = css + rules;
  fs.writeFileSync(cssPath, css);
  // Re-emitir .gz/.br: el servidor sirve los precomprimidos y si no se
  // regeneran aquí el CSS nuevo es invisible para cualquier cliente que mande
  // Accept-Encoding: br|gzip (Cloudflare siempre lo hace).
  try { fs.writeFileSync(cssPath + '.gz', zlib.gzipSync(css, { level: 9 })); } catch (_) {}
  try { fs.writeFileSync(cssPath + '.br', zlib.brotliCompressSync(css)); } catch (_) {}
  console.log('section accordion: appended css + recompressed ' + cssPath);
}

})();
