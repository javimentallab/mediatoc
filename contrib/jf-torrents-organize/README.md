# jf-torrents-organize

Companion script for MediaOCD: hardlinks qBittorrent's raw downloads into
clean Jellyfin library folders so MediaOCD's **Downloaded** badge lights up
without breaking the seed.

This is **optional**. MediaOCD itself doesn't need it — but if you run
qBittorrent + Jellyfin together and want MediaOCD to detect downloaded
items via Jellyfin's library, you almost certainly want this.

## The problem

qBittorrent saves a torrent's data at a release-style path:

```
/data/torrents/Title (YYYY) [Bluray 1080p][Esp]/Title.YYYY.UHD.x265.mkv
```

Jellyfin matches metadata against folder/file names. With raw release names
its matches are noisy or wrong, and MediaOCD's "Downloaded" detection
(which reads from Jellyfin) misfires.

The obvious fix — renaming or moving the files to a clean structure —
**breaks qBit's seeding**: it loses the file at the path it tracks and
flags the torrent as errored.

## The fix: hardlinks

Hardlinks let two paths point to the same inode. The raw qBit path stays
intact (it keeps seeding); the clean path is what Jellyfin sees. Same
bytes on disk, no duplication.

```
/data/torrents/Title (YYYY) [Bluray 1080p][Esp]/foo.mkv
                                                              <- qBit reads this
/data/movies/peliculas/Title (YYYY)/Title (YYYY).mkv
                                                              <- Jellyfin reads this
                                  └── both paths => same inode
```

Both paths must live on the **same filesystem** (hardlinks are
filesystem-local). With a typical compose layout where `/data/torrents` and
`/data/movies` are bind mounts from the same host volume, this is the case.

## Layout expected

| Inside Jellyfin container | What lives there                          |
| ------------------------- | ----------------------------------------- |
| `/data/torrents`          | qBit raw downloads (source — do NOT touch) |
| `/data/movies/peliculas`  | Movie hardlinks (Jellyfin "Películas" lib) |
| `/data/movies/series`     | Series hardlinks (Jellyfin "Series" lib)   |

Configure your Jellyfin libraries to point at `/data/movies/peliculas` (Movies)
and `/data/movies/series` (TV Shows). Do **not** add `/data/torrents` as a
library — that would surface the raw release folders in the UI again.

## Patterns recognized

- **Movie folder**: `Title (YYYY) [tags...]/foo.mkv` →
  `Title (YYYY)/Title (YYYY).mkv`
- **Episode folder** (Spanish releases): `Series Name [Cap.205]/foo.mkv` →
  `Series Name/Season 02/Series Name S02E05.mkv`
- **Episode folder** (international): `Series Name [...] S02E05[...]/foo.mkv` →
  same as above
- Folders whose names are already clean (no `[` `]`) are skipped — they're
  assumed manually-organized.

## Configuration

All knobs are environment variables. Defaults match a typical compose:

| Variable                 | Default                                       | Purpose                                                 |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------- |
| `TORRENTS_PATH_HOST`     | `/home/oem/mis_contenedores/disco_torrents`   | Source dir on the host (where the script lists folders) |
| `TORRENTS_PATH_IN_JF`    | `/data/torrents`                              | Same dir as seen from inside the JF container           |
| `MOVIES_PATH_IN_JF`      | `/data/movies/peliculas`                      | Movie hardlinks destination (JF view)                   |
| `SERIES_PATH_IN_JF`      | `/data/movies/series`                         | Series hardlinks destination (JF view)                  |
| `JF_CONTAINER`           | `jellyfin`                                    | Jellyfin container name (used for `docker exec ln/mkdir`) |
| `JF_URL`                 | _(unset)_                                     | Jellyfin URL for `/Library/Refresh` (e.g. `http://localhost:8096`) |
| `JF_API_KEY`             | _(unset)_                                     | Jellyfin API key                                        |
| `JF_CONFIG_CONTAINER`    | `mediaocd`                                    | Fallback when `JF_URL`+`JF_API_KEY` are unset           |
| `JF_CONFIG_PATH`         | `/storage/jellyfin-config.json`               | Fallback path inside `JF_CONFIG_CONTAINER`              |
| `JUNK_FILES`             | _(empty)_                                     | Comma-separated extra filenames to ignore               |
| `SERIES_ALIASES_FILE`    | _(empty)_                                     | Optional JSON file with `{canonical: [variants...]}`    |

If `JF_URL`+`JF_API_KEY` are unset, the script falls back to reading them
from MediaOCD's stored config (`/storage/jellyfin-config.json` inside the
`mediaocd` container). MediaOCD stores this for its own Jellyfin sync, so
if you're already running MediaOCD, no extra setup is needed.

### Series aliases

Some Spanish release groups name a show differently from its
TMDB/Wikidata canonical. Provide a JSON file:

```json
{
  "Monarch Legacy of Monsters": ["monarch", "monarch el legado de los monstruos"]
}
```

…then set `SERIES_ALIASES_FILE=/path/to/aliases.json`. Comparison is
case-insensitive. Without the file, the raw folder name is used verbatim.

## Install

1. Drop the script somewhere persistent on the Docker host (e.g.
   `~/scripts/jf_torrents_organize.py`) and make it executable:

   ```bash
   install -m 755 jf_torrents_organize.py ~/scripts/jf_torrents_organize.py
   ```

2. Dry-run to verify it sees your torrents and recognizes patterns:

   ```bash
   python3 ~/scripts/jf_torrents_organize.py
   ```

3. Run for real once:

   ```bash
   python3 ~/scripts/jf_torrents_organize.py --apply
   ```

4. (Optional) Schedule it via the included systemd units. As your
   regular user:

   ```bash
   mkdir -p ~/.config/systemd/user
   cp jf-torrents-organize.service jf-torrents-organize.timer ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now jf-torrents-organize.timer
   ```

   The bundled `.service` uses `%h/scripts/jf_torrents_organize.py` (your
   home dir). Edit the `ExecStart=` line if you placed the script
   elsewhere.

5. Override env vars by either editing `Environment=` lines in the
   service file or pointing `EnvironmentFile=` at a `KEY=value` file
   (e.g. `/etc/default/jf-torrents-organize` for system service, or
   `~/.config/jf-torrents-organize.env` for user service).

## Footguns

1. **Do NOT delete or rename the `[tags]` folder in `/data/torrents`** while
   its torrent is still loaded in qBit. The hardlink in
   `/data/movies/peliculas` keeps the bytes alive on disk, but qBit's
   tracked path is gone → "file_open: No such file or directory" → if you
   purge the errored torrent with "delete files" checked, you also delete
   the last reference.

2. **Do NOT chown the hardlinked file to a different uid** unless the qBit
   user can still read+write it. `chown` operates on the **inode**, so both
   paths (qBit's and Jellyfin's) see the new owner. With LinuxServer images
   qBit runs as `uid 911 (abc)`; if you chown to your host user
   (say `uid 1000`), qBit gets "Permission denied". Recover with
   `chown 911:911 <file>` and `chmod 664` so qBit owner can read+write
   and Jellyfin's container user can read as "other".

## License

MIT, like the rest of the MediaOCD project.
