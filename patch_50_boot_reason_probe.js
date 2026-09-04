// patch_50_boot_reason_probe.js
//
// SONDA TEMPORAL DE DIAGNOSTICO — quitar cuando se cierre el caso del parpadeo.
//
// "Hay un parpadeo raro todavia cuando tengo la pagina abierta. Es un refresh."
//
// Lo ya descartado con evidencia (4-sep-2026), para no repetirlo:
//   - patch_48 sigue aplicado: refetchOnWindowFocus y refetchOnReconnect estan
//     en false en el bundle vivo. No es un refetch de react-query.
//   - No hay nada periodico: cero refetchInterval, el unico setInterval es
//     interno de react-query y los EventSource son de la importacion de Trakt
//     y de FullCalendar.
//   - La app NO se recarga a si misma: los dos unicos location.reload() estan
//     detras de un clic + alert (cambiar idioma y "Cargar duraciones desde
//     TMDB"), y el unico location.href= es el click de evento de FullCalendar.
//   - No es un cuelgue del renderer: el ultimo volcado de Crashpad de Brave es
//     del 1-sep.
//   - No es un F5 de AutoHotkey: ningun script del usuario manda F5 ni Ctrl+R.
//
// Lo que SI esta pasando, medido en el access.log de nginx (04/sep):
//   10:01:10  GET /sw.js        <- fin del arranque anterior
//   ...       87 segundos sin UNA sola peticion (ni imagenes)
//   10:02:37  GET /             <- carga de documento completa, sin tocar nada
//   10:02:38  manifest + /api/user + /api/configuration + las 5 queries de
//             "En proceso"      <- arranque limpio de la app
// Es decir: recarga real del documento, ordenada por el navegador, con la
// pestana parada. En todo el dia hay 11 cargas de documento asi.
//
// Esta sonda contesta POR QUE. En cada arranque manda un GET a /mt-boot (404
// inofensivo, lo unico que interesa es que nginx lo registre) con:
//   nav   = performance navigation type: navigate | reload | back_forward
//   disc  = document.wasDiscarded — 1 si el navegador habia DESCARTADO la
//           pestana y la esta restaurando (ahorro de memoria de Brave)
//   vis   = visibilityState en el arranque
//   pvis  = visibilityState en el ultimo latido ANTES de morir
//   gap   = ms desde ese ultimo latido (sessionStorage sobrevive al reload y
//           al descarte dentro de la misma pestana)
//
// Como se lee el resultado:
//   disc=1                  -> ahorro de memoria de Brave descartando la pestana
//   pvis=hidden             -> murio de fondo; no lo estabas mirando
//   pvis=visible + nav=reload -> se recargo delante de ti (F5 fantasma, o el
//                             navegador reciclando el proceso del renderer)
//   gap enorme + nav=navigate -> pestana nueva / restauracion de sesion
//
// El latido escribe en sessionStorage cada 5 s. No sale ni una peticion a la
// red salvo la unica de arranque.

;(() => {
const fs = require('fs');
const child = require('child_process');

const PUB = process.env.MT_PUBLIC || '/app/public';
const MARKER = '/*mt-fork:boot-reason-probe*/';

const bundlePath = child
  .execSync("ls " + PUB + "/main_*.js | grep -v '\\.LICENSE\\|\\.map'")
  .toString().trim();
let js = fs.readFileSync(bundlePath, 'utf8');

if (js.includes(MARKER)) {
  console.log('boot reason probe: already patched');
  return;
}

// Se anade al FINAL: el bundle termina en "}()}();" y asi no se toca el
// arranque de webpack. Va antes de patch_10, que rehashea y recomprime.
const probe = "\n;" + MARKER + "(function(){try{" +
  "var K='mt_boot_hb';" +
  "var prev=null;try{prev=JSON.parse(sessionStorage.getItem(K)||'null')}catch(_){}" +
  "var nav='?';try{var e=(performance.getEntriesByType('navigation')||[])[0];if(e&&e.type)nav=e.type}catch(_){}" +
  "var q='/mt-boot?nav='+encodeURIComponent(nav)" +
    "+'&disc='+(document.wasDiscarded?1:0)" +
    "+'&vis='+encodeURIComponent(document.visibilityState)" +
    "+'&pvis='+encodeURIComponent(prev&&prev.vis?prev.vis:'-')" +
    "+'&gap='+(prev&&prev.t?(Date.now()-prev.t):-1);" +
  "try{fetch(q,{credentials:'same-origin',cache:'no-store'}).catch(function(){})}catch(_){}" +
  "var beat=function(){try{sessionStorage.setItem(K,JSON.stringify({t:Date.now(),vis:document.visibilityState}))}catch(_){}};" +
  "beat();setInterval(beat,5000);" +
  "document.addEventListener('visibilitychange',beat);" +
  "window.addEventListener('pagehide',beat);" +
"}catch(_){}})();\n";

fs.writeFileSync(bundlePath, js + probe);

try {
  child.execSync('node --check ' + bundlePath, { stdio: 'pipe' });
  console.log('boot reason probe: appended to ' + bundlePath + ' + syntax OK');
} catch (e) {
  console.error('boot reason probe: SYNTAX ERROR -> ' + String(e.message || '').slice(0, 400));
  process.exit(1);
}

})();
