# Patches inventory

10 mega-patches (`patch_01`–`patch_10`) plus 50 standalone patches (`patch_11`–`patch_62`),
applied in order by the `Dockerfile`. Each mega-patch is the literal
concatenation of its constituent scripts (originally 184 individual `patch_*.js`
files, consolidated for readability); everything written after the
consolidation lives in its own file. Order across buckets is load-bearing —
many constituents anchor on markers created by earlier ones.

## Convention

Each constituent inside a mega-patch is wrapped in an IIFE so its top-level
declarations (`const fs = require('fs')`, etc.) don't collide with siblings.
`process.exit(0)` is rewritten to `return` so an early-success guard inside
one constituent doesn't abort the whole bucket. The typical mutation pattern:

```js
;(() => {
  const fs = require('fs');
  const path = '/app/build/...';
  let c = fs.readFileSync(path, 'utf8');
  if (c.includes('marker')) { console.log('already patched'); return; }
  if (!c.includes(anchor)) { console.error('anchor not found'); process.exit(1); }
  c = c.replace(anchor, fresh);
  fs.writeFileSync(path, c);
})();
```

Anchors are short fragments of the minified bundle. When upstream rebuilds with
a different minifier output, several anchors can break and have to be updated.

## Buckets

| # | File | Constituents | Domain |
|---|---|---|---|
| 01 | `patch_01_security_pre_npm.js` | 1 | Bumps direct deps + adds overrides in `package.json`. Must run BEFORE `npm install`. |
| 02 | `patch_02_backend_db_items.js` | 8 | SQLite pragmas, version tag, auto-restore, items SQL fixes, in-progress filter. |
| 03 | `patch_03_downloaded_links_wp.js` | 19 | `downloaded` flag end-to-end, custom links, watch-providers, login/register, progress card. |
| 04 | `patch_04_backup_audiobook_episodes.js` | 28 | Backup tab, audiobook position/progress, unify books, episodes table + per-episode progress, audio progress field, sidebar 2-col grid. |
| 05 | `patch_05_perf_seen_items_opt.js` | 22 | TMDB runtime fetch, IGDB HLTB, catalog cleanup, perf indexes (v1/v2/v3), `seen.kind`, items query optimizations (force-index, simple-count, short-circuit). |
| 06 | `patch_06_navigation_dupes_security.js` | 27 | Menu split + restructure, library search, lists/watchlist/downloaded tabs, sectioned pages, dupes detector, calendar + upcoming + recently-released, metadata throttle, IGDB time-to-beat backfill, `sw.js`/cache headers. |
| 07 | `patch_07_jellyfin_youtube_oauth.js` | 23 | Full Jellyfin integration (status, sync, play button, card badge, reverse-sync, runtime config), endpoint security gates (admin-only, IDOR fixes), YouTube channels + OAuth + watched tracking. |
| 08 | `patch_08_i18n_theater_homepage.js` | 21 | UI language switcher, custom i18n keys, theater media-type (Wikidata + teatro.es providers), homepage block reshuffle (drop audiobooks, add YouTube + theater), persistent navigation state. |
| 09 | `patch_09_abandoned_inprogress_counts.js` | 22 | Abandonados feature, actively-in-progress flag, combined item-flags endpoint, mark-watched button, theater detail-page polish, count fast-paths for new filters. |
| 10 | `patch_10_visual_tokens_bundle.js` | 13 | Background colors, `.btn-green`, items-grid CSS, `css_rename` content-hash bump, application-tokens hub (TMDB key + relocations), Jellyfin import buttons, `bundle_rename` content-hash bump, `index.html` title, PWA manifest + service worker. **Must run last** (the rename steps bump cache-busting hashes). |

Total: **184 constituents** across 10 mega-patches.

## Standalone patches (11–62)

Execution order in the `Dockerfile`: `01` → `npm install` → `02`…`09` →
`11`…`55`, `57`…`62` → **`10`** → bundle recompression → `56`.
Anything that touches the SPA bundle must run **before `patch_10`** (its rename
steps bump the content hashes). `patch_56` only touches the backend
(`knex/queries/items.js`), so it can run after. There is no `patch_15` / `patch_16`.

| # | File | What it does |
|---|---|---|
| 11 | `patch_11_db_pool_serialize.js` | Serialize SQLite writes (knex `pool.max = 1`): no more `SQLITE_BUSY` storms on parallel TMDB inserts. |
| 12 | `patch_12_inprogress_aip_excludes_seen.js` | *In progress* hides non-TV items already marked as seen. |
| 13 | `patch_13_progress_completion_watchlist.js` | Progress set to 100 % also removes non-TV items from the watchlist. |
| 14 | `patch_14_aip_series_button.js` | "In progress" toggle button on the series detail page. |
| 17 | `patch_17_button_reflects_in_progress.js` | Backend computes `details.inProgress`; the toggle reflects it. |
| 18 | `patch_18_recovery_actions_unabandon.js` | "Mark in progress" / "Add to watchlist" also clear *abandoned*. |
| 19 | `patch_19_flag_sync_event.js` | Flag-change event so sibling toggles re-render; *Resume* re-adds to the watchlist. |
| 20 | `patch_20_loose_aip_inprogress.js` | Manual "in progress" works for every type; `inProgress` exposed in the items API. |
| 21 | `patch_21_abandoned_visibility_complete_clears_aip.js` | Base filter includes abandoned items; completing clears "in progress". |
| 22 | `patch_22_aips_swap_colors.js` | Toggle colours follow the action (green = add, red = remove). |
| 23 | `patch_23_universal_aips_drop_modal.js` | "In progress" toggle for all media types; drop the modal duplicate. |
| 24 | `patch_24_move_mas_next_to_aips.js` | "Mark as seen" button next to the "in progress" toggle, same style. |
| 25 | `patch_25_aips_per_call_invalidation.js` | Per-request cache invalidation; `inProgress` respects abandoned. |
| 26 | `patch_26_home_perf.js` | Items cache TTL 5 min + progressive home render. |
| 27 | `patch_27_tv_seen_requires_ended.js` | A TV show only counts as completed once it has ended (not Returning / In Production). |
| 28 | `patch_28_card_progress_sentinel.js` | Card progress bar ignores the `audioProgress = 1` completed-pass sentinel. |
| 29 | `patch_29_list_items_progress_columns.js` | List pages select audio progress and the first-unwatched-episode progress. |
| 30 | `patch_30_sidebar_complete_atomic.js` | Sidebar "Mark as completed" is atomic (no duplicate seen, clears "in progress"). |
| 31 | `patch_31_items_basefilter_progress.js` | Items base filter accepts progress-only / "in progress"-only items. |
| 32 | `patch_32_metadata_rotate_oldest.js` | Metadata refresh rotates oldest-first (failed updates go to the back). |
| 33 | `patch_33_seen_tv_skip_already_seen.js` | Bulk "mark seen" on a show skips already-seen episodes. |
| 34 | `patch_34_pages_in_queries.js` | `numberOfPages` in `/api/items` and `/api/list/items` (page totals match the details page). |
| 35 | `patch_35_list_parity.js` | List query parity: downloaded flag, status case, `seenWatched`. |
| 36 | `patch_36_tv_watchlist_on_seen.js` | Finished shows leave the watchlist once every aired episode is seen. |
| 37 | `patch_37_watchlist_order_added.js` | Watchlist ordered by date added, newest first. |
| 38 | `patch_38_progress_modal_hours_minutes.js` | Progress modal in hours + minutes for movies, games and theatre. |
| 39 | `patch_39_episode_progress_hours_minutes.js` | Same hours + minutes progress for TV episodes. |
| 40 | `patch_40_progress_sync_views.js` | Progress written in one view shows up in the others. |
| 41 | `patch_41_youtube_watched_resilient.js` | YouTube "Mark watched" no longer depends on YouTube returning the duration. |
| 42 | `patch_42_section_accordion_redesign.js` | Redesigned section accordion (used across the app). |
| 43 | `patch_43_shell_full_width.js` | Full-width shell aligned with the navbar at any resolution. |
| 44 | `patch_44_airing_tv_stays_in_progress.js` | An airing show stays in *In progress* even when you are up to date. |
| 45 | `patch_45_nav_redesign.js` | Navbar redesign, homogeneous with the accordion. |
| 46 | `patch_46_inprogress_sections_open.js` | *In progress* sections start expanded. |
| 47 | `patch_47_home_centered.js` | Home page centred. |
| 48 | `patch_48_no_refetch_on_focus.js` | No spontaneous refetch on window focus / reconnect (the "flicker"). |
| 49 | `patch_49_aip_drops_when_season_over.js` | A show leaves *In progress* by itself when the season you were watching ends. |
| 50 | `patch_50_boot_reason_probe.js` | **Temporary** diagnostic probe for unexpected reloads (remove once closed). |
| 51 | `patch_51_rate_star_without_release_date.js` | Rating star on cards for items with no release date. |
| 52 | `patch_52_filmaffinity_rating.js` | FilmAffinity rating on movie / TV details pages. |
| 53 | `patch_53_metacritic_rating.js` | Metacritic Metascore on game details pages. |
| 54 | `patch_54_watchlist_recheck_on_metadata.js` | When a metadata refresh changes the status, re-check the watchlist (ended shows leave it). |
| 55 | `patch_55_rate_ignore_release_date.js` | You can rate items even if the release date is in the future. |
| 56 | `patch_56_seen_ahead_of_air_stays_in_progress.js` | Watching an episode before its official air date keeps the show in *In progress*. |
| 57 | `patch_57_ahead_episode_and_replay_bar.js` | *In progress* card shows the next episode even if not aired yet, and the bar of a rewatch. |
| 58 | `patch_58_ahead_episode_only_if_watched_ahead.js` | ...the unaired next episode only if you already watched one ahead of time. |
| 59 | `patch_59_start_page_preference.js` | "Start page" preference (Home / In progress), per device. |
| 60 | `patch_60_start_page_route.js` | With *In progress* as start page, `/` always goes there (also after login); Home moves to `/inicio`. |
| 61 | `patch_61_spa_fallback.js` | SPA fallback: reloading any frontend route (`/in-progress`...) serves the app instead of `Cannot GET`. |
| 62 | `patch_62_chapter_indicator.js` | Chapter indicator on top of the read / listen progress bars. |

## Maintenance

New patches are standalone files: write `patch_NN_<topic>.js` (same IIFE-friendly,
idempotent, fail-loud pattern) and add one `RUN --mount=type=bind,...` line to the
`Dockerfile` (**before `patch_10`** if it touches the SPA bundle), plus a row in the
table above.

To fold a patch into a mega-patch instead: write it as a self-contained `patch_<topic>.js` (using the
IIFE-friendly pattern above), add it to the right bucket in `_build_megapatches.js`
(at the position that respects its ordering constraints), and re-run
`docker run --rm -v "$PWD":/work -w /work node:20-alpine node _build_megapatches.js`
to regenerate the affected mega-patch. The `_build_megapatches.js` file is the
source of truth for the bucket map.
