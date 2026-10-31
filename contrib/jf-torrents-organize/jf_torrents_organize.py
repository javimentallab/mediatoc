#!/usr/bin/env python3
"""
Organize a qBittorrent download dir into clean Jellyfin libraries via HARDLINKS.

The qBit raw download dir typically holds release-style folder names like
"Title (YYYY) [Bluray 1080p][Esp]/foo.mkv". Jellyfin matches metadata best
against clean folder/file names. Renaming or moving the raw folder breaks
qBit (it loses the file at the tracked path). This script keeps the raw dir
untouched and creates HARDLINKS in a parallel clean structure that Jellyfin
indexes correctly:

  Movie:
    src  : "<TORRENTS>/Title (YYYY) [4k 2160p][Esp]/foo.mkv"     <-- qBit seeds
    dst  : "<MOVIES>/Title (YYYY)/Title (YYYY).mkv"              <-- JF reads

  Episode:
    src  : "<TORRENTS>/Series Name [4k 2160p][Cap.205]/foo.mkv"
    dst  : "<SERIES>/Series Name/Season 02/Series Name S02E05.mkv"

Both paths must live on the same filesystem (hardlinks are filesystem-local).
Hardlinks share the inode: zero extra bytes on disk, deleting one path leaves
the file alive at the other. Idempotent: if dst exists, skip.

When run with --apply, after creating any new links the script also calls
Jellyfin's /Library/Refresh so the new entries show up immediately.

Why this matters for MediaOCD: MediaOCD reads Jellyfin's library to flag
items as "Downloaded" in its UI. If Jellyfin can't see your torrent files
under clean names, MediaOCD never lights up the Downloaded badge. This
script is the bridge.

Configuration is via environment variables (all optional, with defaults
matching a typical Docker compose layout). See contrib/jf-torrents-organize/
README.md for the full list and examples.

Usage:
  python3 jf_torrents_organize.py            # dry-run
  python3 jf_torrents_organize.py --apply    # apply changes + refresh JF
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# --- Paths ----------------------------------------------------------------
# Source dir on the host (where qBit downloads land). Read directly by this
# script for the directory listing.
TORRENTS_PATH_HOST = os.environ.get(
    "TORRENTS_PATH_HOST", "/home/oem/mis_contenedores/disco_torrents"
)
# Same dir as seen from inside the Jellyfin container. Used when invoking
# `docker exec <JF_CONTAINER> ln/mkdir/ls/test` — those operate in JF's
# filesystem view, so the source must be the JF-side path.
TORRENTS_PATH_IN_JF = os.environ.get("TORRENTS_PATH_IN_JF", "/data/torrents")
# Hardlink destinations inside the Jellyfin container. Must be on the same
# filesystem as TORRENTS_PATH_IN_JF (hardlinks are filesystem-local).
MOVIES_PATH_IN_JF = os.environ.get("MOVIES_PATH_IN_JF", "/data/movies/peliculas")
SERIES_PATH_IN_JF = os.environ.get("SERIES_PATH_IN_JF", "/data/movies/series")

# Optional host-side equivalents of the destinations. When set, the script
# performs ls/mkdir/test/ln directly on the host filesystem instead of via
# `docker exec`. This is faster (no docker exec overhead) and bypasses the
# EXDEV trap that happens when /data/torrents and /data/movies are *two*
# separate bind mounts: even when both live on the same host FS, the kernel
# refuses cross-mount hardlinks. With host paths there is only one mount.
MOVIES_PATH_HOST = os.environ.get("MOVIES_PATH_HOST", "")
SERIES_PATH_HOST = os.environ.get("SERIES_PATH_HOST", "")

# JF-view path -> host path. Populated below; used by to_host() to decide
# whether a given operation can run natively on the host.
_PATH_MAP = {TORRENTS_PATH_IN_JF: TORRENTS_PATH_HOST}
if MOVIES_PATH_HOST:
    _PATH_MAP[MOVIES_PATH_IN_JF] = MOVIES_PATH_HOST
if SERIES_PATH_HOST:
    _PATH_MAP[SERIES_PATH_IN_JF] = SERIES_PATH_HOST


def to_host(p: str):
    """Map a JF-view path to its host equivalent, or None if no mapping."""
    for jf_root, host_root in _PATH_MAP.items():
        if p == jf_root:
            return host_root
        if p.startswith(jf_root + "/"):
            return host_root + p[len(jf_root):]
    return None

# --- Containers / Jellyfin API -------------------------------------------
JF_CONTAINER = os.environ.get("JF_CONTAINER", "jellyfin")
# Two ways to provide Jellyfin URL + API key:
#   1. Explicit: set JF_URL + JF_API_KEY.
#   2. Sibling container: leave them empty, set JF_CONFIG_CONTAINER (defaults
#      to "mediaocd") and JF_CONFIG_PATH (defaults to
#      "/storage/jellyfin-config.json"). The script will run
#      `docker exec <container> cat <path>` and parse {url, apiKey}.
JF_URL = os.environ.get("JF_URL", "").rstrip("/")
JF_API_KEY = os.environ.get("JF_API_KEY", "")
JF_CONFIG_CONTAINER = os.environ.get("JF_CONFIG_CONTAINER", "mediaocd")
JF_CONFIG_PATH = os.environ.get(
    "JF_CONFIG_PATH", "/storage/jellyfin-config.json"
)

# --- File handling -------------------------------------------------------
VIDEO_EXTS = {".mkv", ".mp4", ".avi", ".m4v", ".mov", ".wmv", ".flv"}
# Garbage files some release groups bundle alongside the video. Extend via
# JUNK_FILES env (comma-separated, case-insensitive).
JUNK_FILES = {"canal telegram oficial.url"} | {
    s.strip().lower()
    for s in os.environ.get("JUNK_FILES", "").split(",")
    if s.strip()
}

# Optional series-name aliasing. Some releases name a show differently from
# its canonical TMDB/TVDB name. Provide a JSON file mapping canonical → list
# of variants (all lowercase comparison):
#   {"Monarch Legacy of Monsters": ["monarch"]}
# Set SERIES_ALIASES_FILE to its path. Without the file, no aliasing.
SERIES_ALIASES = {}
_aliases_file = os.environ.get("SERIES_ALIASES_FILE", "")
if _aliases_file:
    try:
        with open(_aliases_file, encoding="utf-8") as _f:
            SERIES_ALIASES = json.load(_f)
    except OSError as _e:
        print(f"WARN: cannot read SERIES_ALIASES_FILE={_aliases_file}: {_e}",
              file=sys.stderr)


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def is_dirty(name: str) -> bool:
    return "[" in name or "]" in name


def parse_episode(name: str):
    m = re.search(r"\[\s*Cap\.?\s*(\d+)\s*\]", name, flags=re.IGNORECASE)
    if m:
        n = m.group(1)
        if len(n) == 3:
            season = int(n[0]); episode = int(n[1:])
        elif len(n) == 4:
            season = int(n[:2]); episode = int(n[2:])
        elif len(n) == 2:
            season = 1; episode = int(n)
        else:
            season = 1; episode = int(n)
        title = name.split("[", 1)[0].strip()
        return (title, season, episode)
    m = re.search(r"\bS(\d{1,2})E(\d{1,2})\b", name, flags=re.IGNORECASE)
    if m:
        season = int(m.group(1)); episode = int(m.group(2))
        title = re.split(r"\bS\d{1,2}E\d{1,2}\b", name, flags=re.IGNORECASE)[0].strip(" -._[]")
        return (title, season, episode)
    return None


def parse_movie(name: str):
    m = re.search(r"^(.+?)\s*\((\d{4})\)", name)
    if m:
        return (m.group(1).strip(), int(m.group(2)))
    return None


def canonical_series_name(raw: str) -> str:
    raw_lc = raw.lower().strip()
    for canonical, variants in SERIES_ALIASES.items():
        if raw_lc == canonical.lower():
            return canonical
        for v in variants:
            if raw_lc == v.lower():
                return canonical
    return raw.strip()


def docker_exec(args, capture=True):
    cmd = ["docker", "exec", JF_CONTAINER] + args
    if capture:
        r = subprocess.run(cmd, capture_output=True, text=True)
        return r.returncode, r.stdout, r.stderr
    return subprocess.call(cmd)


def jf_ls(path):
    h = to_host(path)
    if h is not None:
        try:
            return sorted(os.listdir(h))
        except OSError as e:
            log(f"  ls failed for {path}: {e}")
            return []
    rc, out, err = docker_exec(["ls", "-1A", path])
    if rc != 0:
        log(f"  ls failed for {path}: {err.strip()}")
        return []
    return [l for l in out.splitlines() if l]


def jf_exists(path):
    h = to_host(path)
    if h is not None:
        return os.path.lexists(h)
    rc, _, _ = docker_exec(["test", "-e", path])
    return rc == 0


def jf_mkdir_p(path, apply):
    h = to_host(path)
    if h is not None:
        if apply:
            try:
                os.makedirs(h, exist_ok=True)
            except OSError as e:
                log(f"  mkdir failed: {e}")
                return False
        return True
    if apply:
        rc, _, err = docker_exec(["mkdir", "-p", "--", path])
        if rc != 0:
            log(f"  mkdir failed: {err.strip()}")
            return False
    return True


def jf_link(src, dst, apply):
    """Hardlink src -> dst. No-op if dst already exists. Does NOT touch src."""
    if jf_exists(dst):
        log(f"  skip (already exists): {dst}")
        return True
    h_src = to_host(src)
    h_dst = to_host(dst)
    if h_src is not None and h_dst is not None:
        if apply:
            try:
                os.link(h_src, h_dst)
            except OSError as e:
                log(f"  link failed: {e}")
                return False
        return True
    if apply:
        rc, _, err = docker_exec(["ln", "--", src, dst])
        if rc != 0:
            log(f"  link failed: {err.strip()}")
            return False
    return True


def load_jf_cfg():
    """Return (url, api_key) for the Jellyfin API.

    Priority: explicit JF_URL + JF_API_KEY env vars; otherwise read from the
    sibling container at JF_CONFIG_CONTAINER:JF_CONFIG_PATH (JSON with keys
    'url' and 'apiKey').
    """
    if JF_URL and JF_API_KEY:
        return JF_URL, JF_API_KEY
    r = subprocess.run(
        ["docker", "exec", JF_CONFIG_CONTAINER, "cat", JF_CONFIG_PATH],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(
            f"cannot read JF config from {JF_CONFIG_CONTAINER}:{JF_CONFIG_PATH}: "
            f"{r.stderr.strip()} — set JF_URL+JF_API_KEY env vars to bypass"
        )
    cfg = json.loads(r.stdout)
    return cfg["url"].rstrip("/"), cfg["apiKey"]


def jf_post(base, key, path, body=None):
    data = json.dumps(body).encode() if body is not None else b""
    req = Request(
        f"{base}{path}",
        data=data,
        headers={"X-Emby-Token": key, "Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=30) as r:
        return r.status, r.read()


def trigger_jf_library_refresh():
    try:
        base, key = load_jf_cfg()
    except (RuntimeError, json.JSONDecodeError) as e:
        log(f"JF refresh skipped: {e}")
        return
    # If the URL is a docker-network host (e.g. http://jellyfin:8096),
    # rewrite to localhost so the refresh works from the host where this
    # script runs.
    base_host = re.sub(r"^(https?://)[^:/]+", r"\1localhost", base)
    try:
        status, _ = jf_post(base_host, key, "/Library/Refresh")
        log(f"JF /Library/Refresh -> HTTP {status}")
    except (URLError, HTTPError) as e:
        log(f"JF refresh failed: {e}")


def process_movie_folder(folder_name: str, apply: bool):
    parsed = parse_movie(folder_name)
    if not parsed:
        return False
    title, year = parsed
    canonical = f"{title} ({year})"
    if folder_name == canonical:
        return False
    src_dir = f"{TORRENTS_PATH_IN_JF}/{folder_name}"
    dst_dir = f"{MOVIES_PATH_IN_JF}/{canonical}"
    log(f"MOVIE  {folder_name!r} -> {canonical!r} (hardlink)")
    jf_mkdir_p(dst_dir, apply)
    files = jf_ls(src_dir)
    linked_any = False
    for f in files:
        ext = os.path.splitext(f)[1].lower()
        if f.lower() in JUNK_FILES:
            continue
        if ext in VIDEO_EXTS:
            new_name = f"{canonical}{ext}"
            src = f"{src_dir}/{f}"
            dst = f"{dst_dir}/{new_name}"
            log(f"  ln {f} -> {new_name}")
            if jf_link(src, dst, apply):
                linked_any = True
    return linked_any


def parse_file_episode(filename: str):
    """Parse (season, episode) out of a *file* name. Returns None if not found.

    Recognises SxxExx (international) and [Cap.NNN] (Spanish releases).
    """
    m = re.search(r"\bS(\d{1,2})E(\d{1,2})\b", filename, flags=re.IGNORECASE)
    if m:
        return (int(m.group(1)), int(m.group(2)))
    m = re.search(r"\[\s*Cap\.?\s*(\d+)\s*\]", filename, flags=re.IGNORECASE)
    if m:
        n = m.group(1)
        if len(n) >= 3:
            return (int(n[:-2]), int(n[-2:]))
        return (1, int(n))
    return None


def looks_like_season_pack(name: str) -> bool:
    """Cheap name-only check before we pay the cost of listing the folder."""
    if re.search(r"\b[Ss]\d{1,2}\b(?!E\d)", name):
        return True
    if re.search(r"\bTemporada\s+\d+\b", name, flags=re.IGNORECASE):
        return True
    return False


def extract_series_title(folder_name: str) -> str:
    """Best-effort series title from a season-pack folder name."""
    base = folder_name.split("[", 1)[0]
    base = re.split(r"\b[Ss]\d{1,2}\b", base)[0]
    base = re.split(r"\bTemporada\s+\d+\b", base, flags=re.IGNORECASE)[0]
    base = base.replace(".", " ").replace("_", " ")
    base = re.sub(r"\s+", " ", base).strip(" -._")
    return base


def process_season_pack_folder(folder_name: str, apply: bool):
    """Hardlink every recognised episode inside a single folder.

    Use this for season packs where one folder contains many SxxExx (or
    [Cap.NNN]) files. Returns True if at least one episode was linked.
    """
    src_dir = f"{TORRENTS_PATH_IN_JF}/{folder_name}"
    files = jf_ls(src_dir)
    episodes = []
    for f in files:
        if f.lower() in JUNK_FILES:
            continue
        ext = os.path.splitext(f)[1].lower()
        if ext not in VIDEO_EXTS:
            continue
        ep = parse_file_episode(f)
        if ep:
            episodes.append((f, ep))
    if len(episodes) < 2:
        return False
    raw_series = extract_series_title(folder_name)
    if not raw_series:
        return False
    series = canonical_series_name(raw_series)
    log(f"SEASON PACK {folder_name!r} -> {series!r} ({len(episodes)} episodes)")
    linked_any = False
    for fname, (season, episode) in episodes:
        season_dir = f"{SERIES_PATH_IN_JF}/{series}/Season {season:02d}"
        jf_mkdir_p(season_dir, apply)
        ext = os.path.splitext(fname)[1].lower()
        base_name = f"{series} S{season:02d}E{episode:02d}"
        src = f"{src_dir}/{fname}"
        dst = f"{season_dir}/{base_name}{ext}"
        log(f"  ln {fname} -> {dst}")
        if jf_link(src, dst, apply):
            linked_any = True
    return linked_any


def process_episode_folder(folder_name: str, apply: bool):
    parsed = parse_episode(folder_name)
    if not parsed:
        return False
    raw_series, season, episode = parsed
    series = canonical_series_name(raw_series)
    season_dir = f"{SERIES_PATH_IN_JF}/{series}/Season {season:02d}"
    src_dir = f"{TORRENTS_PATH_IN_JF}/{folder_name}"
    base_name = f"{series} S{season:02d}E{episode:02d}"
    log(f"EPISODE {folder_name!r} -> {series!r} S{season:02d}E{episode:02d} (hardlink)")
    jf_mkdir_p(season_dir, apply)
    files = jf_ls(src_dir)
    linked_any = False
    for f in files:
        ext = os.path.splitext(f)[1].lower()
        if f.lower() in JUNK_FILES:
            continue
        if ext in VIDEO_EXTS:
            src = f"{src_dir}/{f}"
            dst = f"{season_dir}/{base_name}{ext}"
            log(f"  ln {f} -> {dst}")
            if jf_link(src, dst, apply):
                linked_any = True
    return linked_any


def main():
    ap = argparse.ArgumentParser(description=__doc__.strip().split("\n")[0])
    ap.add_argument("--apply", action="store_true",
                    help="actually create the hardlinks (default: dry-run)")
    args = ap.parse_args()
    if not args.apply:
        log("DRY-RUN -- pass --apply to actually create hardlinks")
    log(f"source : {TORRENTS_PATH_HOST}  (JF view: {TORRENTS_PATH_IN_JF})")
    log(f"movies : {MOVIES_PATH_IN_JF}")
    log(f"series : {SERIES_PATH_IN_JF}")
    try:
        entries = sorted(os.listdir(TORRENTS_PATH_HOST))
    except OSError as e:
        log(f"FATAL: cannot read {TORRENTS_PATH_HOST}: {e}")
        return 1
    log(f"Found {len(entries)} entries in {TORRENTS_PATH_HOST}")
    processed = 0
    skipped = 0
    for name in entries:
        full = os.path.join(TORRENTS_PATH_HOST, name)
        if not os.path.isdir(full):
            continue
        if looks_like_season_pack(name) and process_season_pack_folder(name, args.apply):
            processed += 1
            continue
        if not is_dirty(name):
            skipped += 1
            continue
        if process_movie_folder(name, args.apply):
            processed += 1
        elif process_episode_folder(name, args.apply):
            processed += 1
        else:
            log(f"  ? no recognized pattern: {name}")
            skipped += 1
    log(f"Processed: {processed} - skipped: {skipped}")
    if processed > 0 and args.apply:
        trigger_jf_library_refresh()
    elif processed > 0:
        log("(skip JF refresh: dry-run)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
