#!/usr/bin/env bash
# gen-og-image.sh — Generate per-post OG images (1200x630) using ImageMagick
# Usage: bash scripts/gen-og-image.sh "Post Title" "tag1, tag2" "slug"

set -euo pipefail

TITLE="${1:?Usage: gen-og-image.sh \"Title\" \"tags\" \"slug\"}"
TAGS="${2:-}"
SLUG="${3:?Usage: gen-og-image.sh \"Title\" \"tags\" \"slug\"}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OG_DIR="$PROJECT_DIR/assets/img/og"
OUTPUT="$OG_DIR/${SLUG}.png"

mkdir -p "$OG_DIR"

# Wrap long titles (split at ~30 chars per line, max 3 lines)
wrap_title() {
    local text="$1"
    local max_width=30
    local result=""
    local line=""

    for word in $text; do
        if [ -z "$line" ]; then
            line="$word"
        elif [ $(( ${#line} + ${#word} + 1 )) -le "$max_width" ]; then
            line="$line $word"
        else
            if [ -n "$result" ]; then
                result="$result\n$line"
            else
                result="$line"
            fi
            line="$word"
        fi
    done

    if [ -n "$line" ]; then
        if [ -n "$result" ]; then
            result="$result\n$line"
        else
            result="$line"
        fi
    fi

    echo -e "$result"
}

WRAPPED_TITLE=$(wrap_title "$TITLE")

# Detect font paths (macOS vs Linux)
FONT_BOLD="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REGULAR="/System/Library/Fonts/Supplemental/Arial.ttf"
if [ ! -f "$FONT_BOLD" ]; then
    FONT_BOLD="$(fc-list : file | grep -i 'arial.*bold\.ttf' | head -1 | cut -d: -f1 || echo 'Arial-Bold')"
    FONT_REGULAR="$(fc-list : file | grep -i 'arial\.ttf' | head -1 | cut -d: -f1 || echo 'Arial')"
fi

magick -size 1200x630 \
    gradient:'#1a1a2e'-'#16213e' \
    -fill '#ffffff' -font "$FONT_BOLD" \
    -gravity North \
    -pointsize 28 -annotate +0+40 "DooDoo IT Blog" \
    -gravity Center \
    -pointsize 56 -interline-spacing 8 -annotate +0-20 "$WRAPPED_TITLE" \
    -gravity South \
    -fill '#0085a1' -font "$FONT_REGULAR" -pointsize 24 -annotate +0+50 "$TAGS" \
    "$OUTPUT"

echo "Generated: $OUTPUT"
