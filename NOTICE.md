# NOTICE

MediaTOC is a personal media tracker built **on top of**
[**bonukai/MediaTracker**](https://github.com/bonukai/MediaTracker), licensed
under the MIT License. The compiled upstream app (`/app/build`, `/app/public`,
`package.json` and `entrypoint.sh` of the last `bonukai/mediatracker` image,
0.2.11) is redistributed unmodified under `upstream/` and patched at build
time; see `upstream/README.md`.

## Acknowledgements

- **[bonukai/MediaTracker](https://github.com/bonukai/MediaTracker)** — base
  application (Express backend, React frontend, SQLite via knex). MIT license,
  © Bonukai. Without this project, MediaTOC would not exist. See its
  [LICENSE](https://github.com/bonukai/MediaTracker/blob/main/LICENSE) for
  the full terms — they apply to all upstream code that ends up in the final
  image at runtime.

## Third-party services consumed at runtime

These are queried by MediaTOC during normal operation. None of their data
is bundled with this repository.

| Service | Used for | License / ToS |
|---|---|---|
| [TMDB](https://www.themoviedb.org/) | Movie / TV metadata, watch providers, episode runtimes | API ToS — user supplies their own key |
| [IGDB](https://www.igdb.com/) | Video game metadata + How Long To Beat times | API ToS — user supplies client id/secret |
| [Open Library](https://openlibrary.org/) | Book metadata | Public API |
| [Audible](https://www.audible.com/) | Audiobook metadata | Public API (read-only) |
| [Wikidata](https://www.wikidata.org/) (SPARQL) | Theatre work metadata | CC0 |
| [Wikipedia](https://www.wikipedia.org/) (REST) | Theatre synopses | CC BY-SA |
| [teatro.es](https://www.teatro.es/) (CDT/INAEM) | Spanish theatre productions (search-listing only) | Public web — see ToS |
| [YouTube](https://www.youtube.com/) RSS feeds | Channel video lists | Public RSS endpoint |
| [Google OAuth](https://developers.google.com/identity) + YouTube Data API | Optional account-link to pull subscriptions and watched durations | OAuth, user grants explicitly |
| [Jellyfin](https://jellyfin.org/) | Local library availability + deeplinks | GPL-2.0 server, user-hosted |

## License

MediaTOC's own contributions (the patches in this repository, the build
orchestration, the documentation) are licensed under MIT — see [`LICENSE`](LICENSE).

The combined work distributed as the `mediatoc:latest` Docker image carries
both copyrights:

- Copyright (c) 2021–present, Bonukai (upstream MediaTracker)
- Copyright (c) 2026–present, javimentallab (MediaTOC patches)
