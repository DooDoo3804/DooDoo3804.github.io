#!/usr/bin/env bash
#
# encrypt-pages.sh — Encrypt pages with `protected: true` front matter using StatiCrypt.
# Usage: bash scripts/encrypt-pages.sh "your-password"
#
# Run AFTER `jekyll build` so that _site/ already contains the rendered HTML.

set -euo pipefail

PASSWORD="${1:-${PAGE_PASSWORD:-}}"

if [ -z "$PASSWORD" ]; then
  echo "Warning: No password provided. Skipping encryption."
  echo "Set PAGE_PASSWORD env var or pass as argument: bash scripts/encrypt-pages.sh \"your-password\""
  exit 0
fi

SITE_DIR="_site"

if [ ! -d "$SITE_DIR" ]; then
  echo "Error: $SITE_DIR not found. Run 'bundle exec jekyll build' first."
  exit 1
fi

# Check if a file has `protected: true` in its YAML front matter.
# Front matter must start on line 1 with `---`.
has_protected_frontmatter() {
  awk 'NR==1 && !/^---$/{exit 1} /^---$/{n++; next} n==1 && /^protected:[ \t]*true/{found=1; exit} n>=2{exit} END{if (!found) exit 1}' "$1" 2>/dev/null
}

ENCRYPTED_COUNT=0

echo "Scanning for protected pages..."

for f in $(find . -maxdepth 1 \( -name "*.md" -o -name "*.html" \) -not -path "./$SITE_DIR/*" -not -path "./_*/*"); do
  has_protected_frontmatter "$f" || continue

  # Derive the corresponding _site output path
  basename_no_ext=$(basename "$f" | sed -E 's/\.(md|html)$//')

  if [ "$basename_no_ext" = "index" ]; then
    target="$SITE_DIR/index.html"
  else
    target="$SITE_DIR/$basename_no_ext/index.html"
  fi

  # Also check flat HTML path (non-pretty permalinks)
  if [ ! -f "$target" ]; then
    target="$SITE_DIR/${basename_no_ext}.html"
  fi

  if [ ! -f "$target" ]; then
    echo "  Warning: Built file not found for $f. Skipping."
    continue
  fi

  echo "  Encrypting: $target"

  # Encrypt to a temp directory, then copy back in place
  tmpdir=$(mktemp -d)
  npx staticrypt "$target" \
    -p "$PASSWORD" \
    --short \
    -d "$tmpdir" \
    --template-title "Password Protected" \
    --template-instructions "Enter the password to view this page." \
    --template-color-primary "#000000" \
    --template-color-secondary "#222222"

  # StatiCrypt outputs to $tmpdir/<filename>
  encrypted="$tmpdir/$(basename "$target")"
  if [ -f "$encrypted" ]; then
    cp "$encrypted" "$target"
    ENCRYPTED_COUNT=$((ENCRYPTED_COUNT + 1))
  else
    echo "  Warning: Encrypted output not found for $target"
  fi
  rm -rf "$tmpdir"
done

if [ "$ENCRYPTED_COUNT" -eq 0 ]; then
  echo "No pages with 'protected: true' found. Nothing to encrypt."
else
  echo "Done. Encrypted $ENCRYPTED_COUNT page(s)."
fi
