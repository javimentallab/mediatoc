// patch_38_progress_modal_hours_minutes.js
//
// Progress modal (Rp), fallback section — movies / games / theater now get the
// same hours+minutes UI the audiobook section already had, instead of the bare
// "N minutes" number input (Ip) plus a percent-only slider:
//
//   Duración total: [ h ] [ min ]
//   ──────────●─────────────
//            1h 47min (62%)
//
//  * The total duration seeds from mediaItem.runtime; for games (no runtime in
//    TMDB/IGDB) it seeds from the HowLongToBeat estimate once it loads, falling
//    back to the previous 600 min default.
//  * The duration is only written back to the DB when the user actually edits
//    the h/min boxes (_durTouched), so moving the slider never rewrites the
//    item's runtime metadata behind the user's back.
//  * TV (with or without a target episode) keeps the percent slider — there is
//    no single meaningful total duration for a whole show.

;(() => {
const fs = require('fs');
const bundlePath = require('child_process')
  .execSync('ls /app/public/main_*.js | grep -v "\\.LICENSE\\|\\.map"').toString().trim();
let c = fs.readFileSync(bundlePath, 'utf8');

if (c.includes('RP_HM_V1')) { console.log('progress h/m: already applied'); return; }

// --- 1. extra state: was the duration hand-edited + seed maxD from HLTB ------
const hltbEffect = 'r.useEffect(function(){if(Ao(t)){fetch("/api/hltb?mediaItemId="+t.id,{credentials:"same-origin"}).then(function(r){return r.json()}).then(setHltb).catch(function(){})}},[t.id]);';
if (!c.includes(hltbEffect)) { console.error('progress h/m: hltb effect anchor not found'); process.exit(1); }
const extraState = hltbEffect +
  'var _dtu=s((0,r.useState)(!1),2),_durTouched=_dtu[0],_setDurTouched=_dtu[1];' +
  'r.useEffect(function(){' +
    'if(hltb&&!t.runtime&&!_durTouched){' +
      'var _hv=hltb.normally||hltb.completely||hltb.hastily;' +
      'if(_hv)setMaxD(Math.max(1,Math.round(_hv)))' +
    '}' +
  '},[hltb]);';
c = c.replace(hltbEffect, extraState);
console.log('progress h/m: added _durTouched state + HLTB duration seed');

// --- 2. persist the edited duration on save ---------------------------------
const oldSave = 'fetch("/api/audio-progress?mediaItemId="+t.id+"&numberOfPages="+Number(maxP||0),{method:"PUT",credentials:"same-origin"}).catch(function(){});';
if (!c.includes(oldSave)) { console.error('progress h/m: _save numberOfPages anchor not found'); process.exit(1); }
const newSave = '(function(){var _qs="";' +
  'if(_showRead)_qs+="&numberOfPages="+Number(maxP||0);' +
  'if(_durTouched&&!_tvEp&&!Ro(t))_qs+="&runtime="+Number(maxD||0);' +
  'if(_qs)fetch("/api/audio-progress?mediaItemId="+t.id+_qs,{method:"PUT",credentials:"same-origin"}).catch(function(){})' +
'})();';
c = c.replace(oldSave, newSave);
console.log('progress h/m: _save persists hand-edited duration (and no longer writes numberOfPages to non-books)');

// --- 3. the fallback section itself -----------------------------------------
const oldTail = '(Io(t)&&t.runtime)&&r.createElement(Ip,{max:maxD,progress:i,setProgress:o,mediaType:t.mediaType}),' +
  'r.createElement("div",{className:"text-lg mt-2"},"Progreso:"),' +
  'r.createElement("div",{className:"flex items-center mb-4"},' +
    'r.createElement("input",{className:"w-full my-2 mr-2",type:"range",value:i,min:0,max:100,onChange:function(e){o(Number(e.currentTarget.value))}}),' +
    'r.createElement("span",{className:"w-10 text-right"},Math.round(i),"%"))';
if (!c.includes(oldTail)) { console.error('progress h/m: fallback slider anchor not found'); process.exit(1); }

const newTail = '/*RP_HM_V1*/' +
  // movies / games / theater — time based
  '(!_tvEp&&!Ro(t))&&r.createElement("div",{style:_sectionStyle},' +
    'r.createElement("div",{className:"text-lg"},xo._("Set duration in hours and minutes")+":"),' +
    'r.createElement("div",{style:{display:"flex",alignItems:"center",gap:"0.5rem"}},' +
      'r.createElement("input",{type:"number",min:0,value:Math.floor(maxD/60),style:{width:"4rem"},onChange:function(e){_setDurTouched(!0);setMaxD(Math.max(1,Number(e.currentTarget.value)*60+(maxD%60)))}}),' +
      'r.createElement("span",null,"h"),' +
      'r.createElement("input",{type:"number",min:0,max:59,value:maxD%60,style:{width:"4rem"},onChange:function(e){_setDurTouched(!0);setMaxD(Math.max(1,Math.floor(maxD/60)*60+Number(e.currentTarget.value)))}}),' +
      'r.createElement("span",null,"min")' +
    '),' +
    'r.createElement("div",{className:"text-lg mt-3"},"Progreso:"),' +
    'r.createElement("input",{className:"w-full my-3",type:"range",min:0,max:maxD,value:Math.round(i*maxD/100),onChange:function(e){o(Math.min(100,Number(e.currentTarget.value)/maxD*100))}}),' +
    'r.createElement("div",{className:"text-center text-lg"},Math.floor(Math.round(i*maxD/100)/60),"h ",Math.round(i*maxD/100)%60,"min ",r.createElement("span",{className:"text-sm text-gray-500"},"(",Math.round(i),"%)"))' +
  '),' +
  // tv — percent based, unchanged
  '(_tvEp||Ro(t))&&r.createElement(r.Fragment,null,' +
    'r.createElement("div",{className:"text-lg mt-2"},"Progreso:"),' +
    'r.createElement("div",{className:"flex items-center mb-4"},' +
      'r.createElement("input",{className:"w-full my-2 mr-2",type:"range",value:i,min:0,max:100,onChange:function(e){o(Number(e.currentTarget.value))}}),' +
      'r.createElement("span",{className:"w-10 text-right"},Math.round(i),"%")' +
    ')' +
  ')';
c = c.replace(oldTail, newTail);
console.log('progress h/m: fallback section now shows hours+minutes');

fs.writeFileSync(bundlePath, c);
console.log('patch_38: complete');
})();
