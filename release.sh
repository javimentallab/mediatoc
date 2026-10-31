#!/usr/bin/env bash
# Usage: ./release.sh <new-version>   (e.g. ./release.sh 1.1.4)
#
# Cuts a new MediaOCD release: bumps the version in app/build/config.js and
# app/package.json, commits,
# creates an annotated tag, pushes both, and opens a draft GitHub release
# pre-filled with `git log --oneline` since the previous tag for you to edit.
#
# Aborts if:
#   - working tree is dirty
#   - current branch is not main
#   - the new version already has a tag
#   - the version doesn't match semver (X.Y.Z)

set -euo pipefail

NEW_VERSION="${1:-}"
if [[ -z "$NEW_VERSION" ]]; then
  echo "usage: $0 <new-version>   e.g. $0 1.1.4" >&2
  exit 1
fi
if [[ ! "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: '$NEW_VERSION' is not semver X.Y.Z" >&2
  exit 1
fi

cd "$(dirname "$0")"

# Pre-flight
if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is dirty; commit or stash first" >&2
  git status --short >&2
  exit 1
fi
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "error: not on main (currently '$BRANCH')" >&2
  exit 1
fi
if git rev-parse --verify "v$NEW_VERSION" >/dev/null 2>&1; then
  echo "error: tag v$NEW_VERSION already exists" >&2
  exit 1
fi

PREV_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
PREV_VERSION=""
if [[ -n "$PREV_TAG" ]]; then
  PREV_VERSION="${PREV_TAG#v}"
fi

# Bump the version: app/build/config.js (`static version = 'X.Y.Z';`, shown in the app)
# and app/package.json.
CONFIG_FILE="app/build/config.js"
if ! grep -q "static version = '" "$CONFIG_FILE"; then
  echo "error: version line not found in $CONFIG_FILE" >&2
  exit 1
fi
sed -i "s/static version = '[^']*';/static version = '$NEW_VERSION';/" "$CONFIG_FILE"
node -e "const f='app/package.json',fs=require('fs'),j=JSON.parse(fs.readFileSync(f,'utf8'));j.version='$NEW_VERSION';fs.writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
echo "bumped version → $NEW_VERSION"

# Commit + tag + push
git add "$CONFIG_FILE" app/package.json
git commit -m "v$NEW_VERSION: bump version"
git tag -a "v$NEW_VERSION" -m "MediaOCD v$NEW_VERSION"
git push origin main "v$NEW_VERSION"
echo "pushed main + v$NEW_VERSION"

# Draft GitHub release with the commit log since the previous tag
RANGE="${PREV_TAG:+$PREV_TAG..}HEAD"
NOTES_FILE="$(mktemp)"
{
  echo "## Changes"
  if [[ -n "$PREV_TAG" ]]; then
    echo ""
    echo "Since [\`$PREV_TAG\`](../../compare/$PREV_TAG...v$NEW_VERSION):"
  fi
  echo ""
  git log --oneline --no-decorate "$RANGE" | sed 's/^/- /'
  echo ""
  echo "🤖 Drafted by release.sh — edit before publishing."
} > "$NOTES_FILE"

gh release create "v$NEW_VERSION" \
  --title "v$NEW_VERSION" \
  --notes-file "$NOTES_FILE" \
  --draft

rm -f "$NOTES_FILE"
echo ""
echo "draft release created. Edit & publish at:"
gh release view "v$NEW_VERSION" --json url --jq .url
