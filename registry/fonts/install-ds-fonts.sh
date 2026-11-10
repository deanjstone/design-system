#!/usr/bin/env bash
# Installs the Aspekta and Azeret Mono web fonts for the design system's font option.
#
#   bash scripts/install-ds-fonts.sh [destination]      default: public/fonts/ds
#
# The files are the unmodified originals from each font's own repository, pinned to a commit
# and checked against a sha256 before anything is written. Do not rename, subset or convert
# them (Aspekta carries a Reserved Font Name, SIL OFL 1.1). The licence notices come with
# the font-aspekta item, into the same folder.
#
# Offline or in CI, point DS_FONTS_SOURCE_DIR at a checkout of design-system's registry/fonts
# and the files are copied from there instead (still checked against the same sha256).
set -euo pipefail

destination="${1:-public/fonts/ds}"
source_dir="${DS_FONTS_SOURCE_DIR:-}"

# relative path in registry/fonts | file name | download url | sha256
fonts=(
  "aspekta/AspektaVF.woff2|AspektaVF.woff2|https://raw.githubusercontent.com/ivodolenc/aspekta/cd08efde1a0484c3626818ac59a6933e59f71531/packages/fonts/variable/AspektaVF.woff2|373dc70ab4a1712327ee294dfbfc1b4dfc1f0afc027df62d9b8b0eb4fec01781"
  "azeret-mono/AzeretMono-Regular.woff2|AzeretMono-Regular.woff2|https://raw.githubusercontent.com/displaay/Azeret/3d45a6c3e094f08bfc70551b525bd2037cac51ba/fonts/webfonts/AzeretMono-Regular.woff2|f0d847a45bbc123cecbb816402d1a7d9bbadcfe5f4e0a522978b9724486c7cf0"
  "azeret-mono/AzeretMono-Medium.woff2|AzeretMono-Medium.woff2|https://raw.githubusercontent.com/displaay/Azeret/3d45a6c3e094f08bfc70551b525bd2037cac51ba/fonts/webfonts/AzeretMono-Medium.woff2|426e16aabc531defd3929eb947d3e9a788a95080261da86b8136e7fd3cb9516d"
  "azeret-mono/AzeretMono-SemiBold.woff2|AzeretMono-SemiBold.woff2|https://raw.githubusercontent.com/displaay/Azeret/3d45a6c3e094f08bfc70551b525bd2037cac51ba/fonts/webfonts/AzeretMono-SemiBold.woff2|3af3bf7cd7f32343efd21504cde1c987cf919b404e99368a1f622db54759ace8"
  "azeret-mono/AzeretMono-Bold.woff2|AzeretMono-Bold.woff2|https://raw.githubusercontent.com/displaay/Azeret/3d45a6c3e094f08bfc70551b525bd2037cac51ba/fonts/webfonts/AzeretMono-Bold.woff2|94cdef513e0181d9444b273dd9d235257ec55b4f07a25b1a593b9b77a909e634"
)

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Fetch and check every file first; only a full set is moved into place.
for entry in "${fonts[@]}"; do
  IFS='|' read -r relative name url expected <<< "$entry"
  if [ -n "$source_dir" ]; then
    cp "$source_dir/$relative" "$work/$name"
  else
    curl --fail --silent --show-error --location --output "$work/$name" "$url"
  fi
  actual="$(sha256_of "$work/$name")"
  if [ "$actual" != "$expected" ]; then
    echo "install-ds-fonts: checksum mismatch for $name (expected $expected, got $actual)" >&2
    exit 1
  fi
done

mkdir -p "$destination"
for entry in "${fonts[@]}"; do
  IFS='|' read -r _ name _ _ <<< "$entry"
  mv "$work/$name" "$destination/$name"
  echo "install-ds-fonts: $destination/$name"
done
