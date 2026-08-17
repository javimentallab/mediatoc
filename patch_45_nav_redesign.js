// patch_45_nav_redesign.js
//
// Rediseño de la barra principal, homogeneizada con el acordeón de secciones.
//
// La barra venía de upstream sin superficie propia: `<nav class="flex
// items-center">` flotando sobre el fondo de la página, enlaces `text-xl` sin
// zona de pulsación ni hover, y el estado activo marcado solo con `underline`.
// Los dos desplegables (menú hamburguesa `_DD` y menú de usuario `_UD`) traían
// los colores INCRUSTADOS en `style`:
//
//     background:"#1e293b", border:"1px solid #475569"   + `text-white`
//
// es decir, un panel oscuro fijo que en modo claro quedaba como un rectángulo
// negro con texto blanco, y que no se parecía a nada del resto de la interfaz.
// El drawer móvil iba aún más lejos: `bg-red-100 dark:bg-gray-700`, rosa.
//
// Este patch pasa las tres cosas —barra, desplegables y drawer— a los tokens
// que patch_42 dejó en :root (`--mt-line`, `--mt-surface-2`, `--mt-hover`,
// `--mt-fg`, `--mt-dim`, `--mt-accent`), así que la barra y las tarjetas
// comparten literalmente la misma paleta y el mismo tratamiento de foco/hover,
// y el modo claro funciona en los dos sitios.
//
// Además:
//   - La barra se vuelve `sticky` con superficie translúcida + blur y una
//     hairline inferior, para que al hacer scroll siga estando ahí y quede
//     separada del contenido. z-index 5: por encima de la página pero por
//     DEBAJO del velo del drawer móvil (z-10) y del propio drawer (z-50).
//   - Los enlaces pasan a pastillas con hover, y el activo se marca con color
//     de acento + una barra inferior, en vez de un subrayado del navegador.
//   - Los iconos (hamburguesa, engranaje, menú móvil) comparten una misma
//     zona de pulsación circular con hover y `:focus-visible`.
//   - Se respeta `prefers-reduced-motion`.
//
// El gutter horizontal lo sigue poniendo `.mt-nav` de patch_43, que es lo que
// mantiene la barra alineada con el contenido; aquí solo se añade el resto.
//
// DEBE ejecutarse ANTES de patch_10 (css_rename bumpea el hash del CSS).

;(() => {
const fs = require('fs');
const zlib = require('zlib');
const child = require('child_process');

const MARKER = '/*mt-fork:nav-redesign-v1*/';
const PUB = process.env.MT_PUBLIC || '/app/public';

// ================================================================== BUNDLE JS
const bundlePath = child
  .execSync("ls " + PUB + "/main_*.js | grep -v '\\.LICENSE\\|\\.map'")
  .toString().trim();
let js = fs.readFileSync(bundlePath, 'utf8');

if (js.includes(MARKER)) {
  console.log('nav redesign: bundle already patched');
} else {
  // [descripción, viejo, nuevo]. Cada `viejo` se ha comprobado único en el
  // bundle; si alguno deja de serlo (o desaparece) el patch aborta en vez de
  // dejar la barra a medio migrar.
  const EDITS = [
    ['enlaces del nav (span)',
      'r.createElement("span",{key:e.path,className:"m-1 mr-2 text-xl whitespace-nowrap"}',
      'r.createElement("span",{key:e.path,className:"mt-nav-item"}'],

    ['enlaces del nav (activo)',
      'className:function(e){return Be(e.isActive&&"underline")}',
      'className:function(e){return "mt-nav-link"+(e.isActive?" is-active":"")}'],

    ['bloque derecho del nav',
      'r.createElement("div",{className:"inline-flex ml-auto mr-2 whitespace-nowrap"}',
      'r.createElement("div",{className:"mt-nav-right"}'],

    ['boton de menu movil',
      'className:"flex px-2 cursor-pointer md:hidden material-icons"',
      'className:"material-icons mt-nav-icbtn mt-nav-burger md:hidden"'],

    ['hamburguesa (_DD)',
      'r.createElement("span",{className:"material-icons cursor-pointer text-2xl",onClick:function(){_setOpen(!_open)}},"menu")',
      'r.createElement("span",{className:"material-icons mt-nav-icbtn",role:"button",tabIndex:0,onClick:function(){_setOpen(!_open)}},"menu")'],

    ['panel del menu (_DD)',
      'style:{position:"absolute",top:"100%",left:0,zIndex:50,background:"#1e293b",border:"1px solid #475569",borderRadius:"0.25rem",padding:"0.5rem",minWidth:"10rem"}',
      'className:"mt-menu mt-menu-left"'],

    ['items del menu (_DD)',
      'Be("block py-1 px-2 text-base whitespace-nowrap text-white hover:bg-slate-700",o.isActive&&"underline font-bold")',
      'Be("mt-menu-item",o.isActive&&"is-active")'],

    ['disparador de usuario (_UD)',
      'r.createElement("div",{className:"flex items-center cursor-pointer select-none",onClick:function(){_setOpen(!_open)}}',
      'r.createElement("div",{className:"mt-nav-user",role:"button",tabIndex:0,onClick:function(){_setOpen(!_open)}}'],

    ['icono de usuario (_UD)',
      'r.createElement("span",{className:"material-icons text-2xl pr-1"},"settings")',
      'r.createElement("span",{className:"material-icons mt-nav-user-ic"},"settings")'],

    ['panel del menu (_UD)',
      'style:{position:"absolute",top:"100%",right:0,zIndex:50,background:"#1e293b",border:"1px solid #475569",borderRadius:"0.25rem",padding:"0.5rem",minWidth:"12rem"}',
      'className:"mt-menu mt-menu-right"'],

    ['fila de tema (_UD)',
      'className:"flex items-center justify-between py-1 px-2 cursor-pointer text-white hover:bg-slate-700"',
      'className:"mt-menu-item mt-menu-row"'],

    ['enlace de ajustes (_UD)',
      'Be("block py-1 px-2 text-white hover:bg-slate-700",o.isActive&&"underline")',
      'Be("mt-menu-item",o.isActive&&"is-active")'],

    ['cerrar sesion (_UD)',
      'className:"block py-1 px-2 text-white hover:bg-slate-700"',
      'className:"mt-menu-item"'],

    // El velo del drawer estaba en z-10, por debajo de la barra ahora que es
    // sticky (z-20): al abrir el menú móvil la página se atenuaba pero la barra
    // se quedaba encendida. Queda drawer(50) > velo(30) > barra(20) > página.
    ['velo del drawer movil',
      'className:Be("fixed top-0 bottom-0 left-0 right-0 z-10 w-full h-full bg-gray-500"',
      'className:Be("fixed top-0 bottom-0 left-0 right-0 z-30 w-full h-full bg-gray-500"'],

    ['panel del drawer movil',
      'className:"fixed top-0 right-0 z-50 p-4 pr-10 overflow-hidden bg-red-100 dark:bg-gray-700 -bottom-full"',
      'className:"fixed top-0 right-0 z-50 p-4 pr-10 overflow-hidden mt-drawer -bottom-full"'],

    ['items del drawer',
      'r.createElement("span",{key:e.path,className:"my-2 ml-1 mr-3 text-xl"}',
      'r.createElement("span",{key:e.path,className:"mt-drawer-item"}'],

    ['enlaces del drawer (activo)',
      'className:function(e){return Be(e.isActive&&"selected")}',
      'className:function(e){return "mt-nav-link"+(e.isActive?" is-active":"")}'],

    ['barra sin sesion iniciada',
      'r.createElement("div",{className:"flex items-center"},r.createElement("div",{className:"inline-flex ml-auto whitespace-nowrap"}',
      'r.createElement("div",{className:"flex items-center mt-nav"},r.createElement("div",{className:"mt-nav-right"}'],
  ];

  for (const [what, oldS, newS] of EDITS) {
    const n = js.split(oldS).length - 1;
    if (n !== 1) throw new Error('nav redesign: "' + what + '" aparece ' + n + ' veces (se esperaba 1)');
    js = js.split(oldS).join(newS);
  }

  fs.writeFileSync(bundlePath, MARKER + '\n' + js);
  console.log('nav redesign: ' + EDITS.length + ' sustituciones en ' + bundlePath);
}

// ======================================================================= CSS
const cssPath = child
  .execSync("ls " + PUB + "/main_*.css | grep -v '\\.gz\\|\\.br'")
  .toString().trim();
let css = fs.readFileSync(cssPath, 'utf8');

const CSS_MARKER = '/* mt-fork: nav redesign v1 */';
if (css.includes(CSS_MARKER)) {
  console.log('nav redesign: css already patched');
} else {
  if (!css.includes('--mt-accent')) {
    throw new Error('nav redesign: faltan los tokens de :root (¿no corrió patch_42?)');
  }

  const rules = '\n' + CSS_MARKER + '\n' + [
    // --- la barra ---------------------------------------------------------
    // El padding horizontal lo pone .mt-nav (patch_43) y es lo que la mantiene
    // alineada con el contenido; aquí solo superficie, altura y pegado.
    // `.mt-nav` y no `nav.mt-nav`: la barra de la pantalla de login es un <div>,
    // no un <nav>, y también tiene que quedar igual.
    '.mt-nav{',
      'position:sticky;top:0;z-index:20;',
      'min-height:52px;gap:2px;',
      'background:var(--mt-surface-2);',
      'border-bottom:1px solid var(--mt-line);',
      'box-sizing:border-box;',
    '}',
    // Translúcida + blur solo donde el navegador lo soporta: sin @supports, un
    // fallback sin blur dejaría el texto de la página leyéndose a través.
    '@supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){',
      '.mt-nav{',
        'background:color-mix(in srgb,var(--mt-surface-2) 82%,transparent);',
        '-webkit-backdrop-filter:blur(10px) saturate(1.3);',
        'backdrop-filter:blur(10px) saturate(1.3);',
      '}',
    '}',

    // --- enlaces ----------------------------------------------------------
    '.mt-nav-item{display:inline-flex;align-items:center;white-space:nowrap}',
    '.mt-nav-link{',
      'position:relative;display:inline-block;',
      'padding:7px 10px;border-radius:8px;',
      'color:var(--mt-dim);text-decoration:none;',
      'font-size:1rem;font-weight:500;line-height:1.2;',
      'transition:color .16s ease,background-color .16s ease;',
    '}',
    '.mt-nav-link:hover{color:var(--mt-fg);background:var(--mt-hover);text-decoration:none}',
    '.mt-nav-link.is-active{color:var(--mt-accent);font-weight:600}',
    // Barra inferior en vez del `underline` del navegador: se puede colocar y
    // colorear, y no se pega a las tildes.
    '.mt-nav-link.is-active::after{',
      'content:"";position:absolute;left:10px;right:10px;bottom:2px;',
      'height:2px;border-radius:2px;background:var(--mt-accent);',
    '}',
    '.mt-nav-link:focus-visible{outline:2px solid var(--mt-accent);outline-offset:-2px}',

    // --- iconos y bloque derecho ------------------------------------------
    '.mt-nav-right{display:inline-flex;align-items:center;margin-left:auto;white-space:nowrap}',
    '.material-icons.mt-nav-icbtn{',
      'display:inline-flex;align-items:center;justify-content:center;',
      'width:36px;height:36px;border-radius:9px;',
      'font-size:22px;color:var(--mt-dim);cursor:pointer;user-select:none;',
      'transition:color .16s ease,background-color .16s ease;',
    '}',
    '.material-icons.mt-nav-icbtn:hover{color:var(--mt-fg);background:var(--mt-hover)}',
    '.material-icons.mt-nav-icbtn:focus-visible{outline:2px solid var(--mt-accent);outline-offset:-2px}',
    // `.material-icons.mt-nav-icbtn{display:inline-flex}` es (0,2,0) y le ganaba
    // a la utilidad `md:hidden` de Tailwind (0,1,0), dejando el botón de menú
    // móvil visible también en escritorio. Se restituye a igual especificidad.
    '@media (min-width:768px){.material-icons.mt-nav-burger{display:none}}',

    '.mt-nav-user{',
      'display:flex;align-items:center;gap:6px;',
      'padding:5px 10px 5px 6px;border-radius:9px;',
      'color:var(--mt-dim);cursor:pointer;user-select:none;',
      'font-size:.95rem;font-weight:500;',
      'transition:color .16s ease,background-color .16s ease;',
    '}',
    '.mt-nav-user:hover{color:var(--mt-fg);background:var(--mt-hover)}',
    '.mt-nav-user:focus-visible{outline:2px solid var(--mt-accent);outline-offset:-2px}',
    '.material-icons.mt-nav-user-ic{font-size:21px;line-height:1;color:inherit}',

    // --- desplegables ------------------------------------------------------
    '.mt-menu{',
      'position:absolute;top:calc(100% + 6px);z-index:50;',
      'min-width:12rem;padding:6px;',
      'background:var(--mt-surface);',
      'border:1px solid var(--mt-line);border-radius:12px;',
      'box-shadow:0 10px 30px rgba(0,0,0,.14),0 2px 8px rgba(0,0,0,.08);',
    '}',
    ':root.dark .mt-menu{box-shadow:0 10px 30px rgba(0,0,0,.5),0 2px 8px rgba(0,0,0,.35)}',
    '.mt-menu-left{left:0}',
    '.mt-menu-right{right:0}',
    '.mt-menu-item{',
      'display:block;padding:8px 10px;border-radius:8px;',
      'color:var(--mt-fg);text-decoration:none;white-space:nowrap;',
      'font-size:.95rem;cursor:pointer;',
      'transition:background-color .14s ease,color .14s ease;',
    '}',
    '.mt-menu-item:hover{background:var(--mt-hover);text-decoration:none}',
    '.mt-menu-item.is-active{color:var(--mt-accent);font-weight:600}',
    '.mt-menu-item:focus-visible{outline:2px solid var(--mt-accent);outline-offset:-2px}',
    '.mt-menu-row{display:flex;align-items:center;justify-content:space-between;gap:12px}',
    '.mt-menu-row .material-icons{font-size:19px;color:var(--mt-dim)}',

    // --- drawer movil ------------------------------------------------------
    '.mt-drawer{',
      'background:var(--mt-surface);',
      'border-left:1px solid var(--mt-line);',
      'box-shadow:-12px 0 32px rgba(0,0,0,.18);',
    '}',
    ':root.dark .mt-drawer{box-shadow:-12px 0 32px rgba(0,0,0,.5)}',
    '.mt-drawer-item{display:block;margin:2px 0}',
    '.mt-drawer .mt-nav-link{display:block;padding:9px 12px;font-size:1.05rem}',
    '.mt-drawer .mt-nav-link.is-active::after{display:none}',
    '.mt-drawer .mt-nav-link.is-active{background:var(--mt-hover)}',

    '@media (prefers-reduced-motion:reduce){',
      '.mt-nav-link,.mt-nav-user,.mt-nav-icbtn,.mt-menu-item{transition:none}',
    '}',
    '@media (max-width:480px){',
      '.mt-nav{min-height:48px}',
    '}',
  ].join('') + '\n';

  css = css + rules;
  fs.writeFileSync(cssPath, css);
  // Re-emitir .gz/.br: el servidor sirve los precomprimidos.
  try { fs.writeFileSync(cssPath + '.gz', zlib.gzipSync(css, { level: 9 })); } catch (_) {}
  try { fs.writeFileSync(cssPath + '.br', zlib.brotliCompressSync(css)); } catch (_) {}
  console.log('nav redesign: appended css + recompressed ' + cssPath);
}

})();
