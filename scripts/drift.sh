#!/bin/sh
# Parses every .vr program of the Varyk compiler with this grammar and fails
# when any of them has an ERROR or MISSING node: the compiler is the
# authority, so a red run means the grammar is behind.
#
# Usage: scripts/drift.sh path/to/varyk   (run from the repository root)
#
# Skipped, because they are syntax errors on purpose: the fixtures under
# crates/varyk/tests/fixtures/errors/ named for a syntax code (v0001_ to
# v0003_, v0010_ to v0012_) and crates/varyk/tests/fixtures/parse_error/.
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: scripts/drift.sh path/to/varyk" >&2
  exit 2
fi
compiler=$1

# A wrong path, or a directory the compiler moved, would parse nothing and pass.
for dir in examples crates/varyk/tests/fixtures; do
  if [ ! -d "$compiler/$dir" ]; then
    echo "drift: $compiler/$dir is not a directory" >&2
    exit 2
  fi
done

list=$(mktemp)
trap 'rm -f "$list"' EXIT

find "$compiler/examples" "$compiler/crates/varyk/tests/fixtures" \
  -name target -prune -o -type f -name '*.vr' -print |
  grep -v \
    -e '/fixtures/errors/v000[123]_' \
    -e '/fixtures/errors/v001[012]_' \
    -e '/fixtures/parse_error/' |
  sort > "$list"

echo "parsing $(wc -l < "$list" | tr -d ' ') files"
tree-sitter parse --quiet --paths "$list"
