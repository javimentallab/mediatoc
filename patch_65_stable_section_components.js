// patch_65_stable_section_components.js
//
// "El parpadeo [...] a los 5 o 10 segundos de abrirla" (30-oct-2026). Grabado en video:
// ~31 s despues de abrir, TODAS las caratulas de En proceso vuelven a la vez al "?" y
// reaparecen con el fundido. Ni una peticion en el access.log en ese momento.
//
// Causa: las paginas de secciones definen su componente de seccion DENTRO del componente
// de pagina:
//
//     _IPS=function(){var _Section=function(props){...}; ... createElement(_Section, ...)}
//
// Cada render de la pagina crea una funcion nueva -> React la ve como OTRO tipo de
// componente -> desmonta y vuelve a montar todas las secciones con todas sus caratulas
// (las imagenes vuelven al placeholder). Lo que dispara ese render sin red es el
// temporizador de staleTime de react-query: a los 30 s (staleTime global, mt-fork:rq-stale)
// una consulta de arriba (usuario/configuracion) pasa a "stale" y re-renderiza el shell.
// A los 60 s caducan las de las rejillas, pero esas estan DENTRO de cada seccion y solo
// repintan su rejilla: por eso solo se ve un parpadeo, a los ~30 s.
//
// Arreglo, sin mover codigo (no hace falta casar llaves al reescribir):
//
//     var _Section=function(props){BODY};
//  -> var _Section=(C[n]||(C[n]=function(p){return I[n](p)}));I[n]=function(props){BODY};
//
// C[n] es un envoltorio creado UNA vez: React ve siempre el mismo tipo y no remonta.
// I[n] se reasigna en cada render, asi que el cuerpo sigue viendo las variables actuales
// de la pagina. Los hooks del cuerpo corren dentro del render del envoltorio, en el mismo
// orden: misma semantica que antes.
// Afecta a _Section de En proceso (_IPS), Seguimiento (_WLS), Abandonados (_ABS), juegos
// vistos (_GVS) y Descargados, y a los _GamesSection definidos igual.
// Toca el bundle: tiene que ir ANTES de patch_10 (renombra el bundle por hash).

;(() => {
const fs = require('fs');
const child = require('child_process');

const PUB = process.env.MT_PUBLIC || '/app/public';
const MARKER = '/*mt-fork:stable-section-components*/';

const bundlePath = child
  .execSync("ls " + PUB + "/main_*.js | grep -v '\\.LICENSE\\|\\.map'")
  .toString().trim();
let js = fs.readFileSync(bundlePath, 'utf8');

if (js.includes(MARKER)) {
  console.log('stable section components: already patched');
  return;
}

// Indice de la '}' que cierra la '{' en `open` (salta cadenas '', "", ``).
const bodyEnd = (s, open) => {
  let d = 0, q = null;
  for (let k = open; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === '\\') { k++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return k; }
  }
  return -1;
};

const RE = /var (_Section|_GamesSection)=function\((props)?\)\{/g;
const found = [];
let m;
while ((m = RE.exec(js)) !== null) {
  const end = bodyEnd(js, m.index + m[0].length - 1);
  if (end < 0 || js[end + 1] !== ';') {
    throw new Error('stable section components: ' + m[1] + ' en ' + m.index +
                    ' no termina en "};" (se esperaba; ¿cambio el bundle?)');
  }
  found.push({ at: m.index, len: m[0].length, name: m[1], arg: m[2] || '' });
}
if (found.length < 5) {
  throw new Error('stable section components: solo ' + found.length + ' secciones (se esperaban >= 5)');
}

// Reescribir de atras hacia delante para no mover los indices pendientes
for (let n = found.length - 1; n >= 0; n--) {
  const f = found[n];
  const repl = 'var ' + f.name + '=(window.__mtSecC[' + n + ']||(window.__mtSecC[' + n +
               ']=function(p){return window.__mtSecI[' + n + '](p)}));' +
               'window.__mtSecI[' + n + ']=function(' + f.arg + '){';
  js = js.slice(0, f.at) + repl + js.slice(f.at + f.len);
}

js = MARKER + 'window.__mtSecC={};window.__mtSecI={};\n' + js;
fs.writeFileSync(bundlePath, js);
console.log('stable section components: ' + found.length + ' componentes de seccion con identidad estable');
})();
