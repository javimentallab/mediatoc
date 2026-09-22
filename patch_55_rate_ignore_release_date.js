// patch_55_rate_ignore_release_date.js
//
// "No sale para valorar el juego de Silent Hill que tengo en proceso. No sale
//  la estrella." -> "Pon que se pueda valorar a pesar de la fecha de
//  lanzamiento. Y asi con todas las fichas."
//
// Sintoma: Silent Hill: Townfall (IGDB 222342) esta en "En proceso" y no tiene
// estrella ni en la ficha ni en la caratula. IGDB le da releaseDate
// 2026-09-24 y se esta jugando antes (acceso anticipado), asi que para el
// bundle aun "no ha salido".
//
// Causa: todas las estrellas de puntuar estan detras de
//
//     Wo(x) || !No(y)     // "ya estrenado, o sin fecha"
//
// (patch_51 ya alineo la caratula con ese mismo idioma para los items sin
// fecha). Un item con fecha FUTURA no pasa ninguna de las dos ramas. patch_51
// lo dejo asi a proposito, copiando el upstream; aqui se decide lo contrario:
// la fecha de estreno no debe impedir puntuar. Hay acceso anticipado, fechas
// regionales y fechas de IGDB/TMDB que estan mal.
//
// Se quita el filtro de fecha en los 4 sitios que pintan la estrella (Yo) o la
// estrella + resena (Zp):
//   1. ficha del item            (Zp)
//   2. caratula / tarjeta        (Yo; `m` = appearance.showRating se respeta)
//   3. fila de episodio          (Yo con episode)
//   4. vista de temporada        (Yo con season)
//
// Lo que NO cambia, a proposito:
//   - Los botones de "visto"/progreso de la ficha y el "Add to seen history"
//     (Yp) siguen con su `Wo(x)||!No(y)`: solo se pidio poder valorar.
//   - El servidor no mira la fecha al guardar la nota (controllers/rating.js
//     no toca releaseDate), asi que no hace falta nada en /app/build.
//
// Debe ejecutarse DESPUES de patch_51 (reusa su ancla, marcador incluido) y
// ANTES de patch_10 (bundle_rename bumpea el hash).

;(() => {
const fs = require('fs');
const child = require('child_process');

const PUB = process.env.MT_PUBLIC || '/app/public';
const MARKER = '/*mt-fork:rate-ignore-release-date*/';

const bundlePath = child
  .execSync("ls " + PUB + "/main_*.js | grep -v '\\.LICENSE\\|\\.map'")
  .toString().trim();
let js = fs.readFileSync(bundlePath, 'utf8');

if (js.includes(MARKER)) {
  console.log('rate ignore release date: already patched');
  return;
}

const CARD_TAIL = 'r.createElement("div",{className:"absolute pointer-events-auto bottom-1 left-1"},'
                + 'r.createElement(Yo,{mediaItem:t,season:n,episode:a}))';

const REPLACEMENTS = [
  ['ficha',
   '(Wo(a)||!No(a))&&r.createElement(Zp,{userRating:a.userRating,mediaItem:a})',
   MARKER + 'r.createElement(Zp,{userRating:a.userRating,mediaItem:a})'],
  ['caratula',
   'm&&(Wo(t)||!No(t))&&/*mt-fork:rate-star-no-release-date*/' + CARD_TAIL,
   'm&&/*mt-fork:rate-star-no-release-date*/' + MARKER + CARD_TAIL],
  ['episodio',
   '(Wo(i)||!No(a))&&r.createElement(Yo,{mediaItem:a,episode:i})',
   MARKER + 'r.createElement(Yo,{mediaItem:a,episode:i})'],
  ['temporada',
   '(Wo(a)||!No(n))&&r.createElement(Yo,{mediaItem:n,season:a})',
   MARKER + 'r.createElement(Yo,{mediaItem:n,season:a})'],
];

// Primero se comprueban TODAS las anclas y luego se escribe: si una falla, el
// bundle queda intacto en vez de a medio parchear.
for (const [name, oldStr] of REPLACEMENTS) {
  const hits = js.split(oldStr).length - 1;
  if (hits !== 1) {
    throw new Error('rate ignore release date: expected 1 hit for the ' + name
      + ' anchor, found ' + hits + ' (did patch_51 or the upstream layout change?)');
  }
}

for (const [, oldStr, newStr] of REPLACEMENTS) {
  js = js.split(oldStr).join(newStr);
}

fs.writeFileSync(bundlePath, js);
console.log('rate ignore release date: rating star shown regardless of releaseDate in '
  + REPLACEMENTS.map(r => r[0]).join(', ') + ' (' + bundlePath + ')');

})();
