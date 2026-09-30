// patch_60_start_page_route.js
//
// "No es funcional: no me sale En proceso como principal" (28-sep-2026).
// patch_59 solo reescribia la URL al cargar la pagina en "/". Dentro de la app
// todo lo que lleva a "/" (volver tras el login -> <Navigate to="/">, el
// enlace "Inicio"...) seguia pintando Inicio.
// Ahora, con la preferencia `mtStartPage` = "in-progress":
// - La ruta "/" redirige a /in-progress. Se decide al renderizar la ruta, asi
//   que vale para la carga, el login y cualquier navegacion a "/".
// - El Inicio de siempre sigue accesible en /inicio, y el menu apunta ahi.
// Toca el bundle: tiene que ir ANTES de patch_10 (renombra el bundle por hash).

;(() => {
const fs = require('fs');
const dir = '/app/public';
const file = fs.readdirSync(dir).find(f => /^main_.*\.js$/.test(f) && !/LICENSE|\.map$/.test(f));
if (!file) throw new Error('start page route: bundle not found');
const path = dir + '/' + file;
let s = fs.readFileSync(path, 'utf8');
const MARKER = 'START_PAGE_ROUTE_V1';
if (s.includes(MARKER)) { console.log('start page route: already patched'); return; }

const once = (a, b, what) => {
  if (s.split(a).length - 1 !== 1) throw new Error('start page route: ' + what + ' anchor not found/unique');
  s = s.replace(a, b);
};

// Helper global, antes que nada del bundle
s = '/* ' + MARKER + ' */window._mtStartIP=function(){try{return localStorage.getItem("mtStartPage")==="in-progress"}catch(_){return false}};\n' + s;

// Menu: "Inicio" apunta a /inicio cuando En proceso es la principal
once('{path:"/",name:xo._("Home")}',
     '{path:(window._mtStartIP()?"/inicio":"/"),name:xo._("Home")}', 'menu');

// La barra de titulo solo pinta las rutas de una lista blanca: sin /inicio ahi,
// Inicio desaparecia del menu (30-sep-2026).
once('["/","/tv","/movies","/games","/books","/theater","/youtube"].indexOf(e.path)',
     '["/","/inicio","/tv","/movies","/games","/books","/theater","/youtube"].indexOf(e.path)', 'nav whitelist');

// Rutas: "/" decide al renderizar; /inicio = Inicio de siempre
once('r.createElement(Q,{path:"/",element:r.createElement(Xv,null)})',
     'r.createElement(Q,{path:"/",element:r.createElement(function(){return window._mtStartIP()?r.createElement(Y,{to:"/in-progress",replace:!0}):r.createElement(Xv,null)})}),'
   + 'r.createElement(Q,{path:"/inicio",element:r.createElement(Xv,null)})', 'route');

fs.writeFileSync(path, s);
console.log('start page route: "/" -> /in-progress when preferred, Home at /inicio');
})();
