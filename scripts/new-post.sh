#!/usr/bin/env bash
# Usage: bash scripts/new-post.sh "포스트 제목" "태그1,태그2"

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: bash scripts/new-post.sh \"포스트 제목\" \"태그1,태그2\""
    exit 1
fi

TITLE="$1"
TAGS="${2:-}"
DATE=$(date +%Y-%m-%d)

# Generate slug: remove Korean characters, lowercase, spaces to hyphens, strip non-alnum/hyphens
SLUG=$(echo "$TITLE" \
    | sed 's/[가-힣ㄱ-ㅎㅏ-ㅣ]//g' \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[[:space:]]/-/g' \
    | sed 's/[^a-z0-9-]//g' \
    | sed 's/--*/-/g' \
    | sed 's/^-//;s/-$//')

if [ -z "$SLUG" ]; then
    SLUG="untitled"
fi

FILENAME="_posts/${DATE}-${SLUG}.md"

# Build tags block
TAGS_BLOCK=""
if [ -n "$TAGS" ]; then
    IFS=',' read -ra TAG_ARRAY <<< "$TAGS"
    TAGS_BLOCK="tags:"
    for tag in "${TAG_ARRAY[@]}"; do
        tag=$(echo "$tag" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        TAGS_BLOCK="${TAGS_BLOCK}
  - ${tag}"
    done
else
    TAGS_BLOCK="tags: []"
fi

cat > "$FILENAME" << EOF
---
title: "${TITLE}"
subtitle: ""
layout: post
author: "DooDoo"
date: ${DATE}
${TAGS_BLOCK}
categories:
keywords: ""
header-style: text
---

## 개요



## 본문



## 마무리

EOF

echo "✅ Created: ${FILENAME}"
