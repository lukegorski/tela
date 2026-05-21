// One-off: rasterize Tela brand assets to PNGs suitable for upload to the
// Google Cloud OAuth consent screen (which requires square JPG/PNG/BMP,
// max 1MB, ideally 120×120 native but 240×240 gives retina headroom).
// Solid white background per Google's consent-screen rendering rules.
//
// Two square outputs (Luke picks one when uploading):
//   - tela-logo-240.png        — icon-only glyph from tela-logo-icon.svg
//   - tela-oauth-wordmark-240.png  — full wordmark "tela [icon]" centered
//                                    on a square white canvas
//
// sharp is installed under packages/capabilities/node_modules — resolve it
// from there via createRequire so this one-off script doesn't need its own
// package.json. If sharp ever moves, update the require base.
//
// Run: node tools/render-oauth-logo.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const repoRoot = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(repoRoot, 'packages/capabilities/package.json'));
const sharp = require('sharp');

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// ── 1. Icon-only square — rendered from the SVG glyph ─────────────────────
{
  const svgPath = resolve(repoRoot, 'apps/web/public/tela-logo-icon.svg');
  const outPath = resolve(repoRoot, 'apps/web/public/brand/tela-logo-240.png');
  const svg = readFileSync(svgPath);

  // Render the glyph into the inner 200×200 area, then pad with 20px white
  // on all sides to reach the 240×240 canvas. Centered, equal padding all
  // sides.
  const glyph = await sharp(svg, { density: 600 })
    .resize(200, 200, { fit: 'contain', background: WHITE })
    .png()
    .toBuffer();

  await sharp(glyph)
    .extend({ top: 20, bottom: 20, left: 20, right: 20, background: WHITE })
    .png()
    .toFile(outPath);

  await reportSize(outPath);
}

// ── 2. Wordmark-on-square — Luke's wordmark PNG padded to 240×240 ─────────
{
  const srcPath = resolve(repoRoot, 'apps/web/public/brand/tela-wordmark.png');
  const outPath = resolve(repoRoot, 'apps/web/public/brand/tela-oauth-wordmark-240.png');

  // Scale wordmark to fit inside a 200px-wide box (preserves aspect), then
  // place onto a 240×240 white canvas with vertical centering.
  const scaled = await sharp(srcPath)
    .resize(200, null, { fit: 'inside', background: WHITE })
    .flatten({ background: WHITE }) // strip alpha → white
    .png()
    .toBuffer();
  const { height: scaledH = 200 } = await sharp(scaled).metadata();

  const verticalPad = Math.max(0, Math.round((240 - scaledH) / 2));
  await sharp(scaled)
    .extend({
      top: verticalPad,
      bottom: 240 - scaledH - verticalPad,
      left: 20,
      right: 20,
      background: WHITE,
    })
    .png()
    .toFile(outPath);

  await reportSize(outPath);
}

async function reportSize(path) {
  const meta = await sharp(path).metadata();
  const bytes = readFileSync(path).byteLength;
  console.log(`Wrote ${path}`);
  console.log(`  ${meta.width}×${meta.height} ${meta.format} (${bytes} bytes)`);
}
