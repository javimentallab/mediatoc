FROM bonukai/mediatracker:latest@sha256:4397847ec1a88a83e29a9c19c31261af47de730047adc7dbe4bbcbb34ca27df1

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -q -O /dev/null "http://$(hostname):7481/api/configuration" || exit 1

# --- Security: CVE updates (Trivy-flagged HIGH/CRITICAL on the upstream image) ---

# Alpine: upgrade ALL OS-level packages with HIGH/CRITICAL CVEs flagged by Trivy
# (libcrypto3, libssl3, libpng, expat, libexpat, musl, musl-utils, lcms2, zlib).
# `apk upgrade --available` bumps anything where the repo has a newer version,
# which is the only way to clear most of these without changing base image.
RUN apk update && apk upgrade --no-cache --available && rm -rf /var/cache/apk/*

# Layer budget: every patch runs as ONE layer via a read-only bind mount
# (`RUN --mount=type=bind,source=patch_NN.js,target=/tmp/patch_NN.js node ...`).
# Don't go back to COPY + RUN per patch: that's two layers each and at ~130
# the build dies with "max depth exceeded" (overlayfs limit, hit in CI with
# patch_55). The bind mount keeps per-patch cache invalidation.

# Bucket 01 — pre-npm: bumps direct deps (axios, fast-xml-parser, form-data, lodash)
# and adds overrides for path-to-regexp + tar-fs in /app/package.json. Must run
# BEFORE `npm install` so the new ranges + overrides take effect on rebuild.
SHELL ["/bin/sh", "-eo", "pipefail", "-c"]
RUN --mount=type=bind,source=patch_01_security_pre_npm.js,target=/tmp/patch_01_security_pre_npm.js node /tmp/patch_01_security_pre_npm.js

# Upstream image ships only the node binary (no npm) so install npm via apk for
# this layer, run install, then keep npm installed (~45MB) — `apk del npm` also
# removes its nodejs dep, which clobbers /usr/local/bin/node and breaks every
# later `RUN node /tmp/patch_*.js` step. Acceptable trade-off.
RUN apk add --no-cache npm && \
    cd /app && rm -f package-lock.json && \
    npm install --legacy-peer-deps --no-audit --no-fund 2>&1 | tail -25 && \
    rm -rf /root/.npm /var/cache/apk/*

# Force express's nested path-to-regexp to 0.1.13 — npm overrides + nested
# install both failed in this image. Workaround: download the 0.1.13 tarball
# from the npm registry and overwrite the nested copy in-place. The 0.1.13
# release is a single-file regex change so this is safe.
# Targets CVE-2026-4867 (ReDoS via catastrophic backtracking).
RUN cd /tmp && \
    wget -q https://registry.npmjs.org/path-to-regexp/-/path-to-regexp-0.1.13.tgz && \
    mkdir -p ptr && tar xzf path-to-regexp-0.1.13.tgz -C ptr && \
    rm -rf /app/node_modules/express/node_modules/path-to-regexp && \
    mv ptr/package /app/node_modules/express/node_modules/path-to-regexp && \
    rm -rf /tmp/ptr /tmp/path-to-regexp-0.1.13.tgz && \
    node -p "'path-to-regexp (express nested) → ' + require('/app/node_modules/express/node_modules/path-to-regexp/package.json').version"

# Sanity: print resolved versions for the bumped packages so build logs document the fix.
RUN cd /app && for p in axios fast-xml-parser form-data lodash ajv nanoid sharp; do \
      echo "$p: $(node -p "require('$p/package.json').version")"; \
    done

# Smoke test: actually LOAD the two packages most likely to break, not just
# read their package.json. sharp ships a native binary (libvips) resolved on
# Alpine musl through an optionalDependency (@img/sharp-linuxmusl-*); if npm
# install picks the wrong one, `require('sharp')` blows up here instead of in
# production. nanoid rides along because it must stay CJS: if it ever gets
# bumped to 5.x (ESM-only) this require fails and the build says so.
# The Trivy workflow only builds and scans, it never starts the app, so
# without this check a broken bump would sail through CI green.
RUN cd /app && node -e " \
      const sharp = require('sharp'); \
      const n = require('nanoid'); \
      if (typeof sharp !== 'function') throw new Error('sharp does not export a function'); \
      for (const f of ['nanoid', 'customAlphabet', 'customRandom', 'random']) { \
        if (typeof n[f] !== 'function') throw new Error('nanoid: missing export ' + f); \
      } \
      if (typeof n.urlAlphabet !== 'string') throw new Error('nanoid: missing urlAlphabet'); \
      console.log('smoke: sharp ' + sharp.versions.sharp + ' / libvips ' + sharp.versions.vips + ' + nanoid CJS OK'); \
    "

# --- Mega-patches 02 → 10 (consolidated from ~184 individual patch_*.js scripts) ---
# Each mega-patch is the literal concatenation of its constituents in execution
# order; each constituent is wrapped in an IIFE so its top-level vars don't
# collide, and `process.exit(0)` is rewritten to `return` so an early-success
# guard inside one constituent doesn't abort the whole mega-patch.
# Run order matters: 02 lays the SQL/items foundation; 03–05 add features and
# perf optimizations; 06 reshuffles navigation; 07 wires Jellyfin + YouTube +
# endpoint security; 08 adds i18n + theater + homepage; 09 adds abandoned/
# in-progress states; 10 finishes with CSS/bundle hash bumps + PWA.

# Bucket 02 — backend foundation (SQL pragmas, items query fixes, in-progress filter)
RUN --mount=type=bind,source=patch_02_backend_db_items.js,target=/tmp/patch_02_backend_db_items.js node /tmp/patch_02_backend_db_items.js

# Inline: force DD/MM/YYYY date format in the bundle (one-shot sed, not a patch).
# Sits between buckets 02 and 03 — order is irrelevant since no later patch
# expects the original `.toLocaleDateString()` pattern.
RUN BUNDLE=$(ls /app/public/main_*.js) && \
    sed -i 's/\.toLocaleDateString()/.toLocaleDateString("es",{day:"2-digit",month:"2-digit",year:"numeric"})/g' "$BUNDLE" && \
    echo "Frontend: date format DD/MM/YYYY OK"

# Bucket 03 — downloaded + links + watch-providers + small features
RUN --mount=type=bind,source=patch_03_downloaded_links_wp.js,target=/tmp/patch_03_downloaded_links_wp.js node /tmp/patch_03_downloaded_links_wp.js

# Bucket 04 — backup, audiobook, episodes, audio progress, UI tweaks
RUN --mount=type=bind,source=patch_04_backup_audiobook_episodes.js,target=/tmp/patch_04_backup_audiobook_episodes.js node /tmp/patch_04_backup_audiobook_episodes.js

# Bucket 05 — fetch_runtimes, hltb, cleanup, perf indexes, seen_kind, items query optimizations
RUN --mount=type=bind,source=patch_05_perf_seen_items_opt.js,target=/tmp/patch_05_perf_seen_items_opt.js node /tmp/patch_05_perf_seen_items_opt.js

# Bucket 06 — navigation reshuffle, dupes, late perf, security middleware
RUN --mount=type=bind,source=patch_06_navigation_dupes_security.js,target=/tmp/patch_06_navigation_dupes_security.js node /tmp/patch_06_navigation_dupes_security.js

# Bucket 07 — Jellyfin integration, endpoint security gates, YouTube + OAuth
RUN --mount=type=bind,source=patch_07_jellyfin_youtube_oauth.js,target=/tmp/patch_07_jellyfin_youtube_oauth.js node /tmp/patch_07_jellyfin_youtube_oauth.js

# Bucket 08 — i18n custom keys, UI language switcher, Theater providers, homepage finals
RUN --mount=type=bind,source=patch_08_i18n_theater_homepage.js,target=/tmp/patch_08_i18n_theater_homepage.js node /tmp/patch_08_i18n_theater_homepage.js

# Bucket 09 — abandoned + actively-in-progress + theater detail-page + count fixes
RUN --mount=type=bind,source=patch_09_abandoned_inprogress_counts.js,target=/tmp/patch_09_abandoned_inprogress_counts.js node /tmp/patch_09_abandoned_inprogress_counts.js

# --- patch_11: serialize SQLite writes (pool.max=1) to kill BUSY storm on parallel TMDB inserts ---
RUN --mount=type=bind,source=patch_11_db_pool_serialize.js,target=/tmp/patch_11_db_pool_serialize.js node /tmp/patch_11_db_pool_serialize.js

# --- patch_12: in /in-progress, exclude non-tv items the user has already marked seen ---
RUN --mount=type=bind,source=patch_12_inprogress_aip_excludes_seen.js,target=/tmp/patch_12_inprogress_aip_excludes_seen.js node /tmp/patch_12_inprogress_aip_excludes_seen.js

# --- patch_13: on /api/progress?progress=1 (slider to 100%), also remove non-TV items from the watchlist ---
RUN --mount=type=bind,source=patch_13_progress_completion_watchlist.js,target=/tmp/patch_13_progress_completion_watchlist.js node /tmp/patch_13_progress_completion_watchlist.js
# --- patch_14: TV-only series-level "in progress" toggle button on detail page (right of sg) ---
RUN --mount=type=bind,source=patch_14_aip_series_button.js,target=/tmp/patch_14_aip_series_button.js node /tmp/patch_14_aip_series_button.js
# --- patch_17: details.inProgress computed flag + _AIPS button reflects it ---
RUN --mount=type=bind,source=patch_17_button_reflects_in_progress.js,target=/tmp/patch_17_button_reflects_in_progress.js node /tmp/patch_17_button_reflects_in_progress.js
# --- patch_18: engagement actions (Marcar en proceso / Add to watchlist) also unmark abandoned ---
RUN --mount=type=bind,source=patch_18_recovery_actions_unabandon.js,target=/tmp/patch_18_recovery_actions_unabandon.js node /tmp/patch_18_recovery_actions_unabandon.js
# --- patch_19: flag-change event + _AB/_AIPS sync + Reanudar re-adds to watchlist ---
RUN --mount=type=bind,source=patch_19_flag_sync_event.js,target=/tmp/patch_19_flag_sync_event.js node /tmp/patch_19_flag_sync_event.js
# --- patch_20: loosen AIP-manual gate + add inProgress computed flag + popup uses it ---
RUN --mount=type=bind,source=patch_20_loose_aip_inprogress.js,target=/tmp/patch_20_loose_aip_inprogress.js node /tmp/patch_20_loose_aip_inprogress.js
# --- patch_21: base filter includes abandoned items; _markCompleted also clears AIP ---
RUN --mount=type=bind,source=patch_21_abandoned_visibility_complete_clears_aip.js,target=/tmp/patch_21_abandoned_visibility_complete_clears_aip.js node /tmp/patch_21_abandoned_visibility_complete_clears_aip.js
# --- patch_22: swap _AIPS button colors (action-based: red=remove, green=add) ---
RUN --mount=type=bind,source=patch_22_aips_swap_colors.js,target=/tmp/patch_22_aips_swap_colors.js node /tmp/patch_22_aips_swap_colors.js
# --- patch_23: _AIPS for all media types; drop modal AIP toggle ---
RUN --mount=type=bind,source=patch_23_universal_aips_drop_modal.js,target=/tmp/patch_23_universal_aips_drop_modal.js node /tmp/patch_23_universal_aips_drop_modal.js
# --- patch_24: move _MAS next to _AIPS and match its outline style ---
RUN --mount=type=bind,source=patch_24_move_mas_next_to_aips.js,target=/tmp/patch_24_move_mas_next_to_aips.js node /tmp/patch_24_move_mas_next_to_aips.js
# --- patch_25: _AIPS per-fetch invalidation + inProgress respects abandoned ---
RUN --mount=type=bind,source=patch_25_aips_per_call_invalidation.js,target=/tmp/patch_25_aips_per_call_invalidation.js node /tmp/patch_25_aips_per_call_invalidation.js
# --- patch_26: items cache TTL 5min + progressive home render ---
RUN --mount=type=bind,source=patch_26_home_perf.js,target=/tmp/patch_26_home_perf.js node /tmp/patch_26_home_perf.js
# --- patch_27: TV seen flag requires status NOT Returning/InProduction/Planned ---
RUN --mount=type=bind,source=patch_27_tv_seen_requires_ended.js,target=/tmp/patch_27_tv_seen_requires_ended.js node /tmp/patch_27_tv_seen_requires_ended.js
# --- patch_28: card progress bar ignores the audioProgress=1 completed-pass sentinel ---
RUN --mount=type=bind,source=patch_28_card_progress_sentinel.js,target=/tmp/patch_28_card_progress_sentinel.js node /tmp/patch_28_card_progress_sentinel.js
# --- patch_29: list pages select audioProgress + first-unwatched-episode progress ---
RUN --mount=type=bind,source=patch_29_list_items_progress_columns.js,target=/tmp/patch_29_list_items_progress_columns.js node /tmp/patch_29_list_items_progress_columns.js
# --- patch_30: sidebar "Marcar como completado" atomic (no dup seen, awaits cleanup, clears AIP) ---
RUN --mount=type=bind,source=patch_30_sidebar_complete_atomic.js,target=/tmp/patch_30_sidebar_complete_atomic.js node /tmp/patch_30_sidebar_complete_atomic.js
# --- patch_31: items base filter accepts progress-only / AIP-only items ---
RUN --mount=type=bind,source=patch_31_items_basefilter_progress.js,target=/tmp/patch_31_items_basefilter_progress.js node /tmp/patch_31_items_basefilter_progress.js
# --- patch_32: metadata throttle rotates oldest-first (fixes refresh starvation) ---
RUN --mount=type=bind,source=patch_32_metadata_rotate_oldest.js,target=/tmp/patch_32_metadata_rotate_oldest.js node /tmp/patch_32_metadata_rotate_oldest.js
# --- patch_33: TV bulk mark-seen skips already-seen episodes (no dup passes) ---
RUN --mount=type=bind,source=patch_33_seen_tv_skip_already_seen.js,target=/tmp/patch_33_seen_tv_skip_already_seen.js node /tmp/patch_33_seen_tv_skip_already_seen.js
# --- patch_34: expose numberOfPages in /api/items and /api/list/items (page totals match the ficha) ---
RUN --mount=type=bind,source=patch_34_pages_in_queries.js,target=/tmp/patch_34_pages_in_queries.js node /tmp/patch_34_pages_in_queries.js
# --- patch_35: list query parity - downloaded flag, status case, seenWatched ---
RUN --mount=type=bind,source=patch_35_list_parity.js,target=/tmp/patch_35_list_parity.js node /tmp/patch_35_list_parity.js

# --- patch_36: PUT /api/seen removes finished TV shows from the watchlist ---
RUN --mount=type=bind,source=patch_36_tv_watchlist_on_seen.js,target=/tmp/patch_36_tv_watchlist_on_seen.js node /tmp/patch_36_tv_watchlist_on_seen.js

# --- patch_37: watchlist sections ordered by "recently added to the watchlist" ---
RUN --mount=type=bind,source=patch_37_watchlist_order_added.js,target=/tmp/patch_37_watchlist_order_added.js node /tmp/patch_37_watchlist_order_added.js

# --- patch_38: progress modal shows hours+minutes for movies/games (not bare minutes) ---
RUN --mount=type=bind,source=patch_38_progress_modal_hours_minutes.js,target=/tmp/patch_38_progress_modal_hours_minutes.js node /tmp/patch_38_progress_modal_hours_minutes.js

# --- patch_39: same hours+minutes progress for TV episodes (card + per-episode button) ---
RUN --mount=type=bind,source=patch_39_episode_progress_hours_minutes.js,target=/tmp/patch_39_episode_progress_hours_minutes.js node /tmp/patch_39_episode_progress_hours_minutes.js

# --- patch_40: progress written in one view shows up in the others (cache + list query) ---
RUN --mount=type=bind,source=patch_40_progress_sync_views.js,target=/tmp/patch_40_progress_sync_views.js node /tmp/patch_40_progress_sync_views.js

# --- patch_41: /youtube "Marcar visto" ya no depende de que YouTube suelte la duracion ---
RUN --mount=type=bind,source=patch_41_youtube_watched_resilient.js,target=/tmp/patch_41_youtube_watched_resilient.js node /tmp/patch_41_youtube_watched_resilient.js

# --- patch_42: rediseno del acordeon de secciones (9 copias del mismo markup) ---
RUN --mount=type=bind,source=patch_42_section_accordion_redesign.js,target=/tmp/patch_42_section_accordion_redesign.js node /tmp/patch_42_section_accordion_redesign.js

# --- patch_43: shell a ancho completo, alineado con el nav en cualquier resolucion ---
RUN --mount=type=bind,source=patch_43_shell_full_width.js,target=/tmp/patch_43_shell_full_width.js node /tmp/patch_43_shell_full_width.js

# --- patch_44: una serie en emision sigue en En proceso aunque estes al dia ---
RUN --mount=type=bind,source=patch_44_airing_tv_stays_in_progress.js,target=/tmp/patch_44_airing_tv_stays_in_progress.js node /tmp/patch_44_airing_tv_stays_in_progress.js

# --- patch_45: barra principal homogeneizada con el resto (tokens de :root) ---
RUN --mount=type=bind,source=patch_45_nav_redesign.js,target=/tmp/patch_45_nav_redesign.js node /tmp/patch_45_nav_redesign.js

# --- patch_46: las secciones de En proceso arrancan abiertas ---
RUN --mount=type=bind,source=patch_46_inprogress_sections_open.js,target=/tmp/patch_46_inprogress_sections_open.js node /tmp/patch_46_inprogress_sections_open.js

# --- patch_47: la portada (Inicio) centrada, resumen y secciones ---
RUN --mount=type=bind,source=patch_47_home_centered.js,target=/tmp/patch_47_home_centered.js node /tmp/patch_47_home_centered.js

# --- patch_48: sin refetch espontaneo al recuperar foco o red (el parpadeo) ---
RUN --mount=type=bind,source=patch_48_no_refetch_on_focus.js,target=/tmp/patch_48_no_refetch_on_focus.js node /tmp/patch_48_no_refetch_on_focus.js

# --- patch_49: al acabar la temporada, la serie sale sola de En proceso ---
RUN --mount=type=bind,source=patch_49_aip_drops_when_season_over.js,target=/tmp/patch_49_aip_drops_when_season_over.js node /tmp/patch_49_aip_drops_when_season_over.js

# --- patch_50: SONDA TEMPORAL — por que se recarga sola la pagina (parpadeo) ---
RUN --mount=type=bind,source=patch_50_boot_reason_probe.js,target=/tmp/patch_50_boot_reason_probe.js node /tmp/patch_50_boot_reason_probe.js

# --- patch_51: la estrella de puntuar tambien en items sin fecha de estreno ---
RUN --mount=type=bind,source=patch_51_rate_star_without_release_date.js,target=/tmp/patch_51_rate_star_without_release_date.js node /tmp/patch_51_rate_star_without_release_date.js

# --- patch_52: nota de FilmAffinity (logo + puntuacion) en la ficha de pelis y series ---
RUN --mount=type=bind,source=patch_52_filmaffinity_rating.js,target=/tmp/patch_52_filmaffinity_rating.js node /tmp/patch_52_filmaffinity_rating.js

# --- patch_53: nota de Metacritic (logo + Metascore) en la ficha de los juegos ---
RUN --mount=type=bind,source=patch_53_metacritic_rating.js,target=/tmp/patch_53_metacritic_rating.js node /tmp/patch_53_metacritic_rating.js

# --- patch_54: al cambiar el status en el refresco de metadatos, re-evaluar
#     si la serie ya completada debe salir de la lista de seguimiento ---
RUN --mount=type=bind,source=patch_54_watchlist_recheck_on_metadata.js,target=/tmp/patch_54_watchlist_recheck_on_metadata.js node /tmp/patch_54_watchlist_recheck_on_metadata.js

# --- patch_55: la estrella de puntuar sale aunque la fecha de estreno sea futura
#     (ficha, caratula, episodio y temporada) ---
RUN --mount=type=bind,source=patch_55_rate_ignore_release_date.js,target=/tmp/patch_55_rate_ignore_release_date.js node /tmp/patch_55_rate_ignore_release_date.js

# Bucket 10 — backgrounds, CSS rules, css_rename hash bump, tokens UI, jellyfin
# import buttons, bundle_rename hash bump, index.html title, PWA manifest+SW.
# This bucket MUST run last among the patches because css_rename and bundle_rename
# bump content hashes — any later modification would orphan the new hash.
RUN --mount=type=bind,source=patch_10_visual_tokens_bundle.js,target=/tmp/patch_10_visual_tokens_bundle.js node /tmp/patch_10_visual_tokens_bundle.js

# --- Regenerate compressed bundle (.br and .gz) ---
# The server serves pre-compressed versions when the browser supports them; if we
# leave the originals (which were the upstream bundle), all our frontend patches
# are silently bypassed for any client that sends Accept-Encoding: br|gzip
# (Cloudflare always does).
RUN BUNDLE=$(ls /app/public/main_*.js | grep -v '\.LICENSE\|\.map') && \
    node -e "const fs=require('fs'),zlib=require('zlib');const p='$BUNDLE';const d=fs.readFileSync(p);fs.writeFileSync(p+'.gz',zlib.gzipSync(d,{level:9}));fs.writeFileSync(p+'.br',zlib.brotliCompressSync(d));console.log('Recompressed bundle:',p);"

# --- patch_56: ver un capítulo antes de su estreno oficial no saca la serie
#     de En proceso (AHS 13x1 visto el 26-sep, estreno TMDB 1-oct)
RUN --mount=type=bind,source=patch_56_seen_ahead_of_air_stays_in_progress.js,target=/tmp/patch_56_seen_ahead_of_air_stays_in_progress.js node /tmp/patch_56_seen_ahead_of_air_stays_in_progress.js
