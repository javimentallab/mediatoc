// patch_63_chapters_metadata.js  (requires patch_34 + patch_62)
//
// "Numero de capitulos" as an EDITABLE metadata field in the book/audiobook
// ficha, next to pages / author / runtime, wired to the progress modal so the
// chapter count shown over the read/listen bars (patch_62) MATCHES the ficha.
//
// Flow:
//   - mediaItem.numberOfChapters (nullable int) is the single source of truth.
//   - Audiobooks (Audible): prefilled with the REAL chapter count from Audible's
//     content metadata endpoint (unauthenticated), discounting "creditos/credits"
//     (part dividers like "Tomo I" are kept). An EXISTING value (backfill or user
//     edit) is preserved on refresh; Audible is only queried when it is empty.
//   - Printed books (OpenLibrary): no chapters in the provider, so the field
//     starts from an estimate round(numberOfPages/20) marked "(estim.)" until the
//     user sets it. update() only touches present columns, so an OpenLibrary
//     refresh never wipes a user-set value.
//   - The ficha field is editable: saving PUTs ?numberOfChapters=N to
//     /api/audio-progress (setAudioProgress), which patches the column, then
//     invalidates the query cache so ficha + modal refetch and agree.
//   - patch_62's modal uses N = t.numberOfChapters || round(estimate), the SAME
//     rule the ficha uses when unset -> they always concur.
//
// Parts: A migration · B entity · C items.js mapping · D Audible provider
// (fetch + preserve existing + discount credits) · E ficha editable field ·
// F setAudioProgress accepts numberOfChapters.
// Backend edits touch /app/build/** -> post-npm-install (patch_02+). The bundle
// edit (E) must run BEFORE patch_10 and the .br/.gz recompression.

// ===== Part A: migration (add column numberOfChapters) =====
;(() => {
  const fs = require('fs');
  const path = '/app/build/migrations/20261029120000_addNumberOfChaptersToMediaItem.js';
  if (fs.existsSync(path)) { console.log('patch_63 A: migration already exists'); return; }
  const content = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = down;
exports.up = up;
async function up(knex) {
  const has = await knex.schema.hasColumn('mediaItem', 'numberOfChapters');
  if (!has) {
    await knex.schema.alterTable('mediaItem', table => {
      table.integer('numberOfChapters');
    });
  }
}
async function down(knex) {
  const has = await knex.schema.hasColumn('mediaItem', 'numberOfChapters');
  if (has) {
    await knex.schema.alterTable('mediaItem', table => {
      table.dropColumn('numberOfChapters');
    });
  }
}
`;
  fs.writeFileSync(path, content);
  console.log('patch_63 A: migration created');
})();

// ===== Part B: entity mediaItemColumns += numberOfChapters =====
;(() => {
  const fs = require('fs');
  const path = '/app/build/entity/mediaItem.js';
  let c = fs.readFileSync(path, 'utf8');
  if (c.includes("'numberOfChapters'")) { console.log('patch_63 B: entity already patched'); return; }
  const old = "'downloaded', 'audioProgress', 'links'];";
  const fresh = "'downloaded', 'audioProgress', 'numberOfChapters', 'links'];";
  if (c.split(old).length - 1 !== 1) { console.error('patch_63 B: anchor count != 1'); process.exit(1); }
  fs.writeFileSync(path, c.replace(old, fresh));
  console.log('patch_63 B: entity mediaItemColumns += numberOfChapters');
})();

// ===== Part C: items.js mapRawResult mapping =====
;(() => {
  const fs = require('fs');
  const path = '/app/build/knex/queries/items.js';
  let c = fs.readFileSync(path, 'utf8');
  if (c.includes("numberOfChapters: row['mediaItem.numberOfChapters']")) { console.log('patch_63 C: items.js already patched'); return; }
  const old = "numberOfPages: row['mediaItem.numberOfPages'],";
  const fresh = "numberOfPages: row['mediaItem.numberOfPages'],\n    numberOfChapters: row['mediaItem.numberOfChapters'],";
  if (c.split(old).length - 1 !== 1) { console.error('patch_63 C: anchor count != 1'); process.exit(1); }
  c = c.replace(old, fresh);
  fs.writeFileSync(path, c);
  try {
    delete require.cache[require.resolve(path)];
    require(path);
    console.log('patch_63 C: items.js mapping added, syntax OK');
  } catch (e) {
    console.error('patch_63 C: items.js SYNTAX ERROR -> ' + String(e.message || '').slice(0, 400));
    process.exit(1);
  }
})();

// ===== Part D: Audible provider -> fetch real chapter count, preserve existing =====
;(() => {
  const fs = require('fs');
  const path = '/app/build/metadata/provider/audible.js';
  let c = fs.readFileSync(path, 'utf8');
  if (c.includes('fetchChapterCount')) { console.log('patch_63 D: audible already patched'); return; }
  const old =
    "    return this.mapResponse(res.data.product, countryCode);\n" +
    "  }\n" +
    "  mapResponse(item, countryCode) {";
  const fresh =
    "    const __mapped = this.mapResponse(res.data.product, countryCode);\n" +
    "    const __existing = Number(arg && arg.numberOfChapters) || 0;\n" +
    "    if (__existing > 0) {\n" +
    "      __mapped.numberOfChapters = __existing;\n" +
    "    } else {\n" +
    "      try {\n" +
    "        const __nc = await this.fetchChapterCount(audibleId, countryCode);\n" +
    "        if (__nc !== undefined) __mapped.numberOfChapters = __nc;\n" +
    "      } catch (e) {}\n" +
    "    }\n" +
    "    return __mapped;\n" +
    "  }\n" +
    "  async fetchChapterCount(audibleId, countryCode) {\n" +
    "    try {\n" +
    "      const res = await _axios.default.get(`https://api.audible.${this.domain(countryCode)}/1.0/content/${audibleId}/metadata`, { params: { response_groups: 'chapter_info' } });\n" +
    "      const ci = res && res.data && res.data.content_metadata && res.data.content_metadata.chapter_info;\n" +
    "      const chapters = (ci && ci.chapters) || [];\n" +
    "      if (!chapters.length) return undefined;\n" +
    "      const isCredits = t => /cr[e\\u00e9]dito|credit/i.test(String(t || ''));\n" +
    "      const n = chapters.filter(ch => !isCredits(ch.title)).length;\n" +
    "      return n > 0 ? n : chapters.length;\n" +
    "    } catch (e) { return undefined; }\n" +
    "  }\n" +
    "  mapResponse(item, countryCode) {";
  if (c.split(old).length - 1 !== 1) { console.error('patch_63 D: anchor count != 1 -> ' + (c.split(old).length - 1)); process.exit(1); }
  c = c.replace(old, fresh);
  fs.writeFileSync(path, c);
  try {
    delete require.cache[require.resolve(path)];
    require(path);
    console.log('patch_63 D: audible provider patched, syntax OK');
  } catch (e) {
    console.error('patch_63 D: audible SYNTAX ERROR -> ' + String(e.message || '').slice(0, 400));
    process.exit(1);
  }
})();

// ===== Part E: frontend ficha -> EDITABLE "Capitulos" field =====
;(() => {
  const fs = require('fs');
  const cp = require('child_process');
  const bundlePath = cp.execSync('ls /app/public/main_*.js | grep -v "\\.LICENSE\\|\\.map"').toString().trim();
  let c = fs.readFileSync(bundlePath, 'utf8');
  if (c.includes('data-mt-chapters')) { console.log('patch_63 E: bundle already patched'); return; }
  const anchor = 'a.numberOfPages),Ro(a)&&';
  if (c.split(anchor).length - 1 !== 1) { console.error('patch_63 E: anchor count != 1 -> ' + (c.split(anchor).length - 1)); process.exit(1); }
  // Editable field. No React hooks (injected as a child expression): uncontrolled
  // number input keyed on the effective value, saved via setAudioProgress, then
  // cache invalidation (HW = module QueryClient; ReferenceError-safe fallback to
  // a reload if HW is out of this module's scope).
  const el =
    '(function(){' +
    'if(a.mediaType!=="book"&&a.mediaType!=="audiobook")return null;' +
    'var _nc=Number(a.numberOfChapters)||0;' +
    'var _est=0;' +
    'if(!_nc){if(a.mediaType==="book"&&Number(a.numberOfPages)>0)_est=Math.max(1,Math.round(Number(a.numberOfPages)/20));else if(Number(a.runtime)>0)_est=Math.max(1,Math.round(Number(a.runtime)/30));}' +
    'var _eff=_nc||_est||1;' +
    'var _save=function(){' +
    'var _el=document.getElementById("mtch_"+a.id);' +
    'var _v=Math.max(1,Math.round(Number(_el&&_el.value)||0));' +
    'if(!_v)return;' +
    'fetch("/api/audio-progress?mediaItemId="+a.id+"&numberOfChapters="+_v,{method:"PUT",credentials:"same-origin"})' +
    '.then(function(){try{HW.invalidateQueries()}catch(e){try{location.reload()}catch(_){}}}).catch(function(){});' +
    '};' +
    'return r.createElement("div",{"data-mt-chapters":"1",className:"flex items-center",style:{gap:"0.4rem"}},' +
    'r.createElement("span",{className:"font-bold"},"Cap\\u00edtulos",":"," "),' +
    'r.createElement("input",{key:"mtch"+_eff,id:"mtch_"+a.id,type:"number",min:1,defaultValue:_eff,style:{width:"4.8rem",color:"#111",backgroundColor:"#fff",border:"1px solid #999",borderRadius:"4px",padding:"1px 4px"}}),' +
    'r.createElement("button",{className:"border rounded px-2 py-0.5 text-sm",onClick:_save},"Guardar"),' +
    '(_nc?null:r.createElement("span",{className:"text-xs",style:{opacity:0.6}},"(estim.)")))' +
    '})()';
  c = c.replace(anchor, 'a.numberOfPages),' + el + ',Ro(a)&&');
  fs.writeFileSync(bundlePath, c);
  console.log('patch_63 E: editable "Capitulos" field inserted in ficha');
})();

// ===== Part F: setAudioProgress accepts numberOfChapters =====
;(() => {
  const fs = require('fs');
  const path = '/app/build/controllers/item.js';
  let c = fs.readFileSync(path, 'utf8');
  if (c.includes('req.query.numberOfChapters')) { console.log('patch_63 F: item.js already patched'); return; }

  const declOld = "    const numberOfPages = req.query.numberOfPages;";
  const declNew = declOld + "\n    const numberOfChapters = req.query.numberOfChapters;";
  if (c.split(declOld).length - 1 !== 1) { console.error('patch_63 F: decl anchor count != 1'); process.exit(1); }
  c = c.replace(declOld, declNew);

  const blockOld =
    "    if (numberOfPages !== undefined && numberOfPages !== null && numberOfPages !== '' && !Number.isNaN(Number(numberOfPages))) {\n" +
    "      const n = Math.max(1, Math.round(Number(numberOfPages)));\n" +
    "      patch.numberOfPages = n;\n" +
    "    }";
  const blockNew = blockOld + "\n" +
    "    if (numberOfChapters !== undefined && numberOfChapters !== null && numberOfChapters !== '' && !Number.isNaN(Number(numberOfChapters))) {\n" +
    "      patch.numberOfChapters = Math.max(1, Math.round(Number(numberOfChapters)));\n" +
    "    }";
  if (c.split(blockOld).length - 1 !== 1) { console.error('patch_63 F: block anchor count != 1'); process.exit(1); }
  c = c.replace(blockOld, blockNew);

  fs.writeFileSync(path, c);
  try {
    delete require.cache[require.resolve(path)];
    require(path);
    console.log('patch_63 F: setAudioProgress accepts numberOfChapters, syntax OK');
  } catch (e) {
    console.error('patch_63 F: item.js SYNTAX ERROR -> ' + String(e.message || '').slice(0, 400));
    process.exit(1);
  }
})();

console.log('patch_63: complete');
