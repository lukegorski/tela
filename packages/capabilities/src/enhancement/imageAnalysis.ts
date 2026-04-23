/**
 * Image analysis helpers ported from the current production app's enhance.ts.
 *
 * - detectBgColor: median of 4-corner pixel sample → background hex color
 * - detectCropping: sample 50 pixels per edge, compare to background, ratio of
 *   "garment" pixels along each edge tells us if the garment is cut off
 *
 * Uses sharp for raw pixel access. Pure function, no DB / network.
 */
import sharp from 'sharp';

export interface BgColors {
  tl: string;
  tr: string;
  bl: string;
  br: string;
}

export interface BgDetection {
  median: string;
  corners: BgColors;
}

function toHex(rgb: number[]): string {
  return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
}

export async function detectBgColor(buffer: Buffer): Promise<BgDetection> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;

  const getPixel = (x: number, y: number) => {
    const i = (y * w + x) * ch;
    return [data[i], data[i + 1], data[i + 2]];
  };

  const cornerCoords: [number, number][] = [
    [5, 5],
    [w - 5, 5],
    [5, h - 5],
    [w - 5, h - 5],
  ];
  const pixels = cornerCoords.map(([x, y]) => getPixel(x, y));

  const median = [0, 1, 2].map((c) => {
    const sorted = pixels.map((p) => p[c]).sort((a, b) => a - b);
    return Math.round((sorted[1] + sorted[2]) / 2);
  });

  return {
    median: toHex(median),
    corners: {
      tl: toHex(pixels[0]),
      tr: toHex(pixels[1]),
      bl: toHex(pixels[2]),
      br: toHex(pixels[3]),
    },
  };
}

export interface CropResult {
  isCropped: boolean;
  croppedEdges: string[];
  edgeRatios: Record<string, number>;
}

export async function detectCropping(buffer: Buffer, bgColor: string): Promise<CropResult> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;

  const getPixel = (x: number, y: number) => {
    const i = (y * w + x) * ch;
    return [data[i], data[i + 1], data[i + 2]];
  };

  const bgR = parseInt(bgColor.slice(1, 3), 16);
  const bgG = parseInt(bgColor.slice(3, 5), 16);
  const bgB = parseInt(bgColor.slice(5, 7), 16);

  const colorDistance = (pixel: number[]) => {
    const dr = pixel[0] - bgR;
    const dg = pixel[1] - bgG;
    const db = pixel[2] - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const THRESHOLD = 30;
  const CROP_RATIO = 0.1;
  const SAMPLES = 50;

  const checkEdge = (getCoord: (i: number) => [number, number]): number => {
    let garmentPixels = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const [x, y] = getCoord(i);
      if (colorDistance(getPixel(x, y)) > THRESHOLD) garmentPixels++;
    }
    return garmentPixels / SAMPLES;
  };

  const spreadX = (i: number) => Math.round((i / (SAMPLES - 1)) * (w - 10)) + 5;
  const spreadY = (i: number) => Math.round((i / (SAMPLES - 1)) * (h - 10)) + 5;

  const edgeRatios: Record<string, number> = {
    bottom: checkEdge((i) => [spreadX(i), h - 3]),
    top: checkEdge((i) => [spreadX(i), 3]),
    left: checkEdge((i) => [3, spreadY(i)]),
    right: checkEdge((i) => [w - 3, spreadY(i)]),
  };

  const croppedEdges = Object.entries(edgeRatios)
    .filter(([, ratio]) => ratio > CROP_RATIO)
    .map(([edge]) => edge);

  return {
    isCropped: croppedEdges.length > 0,
    croppedEdges,
    edgeRatios,
  };
}

export async function pngToJpeg(pngBuffer: Buffer, quality = 85): Promise<Buffer> {
  return sharp(pngBuffer).jpeg({ quality }).toBuffer();
}
