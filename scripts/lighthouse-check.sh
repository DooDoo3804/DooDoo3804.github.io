#!/usr/bin/env bash
#
# lighthouse-check.sh — Run Lighthouse against local Jekyll server
# and save a timestamped report with key scores.
#

set -euo pipefail

TARGET_URL="${1:-http://localhost:4000}"
DATE=$(date +%Y-%m-%d)
REPORT_DIR="$(cd "$(dirname "$0")/.." && pwd)/reports"
REPORT_FILE="$REPORT_DIR/lighthouse-$DATE.json"

# ── Check lighthouse CLI ────────────────────────────────────────────
if ! npm list -g lighthouse &>/dev/null; then
    echo "❌  Lighthouse CLI is not installed globally."
    echo "   Install it with:  npm install -g lighthouse"
    exit 1
fi

# ── Ensure reports directory exists ─────────────────────────────────
mkdir -p "$REPORT_DIR"

# ── Run Lighthouse ──────────────────────────────────────────────────
echo "🔍  Running Lighthouse on $TARGET_URL ..."
lighthouse "$TARGET_URL" \
    --output=json \
    --output-path="$REPORT_FILE" \
    --chrome-flags="--headless --no-sandbox" \
    --only-categories=performance,accessibility,seo \
    --quiet

# ── Extract & display scores ───────────────────────────────────────
echo ""
echo "📊  Lighthouse Results ($DATE)"
echo "──────────────────────────────"

PERFORMANCE=$(node -e "const r=require('$REPORT_FILE'); console.log(Math.round(r.categories.performance.score*100))")
ACCESSIBILITY=$(node -e "const r=require('$REPORT_FILE'); console.log(Math.round(r.categories.accessibility.score*100))")
SEO=$(node -e "const r=require('$REPORT_FILE'); console.log(Math.round(r.categories.seo.score*100))")

printf "  Performance:   %s\n" "$PERFORMANCE"
printf "  Accessibility: %s\n" "$ACCESSIBILITY"
printf "  SEO:           %s\n" "$SEO"
echo ""
echo "📄  Full report: $REPORT_FILE"
