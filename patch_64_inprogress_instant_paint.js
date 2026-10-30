// patch_64_inprogress_instant_paint.js
//
// "El parpadeo del MediaToc solo pasa cuando abro la pagina, al principio" (30-oct-2026).
//
// Medido en el access.log de nginx al abrir (30-oct 08:09): las cinco secciones de
// "En proceso" piden sus items a la vez, pero el servidor las sirve en serie (pool
// de SQLite max:1, patch_11) y en frio Peliculas tarda ~1,2 s. Llegan Series,
// Juegos, Libros y Teatro (08:09:32) y por ultimo Peliculas (08:09:33). Mientras
// carga, cada seccion pinta una sola linea ("Loading"); al llegar sus datos crece
// de golpe varias filas de caratulas. Peliculas es la de ARRIBA, asi que cuando por
// fin se rellena empuja hacia abajo todas las que ya estaban pintadas: ese salto
// es el parpadeo. (La sonda patch_50 ya habia descartado recargas reales.)
//
// Arreglo: las rejillas de "En proceso" (args con onlyWithProgress) guardan su
// ultima respuesta en localStorage y la usan como placeholderData al montar. La
// pagina sale al instante con su altura de siempre; react-query pide los datos
// frescos igual y los cambia en silencio (solo se nota si algo cambio de verdad).
// - placeholderData NO entra en la cache: no altera staleTime, keepPreviousData
//   ni la invalidacion de patch_40 (tras marcar visto/puntuar se sigue refrescando).
// - El hook marcaba isLoading con !isFetched, que sigue en false mientras se ve el
//   placeholder: se cambia a !isFetched && !isPlaceholderData, o seguiria saliendo
//   "Loading".
// - Solo para onlyWithProgress (las 5 secciones, ~15 KB en total): el catalogo y
//   las demas rejillas siguen igual.
// Toca el bundle: tiene que ir ANTES de patch_10 (renombra el bundle por hash).

;(() => {
const fs = require('fs');
const child = require('child_process');

const PUB = process.env.MT_PUBLIC || '/app/public';
const MARKER = '/*mt-fork:inprogress-instant-paint*/';

const bundlePath = child
  .execSync("ls " + PUB + "/main_*.js | grep -v '\\.LICENSE\\|\\.map'")
  .toString().trim();
let js = fs.readFileSync(bundlePath, 'utf8');

if (js.includes(MARKER)) {
  console.log('in-progress instant paint: already patched');
  return;
}

const once = (a, b, what) => {
  const n = js.split(a).length - 1;
  if (n !== 1) throw new Error('in-progress instant paint: ancla "' + what + '" aparece ' + n + ' veces (se esperaba 1)');
  js = js.replace(a, b);
};

// Helpers globales, antes que nada del bundle
js = MARKER + 'window._mtIpc={k:function(e){return e&&e.onlyWithProgress?"mt_ipc:"+JSON.stringify(e):null},' +
  'get:function(e){var k=this.k(e);if(!k)return void 0;try{var v=localStorage.getItem(k);return v?JSON.parse(v):void 0}catch(_){return void 0}},' +
  'set:function(e,d){var k=this.k(e);if(!k||!d)return;try{localStorage.setItem(k,JSON.stringify(d))}catch(_){}}};\n' + js;

// Opciones del useQuery de ["items", e] (hook dg, patch mt-fork:items-query-cache)
once('{keepPreviousData:!0,staleTime:60000,cacheTime:300000}/*mt-fork:items-query-cache*/',
     '{keepPreviousData:!0,staleTime:60000,cacheTime:300000,' +
     'placeholderData:function(){return window._mtIpc.get(e)},' +
     'onSuccess:function(d){window._mtIpc.set(e,d)}}/*mt-fork:items-query-cache*/',
     'opciones useQuery items');

// isLoading: con placeholder ya hay algo que pintar
once('a=t.isFetched,i=(0,d.useMutation)((function(t){return Se.search.search({mediaType:e.mediaType,q:t})}));return{items:i.data?i.data:null==r?void 0:r.data,error:n,isLoading:!a||i.isLoading,',
     'a=t.isFetched||t.isPlaceholderData,i=(0,d.useMutation)((function(t){return Se.search.search({mediaType:e.mediaType,q:t})}));return{items:i.data?i.data:null==r?void 0:r.data,error:n,isLoading:!a||i.isLoading,',
     'isLoading del hook items');

fs.writeFileSync(bundlePath, js);
console.log('in-progress instant paint: las rejillas de En proceso pintan su ultima respuesta al abrir');
})();
