#!/usr/bin/env node
/**
 * generate-og-images.js — Generate per-post OG images (1200x630)
 *
 * Scans all _posts/**\/*.md, extracts front matter (title, tags, date),
 * and generates a branded OG image for each post missing one.
 *
 * Usage:
 *   node scripts/generate-og-images.js          # generate missing only
 *   node scripts/generate-og-images.js --force   # regenerate all
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "_posts");
const OG_DIR = path.join(ROOT, "assets", "img", "og");
const FORCE = process.argv.includes("--force");

// ---------------------------------------------------------------------------
// Front-matter parser (minimal, no deps)
// ---------------------------------------------------------------------------
function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fm = {};
  let currentKey = null;
  let listValues = [];

  for (const line of match[1].split("\n")) {
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kvMatch) {
      // Flush previous list
      if (currentKey && listValues.length) {
        fm[currentKey] = listValues;
        listValues = [];
      }
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === "" || val === "|") {
        // Possible list or multiline — wait for next lines
        fm[currentKey] = "";
      } else if (val.startsWith("[") && val.endsWith("]")) {
        // Inline array: [a, b, c]
        fm[currentKey] = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""));
      } else {
        fm[currentKey] = val.replace(/^["']|["']$/g, "");
      }
    } else if (line.match(/^\s+-\s+/)) {
      // List item
      listValues.push(line.replace(/^\s+-\s+/, "").replace(/^["']|["']$/g, ""));
    }
  }
  // Flush final list
  if (currentKey && listValues.length) {
    fm[currentKey] = listValues;
  }
  return fm;
}

// ---------------------------------------------------------------------------
// Collect all post .md files recursively
// ---------------------------------------------------------------------------
function collectPosts(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectPosts(full));
    } else if (entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results.sort();
}

// ---------------------------------------------------------------------------
// Derive slug from filename (strip YYYY-MM-DD- prefix)
// ---------------------------------------------------------------------------
function slugFromFilename(filePath) {
  const name = path.basename(filePath, ".md");
  return name.replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

// ---------------------------------------------------------------------------
// SVG text wrapping helper
// ---------------------------------------------------------------------------
function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + word.length + 1 <= maxChars) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3); // Max 3 lines
}

// ---------------------------------------------------------------------------
// Escape XML special characters
// ---------------------------------------------------------------------------
function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---------------------------------------------------------------------------
// Generate a single OG image
// ---------------------------------------------------------------------------
async function generateOgImage(title, tags, date, outputPath) {
  const W = 1200;
  const H = 630;

  const titleLines = wrapText(title, 14);
  const tagsStr = Array.isArray(tags) ? tags.join(", ") : tags || "";
  const dateStr = date || "";

  // Build title <text> elements — centered vertically
  const titleFontSize = 52;
  const lineHeight = titleFontSize + 12;
  const titleBlockHeight = titleLines.length * lineHeight;
  const titleStartY = (H - titleBlockHeight) / 2 + titleFontSize * 0.35;

  const titleTspans = titleLines
    .map((line, i) => {
      const y = titleStartY + i * lineHeight;
      return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-weight="700" font-size="${titleFontSize}" fill="#ffffff">${escapeXml(line)}</text>`;
    })
    .join("\n    ");

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="50%" style="stop-color:#16213e"/>
      <stop offset="100%" style="stop-color:#0f3460"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Blog name -->
  <text x="${W / 2}" y="52" text-anchor="middle" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-weight="600" font-size="26" fill="#ffffff" opacity="0.85">DooDoo IT Blog</text>

  <!-- Accent line -->
  <rect x="${W / 2 - 40}" y="68" width="80" height="3" rx="1.5" fill="#0085a1"/>

  <!-- Title -->
  ${titleTspans}

  <!-- Date -->
  <text x="${W / 2}" y="${H - 72}" text-anchor="middle" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-weight="400" font-size="20" fill="#a0a0a0">${escapeXml(dateStr)}</text>

  <!-- Tags -->
  <text x="${W / 2}" y="${H - 40}" text-anchor="middle" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-weight="500" font-size="22" fill="#0085a1">${escapeXml(tagsStr)}</text>
</svg>`;

  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(OG_DIR, { recursive: true });

  const posts = collectPosts(POSTS_DIR);
  let generated = 0;
  let skipped = 0;

  for (const postPath of posts) {
    const slug = slugFromFilename(postPath);
    const output = path.join(OG_DIR, `${slug}.png`);

    if (fs.existsSync(output) && !FORCE) {
      skipped++;
      continue;
    }

    const content = fs.readFileSync(postPath, "utf-8");
    const fm = parseFrontMatter(content);

    if (!fm.title) {
      console.warn(`WARN: No title in ${postPath}, skipping`);
      continue;
    }

    // Normalize date
    let dateStr = "";
    if (fm.date) {
      const d = new Date(fm.date);
      if (!isNaN(d.getTime())) {
        dateStr = d.toISOString().split("T")[0];
      } else {
        dateStr = String(fm.date).replace(/["']/g, "");
      }
    }

    await generateOgImage(fm.title, fm.tags, dateStr, output);
    generated++;
    console.log(`Generated: ${output}`);
  }

  console.log(
    `\nOG image generation complete. Generated: ${generated}, Skipped: ${skipped}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
