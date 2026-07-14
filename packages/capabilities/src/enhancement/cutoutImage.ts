/**
 * Transparent-cutout image transform (spec §2a #8, spike-validated recipe):
 * local background removal (@imgly/background-removal-node, default isnet)
 * followed by a deterministic alpha curve that kills the translucent
 * background ghost on white-on-white garments while keeping soft edges.
 * $0 per image, ~1s on Apple Silicon; measure on the worker.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

// Alpha curve constants — locked by the spike bake-off (report §2).
export const ALPHA_LO = 70;
export const ALPHA_HI = 190;

/**
 * alpha' = 0 below LO, 255 above HI, linear ramp between. Mutates and
 * returns the RGBA buffer. Pure math — unit-tested in isolation.
 */
export function applyAlphaCurve(rgba: Buffer, lo: number = ALPHA_LO, hi: number = ALPHA_HI): Buffer {
  for (let i = 3; i < rgba.length; i += 4) {
    const a = rgba[i];
    rgba[i] = a <= lo ? 0 : a >= hi ? 255 : Math.round(((a - lo) * 255) / (hi - lo));
  }
  return rgba;
}

// The imgly lib must load LAZILY, at first cutout, not at module scope:
// this module is reachable from the @tela/capabilities barrel, which the
// admin app bundles with Turbopack — there require.resolve() returns a
// numeric module id, and dirname(number) threw during admin's build-time
// page-data collection. Only the worker ever executes a cutout, on plain
// Node, where resolution works. (sharp stays a static import — it's on
// Next's default serverExternalPackages list; imgly is not.)
type ImglyModule = typeof import('@imgly/background-removal-node');
let imglyPromise: Promise<{ removeBackground: ImglyModule['removeBackground']; distUrl: string }> | null = null;

function loadImgly() {
  imglyPromise ??= import('@imgly/background-removal-node').then((mod) => {
    // The lib resolves its ONNX model + resources.json from process.cwd()
    // unless given an explicit publicPath — under the worker the cwd is the
    // app root, not the package, so point at the installed dist explicitly.
    // resolve() returns the package main inside dist/ — its dirname IS the
    // dist dir that holds resources.json + the ONNX weights.
    // ('.../package.json' is blocked by the package's exports map.)
    const require2 = createRequire(import.meta.url);
    const distUrl = pathToFileURL(dirname(require2.resolve('@imgly/background-removal-node'))).href + '/';
    return { removeBackground: mod.removeBackground, distUrl };
  });
  return imglyPromise;
}

export interface CutoutTrim {
  x: number;
  y: number;
  w: number;
  h: number;
  imgW: number;
  imgH: number;
}

export interface CutoutResult {
  webp: Buffer;
  /** Share of pixels fully transparent after the curve — sanity signal. */
  transparentShare: number;
  width: number;
  height: number;
  /** Opaque bbox (alpha > 16) — the builder recipe's placement box; null if fully transparent. */
  trim: CutoutTrim | null;
}

/**
 * Opaque-pixel bounding box at alpha > 16. Pure — unit-tested.
 */
export function computeTrim(rgba: Buffer, width: number, height: number): CutoutTrim | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, imgW: width, imgH: height };
}

/**
 * Enhanced JPEG (garment on white) → WebP-with-alpha cutout.
 */
export async function cutoutImage(enhancedJpeg: Buffer): Promise<CutoutResult> {
  const { removeBackground, distUrl } = await loadImgly();
  const blob = await removeBackground(new Blob([new Uint8Array(enhancedJpeg)], { type: 'image/jpeg' }), {
    publicPath: distUrl,
    output: { format: 'image/png' },
  });
  const png = Buffer.from(await blob.arrayBuffer());

  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  applyAlphaCurve(data);

  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] === 0) transparent++;
  const trim = computeTrim(data, info.width, info.height);

  const webp = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 90 })
    .toBuffer();

  return {
    webp,
    transparentShare: transparent / (info.width * info.height),
    width: info.width,
    height: info.height,
    trim,
  };
}
