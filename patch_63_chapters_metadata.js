// patch_63_chapters_metadata.js  (requires patch_34 + patch_62)
//
// "Numero de capitulos" as a real metadata field in the book/audiobook ficha,
// next to pages / author / runtime.
//
//   - Audiobooks (Audible): REAL chapter count, pulled from Audible's content
//     metadata endpoint (/1.0/content/<asin>/metadata?response_groups=chapter_info),
//     which answers unauthenticated. "Creditos iniciales/finales" (and English
//     "credits") are discounted; part dividers like "Tomo I" are kept.
//   - Printed books (OpenLibrary): no chapters in the provider, so the ficha
//     shows an ESTIMATE ceil(numberOfPages / 20) marked "(aprox.)" (same divisor
//     as the patch_62 progress indicator).
//
// New nullable integer column mediaItem.numberOfChapters holds the REAL audiobook
// value; the book estimate is computed in the frontend and never stored.
//
// Parts: A migration (column) · B entity mediaItemColumns · C items.js mapping ·
// D Audible provider (fetch + discount credits) · E frontend ficha render.
// Backend edits touch /app/build/** -> must run post-npm-install (patch_02+).
// The frontend edit touches the bundle -> must run BEFORE patch_10 and the
// .br/.gz recompression. Markers: MT_CHAPTERS_* / data-mt-chapters.

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

// ===== Part D: Audible provider -> fetch real chapter count (discount credits) =====
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
    "    try {\n" +
    "      const __nc = await this.fetchChapterCount(audibleId, countryCode);\n" +
    "      if (__nc !== undefined) __mapped.numberOfChapters = __nc;\n" +
    "    } catch (e) {}\n" +
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

// ===== Part E: frontend ficha -> "Capitulos" row =====
;(() => {
  const fs = require('fs');
  const cp = require('child_process');
  const bundlePath = cp.execSync('ls /app/public/main_*.js | grep -v "\\.LICENSE\\|\\.map"').toString().trim();
  let c = fs.readFileSync(bundlePath, 'utf8');
  if (c.includes('data-mt-chapters')) { console.log('patch_63 E: bundle already patched'); return; }
  const anchor = 'a.numberOfPages),Ro(a)&&';
  if (c.split(anchor).length - 1 !== 1) { console.error('patch_63 E: anchor count != 1 -> ' + (c.split(anchor).length - 1)); process.exit(1); }
  // element: real count for audiobooks (a.numberOfChapters); estimate for books.
  const el =
    '(function(){' +
    'var _nc=Number(a.numberOfChapters)||0;' +
    'var _est=(!_nc&&a.mediaType==="book"&&Number(a.numberOfPages)>0)?Math.max(1,Math.ceil(Number(a.numberOfPages)/20)):0;' +
    'if(!_nc&&!_est)return null;' +
    'return r.createElement("div",{"data-mt-chapters":"1"},' +
    'r.createElement("span",{className:"font-bold"},"Cap\\u00edtulos",":"," "),' +
    '_nc?String(_nc):("~"+_est+" (aprox.)"))' +
    '})()';
  c = c.replace(anchor, 'a.numberOfPages),' + el + ',Ro(a)&&');
  fs.writeFileSync(bundlePath, c);
  console.log('patch_63 E: "Capitulos" row inserted in ficha');
})();

console.log('patch_63: complete');
