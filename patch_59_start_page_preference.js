// patch_59_start_page_preference.js
//
// "Pon una opcion para establecer la pagina de inicio: Inicio o En proceso"
// (28-sep-2026).
// - Ajustes -> Preferencias: selector "Pagina de inicio". Se guarda en
//   localStorage (`mtStartPage`), por dispositivo, igual que el idioma de la
//   interfaz (`uiLang`).
// - Al cargar la app en "/" con la preferencia "in-progress" se reescribe la
//   URL a /in-progress ANTES de que arranque el router. Solo en la carga: pulsar
//   "Inicio" en el menu despues sigue llevando a Inicio.
// Toca el bundle: tiene que ir ANTES de la recompresion.

;(() => {
const fs = require('fs');
const dir = '/app/public';
const file = fs.readdirSync(dir).find(f => /^main_.*\.js$/.test(f) && !/LICENSE|\.map$/.test(f));
if (!file) throw new Error('start page: bundle not found');
const path = dir + '/' + file;
let s = fs.readFileSync(path, 'utf8');
const MARKER = 'START_PAGE_PREF_V1';
if (s.includes(MARKER)) { console.log('start page: already patched'); return; }

// 1) Selector en Preferencias (vy)
const anchor = 'checked:t.hideOverviewForUnseenSeasons,onChange:function(e){return n({hideOverviewForUnseenSeasons:e})}})';
if (s.split(anchor).length - 1 !== 1) throw new Error('start page: preferences anchor not found/unique');
const sel = ',r.createElement("div",{className:"mt-3"}),r.createElement(my,{title:"Página de inicio"},'
  + 'r.createElement("select",{defaultValue:(function(){try{return localStorage.getItem("mtStartPage")||"home"}catch(_){return "home"}})(),'
  + 'onChange:function(e){var v=e.currentTarget.value;try{if(v==="home"){localStorage.removeItem("mtStartPage")}else{localStorage.setItem("mtStartPage",v)}}catch(_){}}},'
  + 'r.createElement("option",{value:"home"},xo._("Home")),r.createElement("option",{value:"in-progress"},xo._("In progress"))))';
s = s.replace(anchor, anchor + sel);

// 2) Redireccion en la carga, antes que nada del bundle
const redirect = '/* ' + MARKER + ' */try{if(location.pathname==="/"&&localStorage.getItem("mtStartPage")==="in-progress"){history.replaceState(history.state,"","/in-progress"+location.search+location.hash)}}catch(_){}\n';
s = redirect + s;

fs.writeFileSync(path, s);
console.log('start page: preference selector + load-time redirect');
})();
