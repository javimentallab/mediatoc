// patch_46_inprogress_sections_open.js
//
// "Que las pestañas de En proceso estén abiertas por defecto, que sea su estado
//  inicial cuando pase a esa sección."
//
// El `_Section` de la página /in-progress arrancaba cerrado y solo se abría si
// sessionStorage tenía un '1' guardado:
//
//     var _secKey  = 'mt_sec_' + props.label;
//     var _secInit = sessionStorage.getItem(_secKey) === '1';   // → false
//
// Ahora arranca abierto siempre que entras a la página. Como el shell remonta
// el contenido en cada cambio de ruta (`key: location.pathname` en TS), plegar
// una sección sigue funcionando mientras estés en ella, pero al volver a entrar
// vuelven a estar las cinco abiertas — que es justo "su estado inicial cuando
// paso a esa sección".
//
// De paso se va sessionStorage de esta página, y con él un efecto cruzado que
// tenía: la clave era `mt_sec_<etiqueta>` SIN prefijo de página, así que
// "Películas" de En proceso y "Películas" de la Watchlist compartían entrada y
// se plegaban a la vez.
//
// Solo se toca el `_Section` de `_IPS`. En ese mismo scope hay definidos un
// `_SubSection` y un `_GamesSection` con el mismo prólogo, pero la página no
// los renderiza (de hecho `_GamesSection` referencia un `props` que no existe
// en su scope y reventaría si alguien lo montase), así que quedan intactos: el
// ancla incluye `_IPS=function(){var _Section=function(props){` para no
// confundirse con ellos ni con las copias de _WLS / _DLP / _ABS.
//
// Coste medido de abrir las cinco de golpe (pool de SQLite max:1, van en
// serie): 2,17 s en frío —1227 ms de Películas, 523 de Series, 222 de Juegos,
// 172 de Libros, 26 de Teatro— y 0 ms con el caché del servidor caliente. Es el
// mismo trabajo que antes, solo que junto en vez de repartido según abrías.

;(() => {
const fs = require('fs');
const child = require('child_process');

const PUB = process.env.MT_PUBLIC || '/app/public';
const bundlePath = child
  .execSync("ls " + PUB + "/main_*.js | grep -v '\\.LICENSE\\|\\.map'")
  .toString().trim();
let js = fs.readFileSync(bundlePath, 'utf8');

const ANCHOR = '_IPS=function(){var _Section=function(props){';

const PROLOGUE =
  "var _secKey='mt_sec_'+String((typeof props!=='undefined'&&props&&props.label)||'_section');" +
  "var _secInit=(function(){try{return sessionStorage.getItem(_secKey)==='1'}catch(_){return false}})();" +
  'var st=r.useState(_secInit),open=st[0],_secSetOpen=st[1];' +
  "var setOpen=function(v){try{sessionStorage.setItem(_secKey,v?'1':'0')}catch(_){}_secSetOpen(v)};";

const REPLACEMENT = '/*mt-fork:in-progress-open-by-default*/var st=r.useState(true),open=st[0],setOpen=st[1];';

if (js.includes('mt-fork:in-progress-open-by-default')) {
  console.log('in-progress open: already patched');
  return;
}

const n = js.split(ANCHOR).length - 1;
if (n !== 1) throw new Error('in-progress open: el ancla _IPS aparece ' + n + ' veces (se esperaba 1)');

const at = js.indexOf(ANCHOR) + ANCHOR.length;
if (!js.startsWith(PROLOGUE, at)) {
  throw new Error('in-progress open: el prologo de _Section no es el esperado (¿cambio patch_06/patch_42?)');
}

js = js.slice(0, at) + REPLACEMENT + js.slice(at + PROLOGUE.length);
fs.writeFileSync(bundlePath, js);
console.log('in-progress open: las 5 secciones de /in-progress arrancan abiertas');

})();
