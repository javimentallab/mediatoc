// patch_48_no_refetch_on_focus.js
//
// "Mediatoc tiene una recarga rara, pasa de vez en cuando, que es molesta."
// Sintoma: en el PC, en pleno uso y sin patron, la pagina parpadea y se
// refresca sola.
//
// Descartado primero (para que nadie lo vuelva a investigar de cero):
//   - La app NO se recarga a si misma: en todo el bundle solo hay dos
//     location.reload() y los dos son de un clic del usuario (cambiar idioma
//     y "Cargar duraciones desde TMDB"). Ni history.go(0), ni meta refresh.
//   - NO es un managed_challenge de Cloudflare: el PC sale por Mullvad
//     (es-mad-wg-101), pero CrowdSec no tiene ninguna decision sobre esa IP y
//     el navegador no tiene cookie cf_clearance para javimetallab.com.
//   - NO es un crash del renderer: los volcados de Crashpad de Brave son de
//     mayo-julio y Brave marca exited_cleanly.
//   - NO hay refresco periodico: refetchInterval no aparece en el bundle.
//
// La causa es que `refetchOnWindowFocus` nunca se toco y react-query v3 lo
// trae en `true`. Combinado con el `staleTime` de 30 s que SI pusimos adrede
// (mt-fork:rq-stale, y 60 s para ["items"] en mt-fork:items-query-cache),
// cualquier vuelta a la ventana pasados 30 segundos refetchea de golpe todas
// las queries montadas — sin que el usuario haya hecho nada. Eso es el
// parpadeo "sin patron".
//
// Se desactiva tambien `refetchOnReconnect` (mismo default heredado): el PC
// navega a traves de Mullvad, asi que los eventos de reconexion de red son
// frecuentes y disparan exactamente el mismo refetch masivo.
//
// Lo que NO se toca, a proposito:
//   - staleTime (30 s / 60 s) y el cache de respuesta del servidor
//     (ITEMS_RESPONSE_CACHE_V1, TTL 30 s): siguen igual.
//   - La invalidacion tras escrituras (patch_40, HW.invalidateQueries): marcar
//     visto, puntuar o editar progreso sigue refrescando las vistas al vuelo.
//     Ver [[feedback_mediatoc_query_invalidation]].
//   Es decir: los datos se siguen refrescando cuando pasa algo; lo unico que
//   desaparece es el refresco espontaneo al recuperar foco o red.
//
// Debe ejecutarse ANTES de patch_10 (bundle_rename bumpea el hash).

;(() => {
const fs = require('fs');
const child = require('child_process');

const PUB = process.env.MT_PUBLIC || '/app/public';
const MARKER = '/*mt-fork:no-refetch-on-focus*/';

const bundlePath = child
  .execSync("ls " + PUB + "/main_*.js | grep -v '\\.LICENSE\\|\\.map'")
  .toString().trim();
let js = fs.readFileSync(bundlePath, 'utf8');

if (js.includes(MARKER)) {
  console.log('no refetch on focus: already patched');
  return;
}

// Ancla: los defaults del QueryClient global (HW), justo donde patch_08
// (patch_query_cache_tuning) dejo su marcador.
const OLD = 'keepPreviousData:!0,staleTime:30000,/*mt-fork:rq-stale*/';
const NEW = 'keepPreviousData:!0,staleTime:30000,refetchOnWindowFocus:!1,refetchOnReconnect:!1,'
          + '/*mt-fork:rq-stale*/' + MARKER;

const hits = js.split(OLD).length - 1;
if (hits !== 1) {
  throw new Error('no refetch on focus: expected 1 hit for the rq-stale anchor, found ' + hits
    + ' (did patch_08 patch_query_cache_tuning change or fail?)');
}

js = js.split(OLD).join(NEW);
fs.writeFileSync(bundlePath, js);
console.log('no refetch on focus: refetchOnWindowFocus + refetchOnReconnect disabled in ' + bundlePath);

})();
