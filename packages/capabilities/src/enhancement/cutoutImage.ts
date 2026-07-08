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
import { removeBackground } from '@imgly/background-removal-node';

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

// The lib resolves its ONNX model + resources.json from process.cwd() unless
// given an explicit publicPath — under the worker the cwd is the app root,
// not the package, so we must point at the installed dist explicitly.
const require2 = createRequire(import.meta.url);
// resolve() returns the package main inside dist/ — its dirname IS the dist
// dir that holds resources.json + the ONNX weights. ('.../package.json' is
// blocked by the package's exports map.)
const IMGLY_DIST_URL = pathToFileURL(dirname(require2.resolve('@imgly/background-removal-node'))).href + '/';

export interface CutoutResult {
  webp: Buffer;
  /** Share of pixels fully transparent after the curve — sanity signal. */
  transparentShare: number;
  width: number;
  height: number;
}

/**
 * Enhanced JPEG (garment on white) → WebP-with-alpha cutout.
 */
export async function cutoutImage(enhancedJpeg: Buffer): Promise<CutoutResult> {
  const blob = await removeBackground(new Blob([new Uint8Array(enhancedJpeg)], { type: 'image/jpeg' }), {
    publicPath: IMGLY_DIST_URL,
    output: { format: 'image/png' },
  });
  const png = Buffer.from(await blob.arrayBuffer());

  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  applyAlphaCurve(data);

  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] === 0) transparent++;

  const webp = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 90 })
    .toBuffer();

  return {
    webp,
    transparentShare: transparent / (info.width * info.height),
    width: info.width,
    height: info.height,
  };
}
