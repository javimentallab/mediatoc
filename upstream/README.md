# upstream/

The unmodified MediaTracker app that every `patch_*.js` builds on, kept in this
repo so the build does not depend on a third-party image that is no longer
maintained.

| Path | Where it comes from |
|---|---|
| `app/build/`, `app/public/`, `app/package.json` | `/app/*` of `bonukai/mediatracker@sha256:4397847ec1a88a83e29a9c19c31261af47de730047adc7dbe4bbcbb34ca27df1` (MediaTracker 0.2.11, last upstream release, Feb 2025) |
| `docker/entrypoint.sh` | `/docker/entrypoint.sh` of the same image |
| `app/package-lock.json` | Ours: the lock of the last good MediaTOC build (after `patch_01` and `npm install`) |

MediaTracker is © Bonukai, MIT licensed (see `../LICENSE`).

Don't edit these files by hand. Changes go in a `patch_*.js`, which the
Dockerfile applies on top of this tree, so a diff against upstream always
shows exactly what MediaTOC changes.

To refresh the lock after changing dependencies in `patch_01`, build the
image, then `docker cp mediatoc:/app/package-lock.json upstream/app/`.
